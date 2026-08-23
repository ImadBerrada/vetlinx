import { expect, test } from "@playwright/test";

test("one account switches between personal and organization workspaces", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const stamp = Date.now();
  const email = `workspace-${testInfo.project.name}-${stamp}@vetlinx.test`;
  const password = "VetLinX-Workspace-2026";
  const organizationName = `Harbour Veterinary ${stamp}`;
  const openNavigation = async () => {
    if (testInfo.project.name === "mobile") {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
  };

  await page.goto("/register");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel("Professional name").fill("Dr. Maya Rahman");
  await page.getByLabel("Country of practice").selectOption("AE");
  await page.getByRole("button", { name: "Create professional profile" }).click();
  await expect(page).toHaveURL(/\/credentials$/);

  await page.goto("/");
  await openNavigation();
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Organization" })).toHaveCount(0);

  await page.getByRole("button", { name: /Dr\. Maya Rahman Professional/ }).click();
  await page.getByRole("menuitem", { name: /Organization workspace, Create or join/ }).click();
  await expect(page).toHaveURL(/\/employer$/);
  await expect(page.getByRole("link", { name: "Organization" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Recruitment" })).toHaveCount(0);

  await page.getByLabel("Legal name").fill(organizationName);
  await page.getByRole("button", { name: "Create organization", exact: true }).last().click();
  await expect(page.getByText("Organization created with you as its owner.")).toBeVisible();
  await openNavigation();
  await expect(page.getByRole("button", { name: new RegExp(`${organizationName} Owner`) })).toBeVisible();
  await expect(page.getByRole("link", { name: "Recruitment" })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(`${organizationName} Owner`) }).click();
  await page.getByRole("menuitem", { name: /Dr\. Maya Rahman, Professional/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await openNavigation();
  await expect(page.getByRole("link", { name: "Organization" })).toHaveCount(0);

  await page.getByRole("button", { name: /Dr\. Maya Rahman Professional/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`${organizationName}, Owner`) }).click();
  await expect(page).toHaveURL(/\/employer$/);

  await openNavigation();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/employer$/);
});
