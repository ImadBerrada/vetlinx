import { expect, test } from "@playwright/test";

test("veterinarian can create an account, build a profile, and sign back in", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `sara.${Date.now()}@vetlinx.test`;
  const password = "Verified-Career-Record-42";
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("/icon.svg")) {
      consoleErrors.push(`${message.text()} @ ${message.location().url}`);
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/register");
  await expect(page).toHaveTitle("Create your VetLinX account");
  await expect(page.getByRole("heading", { name: "Build a career record that proves itself." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  expect(consoleErrors).toEqual([]);

  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("too-short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 12 characters.")).toBeVisible();
  consoleErrors.length = 0;

  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Start your professional identity" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel("Professional name").fill("Dr. Sara Al-Hassan");
  await page.getByLabel("Country of practice").selectOption("AE");
  await expect(page.getByRole("heading", { name: "Dr. Sara Al-Hassan" })).toBeVisible();
  await page.getByRole("button", { name: "Create professional profile" }).click();
  await expect(page).toHaveURL(/\/credentials$/);
  await expect(page.getByRole("heading", { name: "Credentials", exact: true })).toBeVisible();

  await page.request.post("/api/session/logout");
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Professional profile" })).toBeVisible();
  await expect(page.getByLabel("Professional name")).toHaveValue("Dr. Sara Al-Hassan");
  await page.getByLabel("Professional name").fill("Dr. Sara Al-Hassan Updated");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Professional profile updated.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save profile" })).toBeEnabled();
  await expect(page.getByText("Dr. Sara Al-Hassan Updated").last()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Professional name")).toHaveValue("Dr. Sara Al-Hassan Updated");

  expect(consoleErrors).toEqual([]);
});
