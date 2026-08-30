import { expect, test } from "@playwright/test";
import path from "node:path";

test("licensing mutations reject cross-origin requests", async ({ request }) => {
  const response = await request.post(
    "/api/licensing/pathways/pathway-id/enroll",
    {
      headers: { origin: "https://attacker.example" },
    },
  );

  expect(response.status()).toBe(403);
});

test("professional discovers a pathway and sees explainable readiness", async ({
  page,
}, testInfo) => {
  await page.route("**/api/session/me", (route) =>
    route.fulfill({
      json: {
        account: { email: "amina@vetlinx.test", roles: ["PROFESSIONAL"] },
        profile: {
          id: "11111111-1111-4111-8111-111111111111",
          displayName: "Dr. Amina Khaled",
          countryCode: "AE",
        },
      },
    }),
  );
  await page.route("**/api/organizations", (route) =>
    route.fulfill({ json: { organizations: [] } }),
  );
  await page.route("**/api/licensing/jurisdictions", (route) =>
    route.fulfill({
      json: {
        jurisdictions: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            code: "AE",
            nameEn: "United Arab Emirates",
            nameAr: "الإمارات العربية المتحدة",
          },
        ],
      },
    }),
  );
  await page.route("**/api/licensing/pathways", (route) =>
    route.fulfill({
      json: {
        pathways: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            slug: "veterinary-professional-licence",
            jurisdiction: {
              code: "AE",
              nameEn: "United Arab Emirates",
              nameAr: "الإمارات العربية المتحدة",
            },
            authority: {
              code: "MOCCAE",
              nameEn: "Licensing authority",
              nameAr: "جهة الترخيص",
              websiteUrl: "https://example.test/licensing",
            },
            licenceType: {
              code: "VETERINARIAN",
              nameEn: "Veterinary professional licence",
              nameAr: "ترخيص مزاولة مهنة الطب البيطري",
              professionalTitleCode: "VETERINARIAN",
            },
            versions: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                version: 1,
                effectiveFrom: "2026-01-01",
                effectiveTo: null,
                sourceUrl: "https://example.test/licensing",
                sourceTitle: "Veterinary licensing requirements",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/api/licensing/enrollments", (route) =>
    route.fulfill({ json: { enrollments: [] } }),
  );
  await page.route("**/api/licensing/reminder-preferences", (route) =>
    route.fulfill({
      json: {
        preference: {
          accountId: "55555555-5555-4555-8555-555555555555",
          timeZone: "Asia/Dubai",
          renewalEnabled: true,
          leadDays: 90,
        },
      },
    }),
  );
  await page.route("**/api/licensing/pathways/*/eligibility", (route) =>
    route.fulfill({
      json: {
        eligibility: {
          pathwayId: "33333333-3333-4333-8333-333333333333",
          pathwayVersionId: "44444444-4444-4444-8444-444444444444",
          version: 1,
          requirements: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              code: "DEGREE",
              titleEn: "Verified degree evidence",
              titleAr: "إثبات الدرجة العلمية",
              descriptionEn: "A verified veterinary degree is required.",
              descriptionAr: "يلزم تقديم شهادة بيطرية موثقة.",
              position: 1,
              required: true,
              state: "SATISFIED",
              credentialId: "77777777-7777-4777-8777-777777777777",
              explanation:
                "Verified DEGREE evidence from AE satisfies this requirement.",
            },
          ],
          summary: { required: 1, satisfied: 1, remaining: 0, ready: true },
        },
      },
    }),
  );

  await page.goto("/licensing");
  await expect(
    page.getByRole("heading", { name: "Licensing pathways" }),
  ).toBeVisible();
  await page.getByLabel("Jurisdiction").selectOption("AE");
  await expect(
    page.getByRole("link", { name: /Veterinary professional licence/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Verified degree evidence", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/satisfies this requirement/)).toBeVisible();
  if (process.env.VETLINX_VISUAL_DIR) {
    await page.screenshot({
      path: path.join(
        process.env.VETLINX_VISUAL_DIR,
        `licensing-hub-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
  }
});
