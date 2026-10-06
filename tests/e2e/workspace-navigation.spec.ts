import { expect, test } from "@playwright/test";

test("one account switches between professional and organization workspaces", async ({ page }, testInfo) => {
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

  await page.goto("/register?intent=professional");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel("Professional name").fill("Dr. Maya Rahman");
  await page.getByLabel("Country of practice").selectOption("AE");
  await page.getByRole("button", { name: "Create professional profile" }).click();
  await expect(page).toHaveURL(/\/credentials$/);

  await page.goto("/");
  await openNavigation();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "My applications", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Organization" })).toHaveCount(0);

  await page.getByRole("button", { name: "Switch workspace: Professional", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Add or join an organization, Organization workspace" }).click();
  await expect(page).toHaveURL(/\/employer$/);
  await expect(page.getByRole("link", { name: "Organization" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Recruitment" })).toHaveCount(0);

  await page.getByLabel("Legal name").fill(organizationName);
  await page.getByRole("button", { name: "Create organization", exact: true }).last().click();
  await expect(page.getByText("Organization created with you as its owner.")).toBeVisible();
  await openNavigation();
  await expect(page.getByRole("button", { name: `Switch workspace: ${organizationName}`, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Recruitment" })).toBeVisible();

  await page.getByRole("button", { name: `Switch workspace: ${organizationName}`, exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Professional, Dr. Maya Rahman" }).click();
  await expect(page).toHaveURL(/\/professional$/);
  await openNavigation();
  await expect(page.getByRole("link", { name: "Organization" })).toHaveCount(0);

  await page.getByRole("button", { name: "Switch workspace: Professional", exact: true }).first().click();
  await page.getByRole("menuitem", { name: new RegExp(`${organizationName}, Owner`) }).click();
  await expect(page).toHaveURL(/\/employer$/);

  await openNavigation();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/employer$/);
});
