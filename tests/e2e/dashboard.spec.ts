import { expect, test } from "@playwright/test";

test("dashboard protects private data and displays the authenticated record", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  errors.length = 0;

  const email = `dashboard-${testInfo.project.name}-${Date.now()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("VetLinX!2026Secure");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel("Professional name").fill("Dr. Amina Khaled");
  await page.getByLabel("Country of practice").selectOption("AE");
  await page.getByRole("button", { name: "Create professional profile" }).click();
  await expect(page).toHaveURL(/\/credentials$/);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good morning, Dr. Amina Khaled" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add your first credential" })).toBeVisible();
  await expect(page.getByText("No credentials yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add credential" }).first()).toBeVisible();

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("complementary", { name: "Primary navigation" })).toBeVisible();
  }

  expect(errors).toEqual([]);
});
