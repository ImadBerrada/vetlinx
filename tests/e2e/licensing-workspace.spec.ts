import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
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

test("professional starts a pathway, links evidence, and resumes it", async ({
  page,
}, testInfo) => {
  let enrolled = false;
  let linked = false;
  const pathwayId = "33333333-3333-4333-8333-333333333333";
  const enrollmentId = "88888888-8888-4888-8888-888888888888";

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
  await page.route("**/api/credentials", (route) =>
    route.fulfill({
      json: {
        credentials: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            professionalProfileId: "11111111-1111-4111-8111-111111111111",
            typeCode: "DEGREE",
            title: "Verified degree",
            issuingOrganization: "Cairo University",
            countryCode: "AE",
            issueDate: "2020-06-30",
            expiryDate: null,
            status: "VERIFIED",
            submittedAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      },
    }),
  );
  await page.route("**/api/licensing/enrollments", (route) =>
    route.fulfill({
      json: { enrollments: enrolled ? [enrollmentFixture(linked)] : [] },
    }),
  );
  await page.route(`**/api/licensing/enrollments/${enrollmentId}`, (route) =>
    route.fulfill({ json: { enrollment: enrollmentFixture(linked) } }),
  );
  await page.route("**/api/licensing/enrollments/*/requirements/*/credential", async (route) => {
    if (route.request().method() === "PUT") linked = true;
    await route.fulfill({
      json: {
        progress: {
          id: "66666666-6666-4666-8666-666666666666",
          code: "DEGREE",
          titleEn: "Verified degree evidence",
          titleAr: "إثبات الدرجة العلمية",
          descriptionEn: "A verified veterinary degree is required.",
          descriptionAr: "يلزم تقديم شهادة بيطرية موثقة.",
          position: 1,
          required: true,
          state: linked ? "SATISFIED" : "MISSING",
          credentialId: linked ? "77777777-7777-4777-8777-777777777777" : undefined,
          note: linked ? "Verified DEGREE evidence from AE satisfies this requirement." : undefined,
        },
      },
    });
  });
  await page.route(`**/api/licensing/pathways/${pathwayId}/enroll`, async (route) => {
    enrolled = true;
    await route.fulfill({ status: 201, json: { enrollment: enrollmentFixture(false) } });
  });
  await page.route(`**/api/licensing/pathways/${pathwayId}/eligibility`, (route) =>
    route.fulfill({ json: { eligibility: eligibilityFixture() } }),
  );
  await page.route(`**/api/licensing/pathways/${pathwayId}`, (route) =>
    route.fulfill({ json: { pathway: pathwayFixture() } }),
  );

  await page.goto(`/licensing/pathways/${pathwayId}`);
  await page.getByRole("button", { name: "Start pathway" }).click();
  await expect(page.getByText("Pathway version 1")).toBeVisible();
  await page.getByRole("button", { name: "Use verified degree" }).click();
  await page.reload();
  await expect(page.getByText("Requirement satisfied")).toBeVisible();
  await expect(page.getByText("Verified degree", { exact: true })).toBeVisible();
  if (process.env.VETLINX_VISUAL_DIR) {
    await page.screenshot({
      path: path.join(
        process.env.VETLINX_VISUAL_DIR,
        `licensing-pathway-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
  }
});

test("curator drafts while reviewer publishes a pathway", async ({ browser }, testInfo) => {
  const pathwayId = "33333333-3333-4333-8333-333333333333";
  const curatorContext = await browser.newContext();
  const curator = await curatorContext.newPage();
  await mockTrustSession(curator, "LICENSING_CURATOR");
  await curator.route("**/api/review/licensing/pathways", (route) =>
    route.fulfill({ json: { pathways: [adminPathwayFixture("DRAFT")] } }),
  );
  await curator.goto("/review/licensing");
  await curator.getByRole("button", { name: "Create pathway" }).click();
  await expect(curator.getByRole("dialog", { name: "Create licensing pathway" })).toBeVisible();
  await expect(curator.getByRole("button", { name: "Publish pathway" })).toHaveCount(0);

  const reviewerContext = await browser.newContext();
  const reviewer = await reviewerContext.newPage();
  await mockTrustSession(reviewer, "LICENSING_REVIEWER");
  await reviewer.route(`**/api/review/licensing/pathways/${pathwayId}`, (route) =>
    route.fulfill({ json: { pathway: adminPathwayFixture("IN_REVIEW") } }),
  );
  await reviewer.route("**/api/review/licensing/versions/*/publish", (route) =>
    route.fulfill({
      json: {
        id: "44444444-4444-4444-8444-444444444444",
        status: "PUBLISHED",
        version: 1,
      },
    }),
  );
  await reviewer.goto(`/review/licensing/pathways/${pathwayId}`);
  await reviewer.getByRole("button", { name: "Publish pathway" }).click();
  await expect(reviewer.getByText("Published version 1")).toBeVisible();
  if (process.env.VETLINX_VISUAL_DIR) {
    await reviewer.screenshot({
      path: path.join(
        process.env.VETLINX_VISUAL_DIR,
        `licensing-review-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
  }

  await curatorContext.close();
  await reviewerContext.close();
});

function pathwayFixture() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "veterinary-professional-licence",
    active: true,
    jurisdiction: {
      id: "22222222-2222-4222-8222-222222222222",
      code: "AE",
      nameEn: "United Arab Emirates",
      nameAr: "الإمارات العربية المتحدة",
      active: true,
    },
    authority: {
      id: "99999999-9999-4999-8999-999999999999",
      code: "MOCCAE",
      nameEn: "Licensing authority",
      nameAr: "جهة الترخيص",
      websiteUrl: "https://example.test/licensing",
      active: true,
    },
    licenceType: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      code: "VETERINARIAN",
      nameEn: "Veterinary professional licence",
      nameAr: "ترخيص مزاولة مهنة الطب البيطري",
      professionalTitleCode: "VETERINARIAN",
      active: true,
    },
    versions: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        version: 1,
        status: "PUBLISHED",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        sourceUrl: "https://example.test/licensing",
        sourceTitle: "Veterinary licensing requirements",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        requirements: [eligibilityFixture().requirements[0]],
      },
    ],
  };
}

function eligibilityFixture() {
  return {
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
        explanation: "Verified DEGREE evidence from AE satisfies this requirement.",
      },
    ],
    summary: { required: 1, satisfied: 1, remaining: 0, ready: true },
  };
}

function enrollmentFixture(linked: boolean) {
  const pathway = pathwayFixture();
  const requirement = eligibilityFixture().requirements[0];
  return {
    id: "88888888-8888-4888-8888-888888888888",
    professionalProfileId: "11111111-1111-4111-8111-111111111111",
    pathwayVersionId: "44444444-4444-4444-8444-444444444444",
    status: "ACTIVE",
    startedAt: "2026-08-30T08:00:00.000Z",
    submittedExternallyAt: null,
    completedAt: null,
    pathwayVersion: { ...pathway.versions[0], pathway, requirements: [requirement] },
    requirements: [
      {
        ...requirement,
        state: linked ? "SATISFIED" : "MISSING",
        credentialId: linked ? "77777777-7777-4777-8777-777777777777" : undefined,
        note: linked ? "Verified DEGREE evidence from AE satisfies this requirement." : "No credential is linked to this requirement.",
        evaluatedAt: "2026-08-30T08:00:00.000Z",
      },
    ],
    externalApplication: null,
    professionalLicence: null,
    readiness: {
      required: 1,
      satisfied: linked ? 1 : 0,
      needsReview: 0,
      remaining: linked ? 0 : 1,
      ready: linked,
    },
  };
}

async function mockTrustSession(
  page: Page,
  role: "LICENSING_CURATOR" | "LICENSING_REVIEWER",
) {
  await page.route("**/api/session/me", (route) =>
    route.fulfill({
      json: {
        account: { email: `${role.toLowerCase()}@vetlinx.test`, roles: [role] },
        profile: null,
      },
    }),
  );
  await page.route("**/api/organizations", (route) =>
    route.fulfill({ json: { organizations: [] } }),
  );
}

function adminPathwayFixture(status: "DRAFT" | "IN_REVIEW" | "PUBLISHED") {
  const pathway = pathwayFixture();
  return {
    ...pathway,
    createdAt: "2026-08-30T08:00:00.000Z",
    updatedAt: "2026-08-30T08:00:00.000Z",
    versions: pathway.versions.map((version) => ({
      ...version,
      requirements: version.requirements?.map((requirement) => ({
        ...requirement,
        rule: {
          kind: "VERIFIED_CREDENTIAL",
          credentialTypeCode: "DEGREE",
        },
      })),
      status,
      reviewedByAccountId: null,
      createdAt: "2026-08-30T08:00:00.000Z",
      updatedAt: "2026-08-30T08:00:00.000Z",
    })),
  };
}
