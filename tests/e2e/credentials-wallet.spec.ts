import { expect, test } from "@playwright/test";
import path from "node:path";

test("professional can create a credential and submit private evidence for review", async ({ page }, testInfo) => {
  const email = `credential.${Date.now()}@vetlinx.test`;

  await page.goto("/register");
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Verified-Career-Record-42");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Professional name").fill("Dr. Maya Rahman");
  await page.getByLabel("Country of practice").selectOption("AE");
  await page.getByRole("button", { name: "Create professional profile" }).click();

  await expect(page).toHaveURL(/\/credentials$/);
  await expect(page.getByRole("heading", { name: "Add your first credential" })).toBeVisible();
  await page.getByRole("button", { name: "Add credential" }).click();
  await expect(page.getByRole("dialog", { name: "Add credential" })).toBeVisible();
  if (process.env.VETLINX_VISUAL_DIR) {
    await page.screenshot({
      path: path.join(process.env.VETLINX_VISUAL_DIR, `credentials-form-${testInfo.project.name}.png`),
      fullPage: false,
    });
  }

  await page.getByLabel(/Credential type/).selectOption("DEGREE");
  await page.getByLabel(/Credential title/).fill("Doctor of Veterinary Medicine");
  await page.getByLabel(/Issuing organization/).fill("Cairo University");
  await page.getByLabel(/Issuing country/).selectOption("EG");
  await page.getByLabel(/Issue date/).fill("2020-06-30");
  await page.getByLabel(/Expiry date/).fill("2019-06-30");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page.getByText("Expiry date must be after issue date.")).toBeVisible();

  await page.getByLabel(/Expiry date/).fill("");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page.getByRole("heading", { name: "Doctor of Veterinary Medicine" })).toBeVisible();
  await expect(page.getByLabel("Your credentials").getByText("Self-declared", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Submit details" }).click();
  await expect(page.getByText("Details submitted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start evidence" }).click();
  await expect(page.getByRole("dialog", { name: "Support this credential" })).toBeVisible();
  await page.getByLabel("Evidence file").setInputFiles({
    name: "dvm-degree.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nVetLinX browser evidence"),
  });
  await page.getByRole("button", { name: "Upload evidence" }).click();
  await expect(page.getByText("dvm-degree.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText(/File format validated/)).toBeVisible();
  if (process.env.VETLINX_VISUAL_DIR) {
    await page.screenshot({
      path: path.join(process.env.VETLINX_VISUAL_DIR, `evidence-ready-${testInfo.project.name}.png`),
      fullPage: false,
    });
  }
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Submitted for review", { exact: true })).toBeVisible();
  await expect(page.getByText("Evidence submitted for review. VetLinX has not verified this credential yet.")).toBeVisible();
  if (process.env.VETLINX_VISUAL_DIR) {
    await page.screenshot({
      path: path.join(process.env.VETLINX_VISUAL_DIR, `credentials-submitted-${testInfo.project.name}.png`),
      fullPage: true,
    });
  }

  await page.reload();
  await expect(page.getByRole("heading", { name: "Doctor of Veterinary Medicine" })).toBeVisible();
  await expect(page.getByText("Details submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Submitted for review", { exact: true })).toBeVisible();
});
