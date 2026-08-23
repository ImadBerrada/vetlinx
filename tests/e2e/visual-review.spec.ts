import { expect, test } from "@playwright/test";

test("auth and onboarding surfaces render cleanly", async ({ page }, testInfo) => {
  const email = `visual.${testInfo.project.name}.${Date.now()}@vetlinx.test`;

  await page.goto("/register");
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("register.png"), fullPage: true });

  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Verified-Career-Record-42");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Start your professional identity" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("onboarding.png"), fullPage: true });
});
