import { expect, test } from "@playwright/test";

test("professional controls a private portfolio and exports an ATS CV", async ({ page }, testInfo) => {
  const email = `portfolio-${testInfo.project.name}-${Date.now()}@vetlinx.test`;
  await page.goto("/register");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Verified-Career-Record-42");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Professional name").fill("Dr. Nadia Mansour");
  await page.getByLabel("Country of practice").selectOption("AE");
  await page.getByRole("button", { name: "Create professional profile" }).click();

  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio & ATS CV" })).toBeVisible();
  await expect(page.getByText("Your portfolio is private.")).toBeVisible();
  await page.getByRole("button", { name: "Edit portfolio" }).click();
  await page.getByLabel("Headline").fill("Small-animal veterinarian");
  await page.getByLabel("Professional summary").fill("Evidence-led veterinary care with a focus on companion-animal wellbeing.");
  await page.getByLabel(/Specialties/).fill("SMALL_ANIMAL_MEDICINE");
  await page.getByLabel(/Species experience/).fill("CANINE, FELINE");
  await page.getByLabel(/Languages/).fill("EN, AR");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Small-animal veterinarian")).toBeVisible();
  await expect(page.getByText("Evidence-led veterinary care with a focus on companion-animal wellbeing.")).toBeVisible();
  await expect(page.getByText("Small Animal Medicine")).toBeVisible();
  await expect(page.getByText("Canine")).toBeVisible();

  const cvResponse = await page.request.get("/api/portfolio/cv");
  expect(cvResponse.ok()).toBeTruthy();
  expect(await cvResponse.text()).toContain("Dr. Nadia Mansour");
});
