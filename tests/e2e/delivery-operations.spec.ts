import { expect, test } from "@playwright/test";

const activeId = "a58f5b39-9727-4f40-bc9e-98895ead9a36";
const expiredId = "94660928-31ba-4bd9-8446-0f5ba8438a84";
const eventId = "85251b04-2ba1-4c1d-94c9-b051261cc51b";
const statusFixture = () => ({ healthy: false, heartbeat: { lastSeenAt: "2026-10-06T08:00:00Z", lastSucceededAt: "2026-10-06T07:59:00Z", lastError: "private-fixture-error" }, emailStates: [{ state: "PENDING", _count: { _all: 1 } }, { state: "FAILED", _count: { _all: 2 } }], eventStates: [{ state: "FAILED", _count: { _all: 1 } }], oldestPendingEmailAt: "2026-10-06T07:00:00Z", oldestPendingEventAt: null, failedEmail: [{ id: activeId, attempts: 5, createdAt: "2026-10-06T06:00:00Z", expiresAt: "2099-01-01T00:00:00Z" }, { id: expiredId, attempts: 5, createdAt: "2026-10-06T05:00:00Z", expiresAt: "2001-01-01T00:00:00Z" }], failedEvents: [{ id: eventId, eventId: "304e719f-a744-4ae4-84c7-84d11ec79d67", attempts: 5, createdAt: "2026-10-06T04:00:00Z" }] });

test("delivery operations redacts details and confirms retries while expired email is blocked", async ({ page }, testInfo) => {
  await page.route("**/api/session/me", (route) => route.fulfill({ json: { account: { accountId: "fixture", email: "operations@example.test", roles: ["OPERATIONS_ADMIN"] }, profile: { displayName: "Platform operator" }, owner: null, organizations: [] } }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { notifications: [] } }));
  const status = { ...statusFixture(), unsupportedEventCount: 2 };
  let retries = 0;
  await page.route("**/api/operations/delivery", (route) => route.fulfill({ json: { status } }));
  await page.route(`**/api/operations/delivery/email/${activeId}/retry`, async (route) => {
    expect(route.request().method()).toBe("POST"); retries += 1;
    status.failedEmail = status.failedEmail.filter((item) => item.id !== activeId);
    await route.fulfill({ json: { result: { queued: true } } });
  });
  await page.goto("/operations/delivery");
  await expect(page.getByText("Worker needs attention", { exact: true })).toBeVisible();
  await expect(page.getByText("private-fixture-error", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Events awaiting a handler" })).toBeVisible();
  await expect(page.getByText("2 pending events have no supported delivery handler.", { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("delivery-operations.png"), fullPage: true });
  const emailQueue = page.getByRole("region", { name: "Email delivery queue" });
  const expired = emailQueue.getByRole("listitem").filter({ hasText: expiredId });
  await expect(expired.getByRole("button", { name: "Retry delivery" })).toBeDisabled();
  const active = emailQueue.getByRole("listitem").filter({ hasText: activeId });
  await active.getByRole("button", { name: "Retry delivery" }).click();
  expect(retries).toBe(0);
  await active.getByRole("button", { name: "Keep unchanged" }).click();
  expect(retries).toBe(0);
  await active.getByRole("button", { name: "Retry delivery" }).click();
  await active.getByRole("button", { name: "Confirm retry" }).click();
  await expect(page.getByRole("status")).toContainText("queued for retry");
  await expect(emailQueue.getByRole("listitem").filter({ hasText: activeId })).toHaveCount(0);
  expect(retries).toBe(1);
});

test("non-operations accounts cannot see or load the delivery queue", async ({ page }) => {
  let queueRequests = 0;
  await page.route("**/api/session/me", (route) => route.fulfill({ json: { account: { accountId: "fixture", email: "owner@example.test", roles: [] }, profile: null, owner: { displayName: "Maya Rahman" }, organizations: [] } }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { notifications: [] } }));
  await page.route("**/api/operations/delivery", (route) => { queueRequests += 1; return route.fulfill({ json: { status: statusFixture() } }); });
  await page.goto("/operations/delivery");
  await expect(page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Email delivery queue" })).toHaveCount(0);
  expect(queueRequests).toBe(0);
});

test("a concurrent delivery change blocks repeat retries until the operator refreshes", async ({ page }) => {
  await page.route("**/api/session/me", (route) => route.fulfill({ json: { account: { accountId: "fixture", email: "operations@example.test", roles: ["OPERATIONS_ADMIN"] }, profile: null, owner: null, organizations: [] } }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { notifications: [] } }));
  const status = statusFixture();
  let retries = 0;
  await page.route("**/api/operations/delivery", (route) => route.fulfill({ json: { status } }));
  await page.route(`**/api/operations/delivery/email/${activeId}/retry`, async (route) => {
    retries += 1;
    status.failedEmail = status.failedEmail.filter((item) => item.id !== activeId);
    await route.fulfill({ status: 409, json: { message: "Delivery changed." } });
  });
  await page.goto("/operations/delivery");
  const active = page.getByRole("region", { name: "Email delivery queue" }).getByRole("listitem").filter({ hasText: activeId });
  await active.getByRole("button", { name: "Retry delivery" }).click();
  await active.getByRole("button", { name: "Confirm retry" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Refresh the status before retrying");
  await expect(active.getByRole("button", { name: "Retry delivery" })).toBeDisabled();
  expect(retries).toBe(1);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(active).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Event delivery queue" }).getByRole("button", { name: "Retry delivery" })).toBeEnabled();
});
