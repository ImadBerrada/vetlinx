import { expect, test, type Page } from "@playwright/test";

const pathwayId = "33333333-3333-4333-8333-333333333333";

for (const locale of ["en", "ar"] as const) {
  test(`licensing hub visual contract (${locale})`, async ({ page, context }) => {
    await context.addCookies([{ name: "vetlinx_locale", value: locale, url: "http://localhost:3000" }]);
    await mockLicensingHub(page);
    await page.goto("/licensing");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(page.getByRole("heading", { name: locale === "ar" ? "مسارات الترخيص" : "Licensing pathways" })).toBeVisible();
    await expect(page).toHaveScreenshot(`licensing-hub-${locale}.png`, {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
    });
  });
}

async function mockLicensingHub(page: Page) {
  await page.route("**/api/session/me", (route) => route.fulfill({ json: { account: { email: "amina@vetlinx.test", roles: ["PROFESSIONAL"] }, profile: { id: "11111111-1111-4111-8111-111111111111", displayName: "Dr. Amina Khaled", countryCode: "AE" } } }));
  await page.route("**/api/organizations", (route) => route.fulfill({ json: { organizations: [] } }));
  await page.route("**/api/licensing/jurisdictions", (route) => route.fulfill({ json: { jurisdictions: [{ id: "22222222-2222-4222-8222-222222222222", code: "AE", nameEn: "United Arab Emirates", nameAr: "الإمارات العربية المتحدة" }] } }));
  await page.route("**/api/licensing/pathways", (route) => route.fulfill({ json: { pathways: [{ id: pathwayId, slug: "veterinary-professional-licence", jurisdiction: { code: "AE", nameEn: "United Arab Emirates", nameAr: "الإمارات العربية المتحدة" }, authority: { code: "MOCCAE", nameEn: "Licensing authority", nameAr: "جهة الترخيص", websiteUrl: "https://example.test/licensing" }, licenceType: { code: "VETERINARIAN", nameEn: "Veterinary professional licence", nameAr: "ترخيص مزاولة مهنة الطب البيطري", professionalTitleCode: "VETERINARIAN" }, versions: [{ id: "44444444-4444-4444-8444-444444444444", version: 1, effectiveFrom: "2026-01-01", effectiveTo: null, sourceUrl: "https://example.test/licensing", sourceTitle: "Veterinary licensing requirements" }] }] } }));
  await page.route("**/api/licensing/enrollments", (route) => route.fulfill({ json: { enrollments: [] } }));
  await page.route("**/api/licensing/reminder-preferences", (route) => route.fulfill({ json: { preference: { accountId: "55555555-5555-4555-8555-555555555555", timeZone: "Asia/Dubai", renewalEnabled: true, leadDays: 90 } } }));
  await page.route("**/api/licensing/pathways/*/eligibility", (route) => route.fulfill({ json: { eligibility: { pathwayId, pathwayVersionId: "44444444-4444-4444-8444-444444444444", version: 1, requirements: [{ id: "66666666-6666-4666-8666-666666666666", code: "DEGREE", titleEn: "Verified degree evidence", titleAr: "إثبات الدرجة العلمية", descriptionEn: "A verified veterinary degree is required.", descriptionAr: "يلزم تقديم شهادة بيطرية موثقة.", position: 1, required: true, state: "SATISFIED", credentialId: "77777777-7777-4777-8777-777777777777", explanation: "Verified DEGREE evidence from AE satisfies this requirement." }], summary: { required: 1, satisfied: 1, remaining: 0, ready: true } } } }));
}
