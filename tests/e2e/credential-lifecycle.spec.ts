import { expect, test, type Page } from "@playwright/test";
import type {
  ApiCredential,
  ApiCredentialLifecycleReview,
} from "../../src/lib/server/vetlinx-api";

const requestId = "06ddc2cf-20c2-4b7c-a248-f1de4b4376ac";
const credential: ApiCredential = {
  id: "b1a24a5f-2fcb-4eb6-a71e-d8e47d303c7d",
  professionalProfileId: "profile",
  typeCode: "PROFESSIONAL_LICENCE",
  title: "Veterinary registration",
  issuingOrganization: "Fixture authority",
  countryCode: "AE",
  issueDate: "2020-01-01T00:00:00Z",
  expiryDate: "2030-01-01T00:00:00Z",
  status: "VERIFIED",
  submittedAt: "2026-01-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  lifecycleHistory: [],
};
const note = "Issuer independently confirmed the registration was withdrawn.";
const history = {
  id: "history",
  fromStatus: "VERIFIED" as const,
  toStatus: "REVOKED" as const,
  reason: note,
  source: "ASSIGNED_REVIEWER",
  verificationRequestId: requestId,
  createdAt: "2026-10-06T08:00:00Z",
};
async function session(page: Page) {
  await page.route("**/api/session/me", (route) =>
    route.fulfill({
      json: {
        account: {
          accountId: "reviewer",
          email: "reviewer@example.test",
          roles: ["REVIEWER"],
        },
        profile: {
          id: "profile",
          displayName: "Dr. Maya Rahman",
          countryCode: "AE",
        },
        organizations: [],
      },
    }),
  );
  await page.route("**/api/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  await page.route("**/api/organizations", (route) =>
    route.fulfill({ json: { organizations: [] } }),
  );
}
test("reviewer confirms with a focused reason field, sees conflict, and refreshes durable validity history", async ({
  page,
}, testInfo) => {
  await session(page);
  let record: ApiCredentialLifecycleReview = {
    requestId,
    originalReviewStatus: "VERIFIED",
    reviewedAt: "2026-01-01T00:00:00Z",
    professionalName: "Dr. Maya Rahman",
    canRevoke: true,
    credential,
  };
  let posts = 0;
  await page.route("**/api/reviews/lifecycle", (route) =>
    route.fulfill({ json: { records: [record] } }),
  );
  await page.route(`**/api/reviews/${requestId}/revoke`, async (route) => {
    posts += 1;
    expect(route.request().postDataJSON()).toEqual({ reason: note });
    record = {
      ...record,
      canRevoke: false,
      credential: {
        ...credential,
        status: "REVOKED",
        effectiveStatus: "REVOKED",
        lifecycleHistory: [history],
      },
    };
    await route.fulfill({
      status: 409,
      json: {
        message:
          "This credential has already been revoked or changed. Refresh its history.",
      },
    });
  });
  await page.goto("/review/credentials");
  await page
    .getByRole("button", { name: "Revoke verification", exact: true })
    .click();
  await expect(page.getByLabel("Revocation reason")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Confirm revocation" }),
  ).toBeDisabled();
  expect(posts).toBe(0);
  await page.getByLabel("Revocation reason").fill(note);
  await page.getByRole("button", { name: "Confirm revocation" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Refresh its history",
  );
  await expect(page.getByLabel("Revocation reason")).toHaveValue(note);
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Refresh validity" }).click();
  await expect(
    page.getByRole("main").getByText("revoked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revoke verification" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Original review: approved/)).toBeVisible();
  await page.getByText("Credential validity history", { exact: true }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("credential-validity.png"),
    fullPage: true,
  });
});
test("successful revocation updates the current badge while preserving the original approval", async ({
  page,
}) => {
  await session(page);
  let record: ApiCredentialLifecycleReview = {
    requestId,
    originalReviewStatus: "VERIFIED",
    reviewedAt: null,
    professionalName: "Dr. Maya Rahman",
    canRevoke: true,
    credential,
  };
  await page.route("**/api/reviews/lifecycle", (route) =>
    route.fulfill({ json: { records: [record] } }),
  );
  await page.route(`**/api/reviews/${requestId}/revoke`, async (route) => {
    record = {
      ...record,
      canRevoke: false,
      credential: {
        ...credential,
        status: "REVOKED",
        lifecycleHistory: [history],
      },
    };
    await route.fulfill({ json: { credential: record.credential } });
  });
  await page.goto("/review/credentials");
  await page.getByRole("button", { name: "Revoke verification" }).click();
  await page.getByLabel("Revocation reason").fill(note);
  await page.getByRole("button", { name: "Confirm revocation" }).click();
  await expect(
    page.getByRole("main").getByText("revoked", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Original review: approved.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Revocation reason")).toHaveCount(0);
});
test("governed review authorization failures give sign-in or a security recovery action", async ({
  page,
}) => {
  await session(page);
  await page.route("**/api/reviews/lifecycle", (route) =>
    route.fulfill({ status: 401, json: { message: "Sign in again." } }),
  );
  await page.goto("/review/credentials");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Freview%2Fcredentials/);
  await page.unroute("**/api/reviews/lifecycle");
  await page.route("**/api/reviews/lifecycle", (route) =>
    route.fulfill({
      status: 403,
      json: {
        message: "Set up two-step verification before using trust operations.",
      },
    }),
  );
  await page.goto("/review/credentials");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "two-step verification",
  );
  await expect(
    page.getByRole("link", { name: "Review two-step verification" }),
  ).toHaveAttribute("href", "/settings/security/mfa");
  await expect(
    page.getByRole("button", { name: "Revoke verification" }),
  ).toHaveCount(0);
});
test("wallet shows current expired and revoked validity instead of historical verified labels", async ({
  page,
}) => {
  await session(page);
  const expired = {
    ...credential,
    id: "expired",
    title: "Expired registration",
    status: "VERIFIED",
    effectiveStatus: "EXPIRED",
    expiryDate: "2026-01-01T00:00:00Z",
    lifecycleHistory: [
      {
        ...history,
        id: "expiry",
        toStatus: "EXPIRED",
        source: "EXPIRY_WORKER",
        reason: "Expired after 2026-01-01; valid through that UTC date.",
        verificationRequestId: null,
      },
    ],
  };
  const revoked = {
    ...credential,
    title: "Revoked registration",
    status: "REVOKED",
    effectiveStatus: "REVOKED",
    lifecycleHistory: [history],
  };
  await page.route("**/api/credentials", (route) =>
    route.fulfill({ json: { credentials: [expired, revoked] } }),
  );
  await page.route("**/api/verification-requests", (route) =>
    route.fulfill({
      json: {
        verificationRequests: [expired, revoked].map((c) => ({
          id: `review-${c.id}`,
          credentialId: c.id,
          status: "VERIFIED",
          decisions: [],
          evidence: [],
          updatedAt: "2026-01-01T00:00:00Z",
        })),
      },
    }),
  );
  await page.goto("/credentials");
  await expect(
    page.getByText("Expired registration", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Verified by VetLinX", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("main")
      .getByText("Not current verified evidence", { exact: true }),
  ).toHaveCount(2);
  await page
    .getByText("Credential validity history", { exact: true })
    .last()
    .click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh validity" }).click();
  await expect(
    page.getByText("Revoked registration", { exact: true }),
  ).toBeVisible();
});
