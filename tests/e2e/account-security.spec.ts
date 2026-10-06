import { expect, test } from "@playwright/test";

test("account recovery gives a generic response without revealing whether an account exists", async ({ page }) => {
  await page.route("**/api/account/password-reset/request", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ email: "recover@example.test" });
    await route.fulfill({ json: { message: "If an active account uses that email, a password reset link will be sent. Check your inbox and spam folder." } });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill("recover@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an active account uses that email");
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
});

test("password reset scrubs the link token, checks confirmation, and submits only after user action", async ({ page }) => {
  const token = "a".repeat(96);
  let submissions = 0;
  await page.route("**/api/account/password-reset/complete", async (route) => {
    submissions += 1;
    expect(route.request().postDataJSON()).toEqual({ token, password: "A-New-Secure-Password-2026" });
    await route.fulfill({ json: { message: "Password updated. All sessions have been signed out. Sign in with your new password." } });
  });
  await page.goto(`/reset-password#token=${token}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(submissions).toBe(0);
  await page.getByLabel("New password", { exact: true }).fill("A-New-Secure-Password-2026");
  await page.getByLabel("Confirm new password", { exact: true }).fill("A-Different-Secure-Password-2026");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Your passwords do not match.");
  expect(submissions).toBe(0);
  await page.getByLabel("Confirm new password", { exact: true }).fill("A-New-Secure-Password-2026");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("All sessions have been signed out");
  expect(submissions).toBe(1);
});

test("email links require explicit confirmation and invalid links give a recovery action", async ({ page }) => {
  const token = "b".repeat(96);
  let submissions = 0;
  await page.route("**/api/account/email-verification/complete", async (route) => {
    submissions += 1;
    expect(route.request().postDataJSON()).toEqual({ token });
    await route.fulfill({ json: { message: "Your email is verified. You can return to your workspace." } });
  });
  await page.goto(`/verify-email#token=${token}`);
  await expect(page).toHaveURL(/\/verify-email$/);
  expect(submissions).toBe(0);
  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.getByRole("status")).toContainText("Your email is verified");
  expect(submissions).toBe(1);
  // Old links remain usable while new deliveries use fragments only.
  await page.goto(`/verify-email?token=${token}`);
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole("button", { name: "Verify my email" })).toBeVisible();
  await page.goto("/reset-password?token=incomplete");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("This link is invalid or incomplete");
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});

test("settings separates contact verification from credentials and manages device sessions", async ({ page }, testInfo) => {
  const first = { id: "6c0a1c39-e32e-4b83-972d-34878dafb8e7", current: true, device: "Chrome on this device", lastActiveAt: "2026-10-06T08:00:00Z", expiresAt: "2026-11-06T08:00:00Z" };
  const second = { ...first, id: "4e79407d-e803-439d-9cbe-90216782ea9b", current: false, device: "Other browser" };
  let sessions = [first, second];
  await page.route("**/api/session/me", (route) => route.fulfill({ json: { account: { accountId: "test", email: "owner@example.test", roles: [] }, profile: { displayName: "Dr. Maya Rahman" }, owner: { displayName: "Maya Rahman" }, organizations: [] } }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { notifications: [] } }));
  await page.route("**/api/account/security", (route) => route.fulfill({ json: { security: { email: "owner@example.test", emailVerifiedAt: null } } }));
  await page.route("**/api/account/sessions", (route) => route.fulfill({ json: { sessions } }));
  await page.route("**/api/account/email-verification/request", (route) => route.fulfill({ json: { result: { message: "A verification link will be sent." } } }));
  await page.route(`**/api/account/sessions/${second.id}`, async (route) => {
    expect(route.request().method()).toBe("DELETE"); sessions = [first];
    await route.fulfill({ json: { result: { message: "Session signed out." } } });
  });
  await page.route("**/api/account/sessions/revoke-all", (route) => route.fulfill({ json: { result: { message: "All devices signed out." } } }));
  await page.goto("/settings/security");
  await expect(page.getByRole("heading", { name: "Settings & security", exact: true })).toBeVisible();
  await expect(page.getByText("This is separate from professional credential or clinic verification.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Send verification email" }).click();
  await expect(page.getByRole("status")).toHaveText("A verification link will be sent.");
  await page.getByRole("button", { name: "Sign out device", exact: true }).click();
  await expect(page.getByText("Other browser", { exact: true })).toHaveCount(0);
  await expect(page.getByText("This session", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.screenshot({ path: testInfo.outputPath("account-security.png"), fullPage: true });
  await page.getByRole("button", { name: "Sign out all devices", exact: true }).click();
  await expect(page.getByText("Sign out every device, including this one?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yes, sign out all devices" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
