import { expect, test, type Page } from "@playwright/test";

const qrDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvN0AAAAASUVORK5CYII=";
const recoveryCodes = Array.from({ length: 10 }, (_, index) => `00000000-00000000-00000000-${String(index).padStart(8, "0")}`);
async function shell(page: Page) {
  await page.route("**/api/session/me", (route) => route.fulfill({ json: { account: { accountId: "test", email: "mfa@example.test", roles: ["REVIEWER"] }, profile: { displayName: "Dr. Maya Rahman" }, owner: { displayName: "Maya Rahman" }, organizations: [] } }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { notifications: [] } }));
}

test("authenticator setup shows private recovery codes once and accepts a later step-up", async ({ page }, testInfo) => {
  await shell(page);
  let enabled = false;
  let recentUntil: string | null = null;
  await page.route("**/api/account/mfa", (route) => route.fulfill({ json: { mfa: { enabledAt: enabled ? "2026-10-06T08:00:00Z" : null, recoveryCodesRemaining: 10, recentUntil, lockedUntil: null, requiredForPrivilegedActions: true } } }));
  await page.route("**/api/account/mfa/setup", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ password: "Current-Mfa-Password-2026" });
    await route.fulfill({ json: { result: { secret: "DEMONSTRATIONKEY", qrDataUrl, expiresAt: "2060-10-06T08:10:00Z" } } });
  });
  await page.route("**/api/account/mfa/confirm", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ code: "123456" }); enabled = true;
    await route.fulfill({ json: { result: { recoveryCodes, message: "Two-step verification is enabled. Save these recovery codes now." } } });
  });
  await page.route("**/api/account/mfa/step-up", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ code: "654321" }); recentUntil = "2060-10-06T08:15:00Z";
    await route.fulfill({ json: { result: { message: "Identity confirmed for the next 15 minutes." } } });
  });
  await page.goto("/settings/security/mfa");
  await page.getByLabel("Current password").fill("Current-Mfa-Password-2026");
  await page.getByRole("button", { name: "Start setup", exact: true }).click();
  await expect(page.getByAltText("Private authenticator setup QR code")).toBeVisible();
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Enable two-step verification" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes now" })).toBeVisible();
  await expect(page.getByText(recoveryCodes[0], { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Save your recovery codes now" })).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("mfa-recovery-codes.png"), fullPage: true });
  await page.getByRole("button", { name: "I have saved my codes" }).click();
  await expect(page.getByText(recoveryCodes[0], { exact: false })).toHaveCount(0);
  await expect(page.getByAltText("Private authenticator setup QR code")).toHaveCount(0);
  await page.getByLabel("Authenticator or recovery code", { exact: true }).fill("654321");
  await page.getByRole("button", { name: "Confirm identity for 15 minutes" }).click();
  await expect(page.getByRole("status")).toHaveText("Identity confirmed for the next 15 minutes.");
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => /mfa|secret|recovery/i.test(key)))).toBe(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Confirm your identity", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Save your recovery codes now" })).toHaveCount(0);
});

test("replacement and disable need explicit password and proof, with errors preserving current settings", async ({ page }) => {
  await shell(page);
  await page.route("**/api/account/mfa", (route) => route.fulfill({ json: { mfa: { enabledAt: "2026-10-06T08:00:00Z", recoveryCodesRemaining: 8, recentUntil: null, lockedUntil: null, requiredForPrivilegedActions: false } } }));
  let replacements = 0;
  await page.route("**/api/account/mfa/recovery-codes", async (route) => { replacements++; expect(route.request().postDataJSON()).toEqual({ password: "Current-Mfa-Password-2026", code: "123456" }); await route.fulfill({ json: { result: { recoveryCodes, message: "Save your new recovery codes. All previous recovery codes are invalid." } } }); });
  await page.route("**/api/account/mfa/disable", (route) => route.fulfill({ status: 403, json: { message: "This code is invalid, expired, or already used." } }));
  await page.goto("/settings/security/mfa");
  await page.getByRole("button", { name: "Generate new recovery codes" }).click();
  await expect(page.getByText("All your previous recovery codes will stop working.", { exact: false })).toBeVisible();
  expect(replacements).toBe(0);
  const replacement = page.locator("form").filter({ has: page.getByRole("button", { name: "Replace recovery codes" }) });
  await replacement.getByLabel("Current password").fill("Current-Mfa-Password-2026");
  await replacement.getByLabel("Authenticator or recovery code").fill("123456");
  await replacement.getByRole("button", { name: "Replace recovery codes" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes now" })).toBeVisible();
  await page.getByRole("button", { name: "I have saved my codes" }).click();
  await page.getByRole("button", { name: "Disable two-step verification", exact: true }).click();
  const disable = page.locator("form").filter({ has: page.getByRole("button", { name: "Confirm disable and sign out" }) });
  await disable.getByLabel("Current password").fill("Current-Mfa-Password-2026");
  await disable.getByLabel("Authenticator or recovery code").fill("123456");
  await disable.getByRole("button", { name: "Confirm disable and sign out" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("This code is invalid, expired, or already used.");
  await expect(page.getByText("Two-step verification enabled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep current settings" }).click();
  await expect(page.getByRole("button", { name: "Confirm disable and sign out" })).toHaveCount(0);
});

test("security settings recover from an initial network failure", async ({ page }) => {
  await shell(page);
  let attempts = 0;
  await page.route("**/api/account/mfa", (route) => {
    attempts++;
    return route.fulfill(attempts === 1 ? { status: 503, json: { message: "Security settings are temporarily unavailable." } } : { json: { mfa: { enabledAt: null, recoveryCodesRemaining: 0, recentUntil: null, lockedUntil: null, requiredForPrivilegedActions: false } } });
  });
  await page.goto("/settings/security/mfa");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Security settings are temporarily unavailable.");
  await expect(page.getByText("Loading two-step verification…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry loading security settings" }).click();
  await expect(page.getByRole("button", { name: "Start setup", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("sign-in completes the MFA challenge before preserving a return destination", async ({ page }) => {
  await shell(page);
  const challengeToken = "a".repeat(96);
  await page.route("**/api/session/login", (route) => route.fulfill({ json: { mfaRequired: true, challengeToken, expiresIn: 300 } }));
  let attempts = 0;
  await page.route("**/api/session/mfa", async (route) => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ challengeToken, code: "123456" });
    await route.fulfill(attempts === 1 ? { status: 401, json: { message: "The code or sign-in challenge is invalid or expired." } } : { json: { account: { email: "mfa@example.test" }, next: "/professional" } });
  });
  await page.route("**/api/account/security", (route) => route.fulfill({ json: { security: { email: "mfa@example.test", emailVerifiedAt: null } } }));
  await page.route("**/api/account/sessions", (route) => route.fulfill({ json: { sessions: [] } }));
  await page.goto("/login?returnTo=%2Fsettings%2Fsecurity");
  await page.getByLabel("Email", { exact: true }).fill("mfa@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Current-Mfa-Password-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm your sign-in" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByLabel("Authenticator or recovery code").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("The code or sign-in challenge is invalid or expired.");
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
});
