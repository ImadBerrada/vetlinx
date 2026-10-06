import { expect, test, type Page } from "@playwright/test";
import { appointmentTimeInput } from "../../src/lib/appointment-time";
import type { ApiAppointment } from "../../src/lib/server/vetlinx-api";

test.use({ timezoneId: "America/New_York" });
const organizationId = "bdc28eb6-fa4b-4e32-9a70-c6eb844dd74b";
const appointmentId = "e6d94bc8-2433-4f8e-b0f5-d0f21bf6c179";
const zone = "America/New_York";
const dateInput = (days: number) => appointmentTimeInput(new Date(Date.now() + days * 86400000), zone);
const makeAppointment = (overrides: Partial<ApiAppointment> = {}): ApiAppointment => ({ id: appointmentId, organizationId, petId: "c6a7ae84-0fe3-410c-b5df-a8034c89e65a", petName: "Luna", speciesCode: "CAT", ownerName: "Maya Rahman", contactPhone: "+971501234567", clinicName: "Care Coordination Clinic", startsAt: new Date(Date.now() + 5 * 86400000).toISOString(), timeZone: zone, visitReason: "Annual check-up", status: "CONFIRMED", checkedInAt: null, responseNote: null, proposedStartsAt: null, proposedTimeZone: null, proposalExpiresAt: null, proposalVersion: 0, proposalReason: null, proposalInitiator: null, history: [], ...overrides });

async function surfaces(page: Page, read: () => ApiAppointment) {
  await page.route("**/api/session/me", (route) => route.fulfill({ json: { account: { accountId: "fixture", email: "owner@example.test", roles: [] }, profile: { displayName: "Dr. Maya Rahman" }, owner: { displayName: "Maya Rahman" }, organizations: [{ id: "membership", role: "OWNER", organization: { id: organizationId, type: "CLINIC", status: "VERIFIED", legalName: "Care Coordination Clinic", acceptsAppointmentRequests: true } }] } }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { notifications: [] } }));
  await page.route("**/api/pets", (route) => route.fulfill({ json: { pets: [{ id: read().petId, name: "Luna", speciesCode: "CAT", sex: "FEMALE", breed: null, birthDate: null }] } }));
  await page.route("**/api/appointments", (route) => route.fulfill({ json: { appointments: [read()] } }));
  await page.route(`**/api/organizations/${organizationId}/appointments`, (route) => route.fulfill({ json: { appointments: [read()] } }));
}

test("owner requests a change without replacing the original, clinic explicitly accepts it", async ({ page }, testInfo) => {
  let appointment = makeAppointment();
  const originalTime = appointment.startsAt;
  let requests = 0;
  let approvals = 0;
  await surfaces(page, () => appointment);
  await page.route(`**/api/appointments/${appointmentId}/reschedule`, async (route) => {
    requests += 1;
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ timeZone: zone, proposalVersion: 0, reason: "Please use a time that suits my work schedule" });
    appointment = { ...appointment, proposedStartsAt: body.startsAt, proposedTimeZone: body.timeZone, proposalExpiresAt: body.expiresAt, proposalReason: body.reason, proposalInitiator: "OWNER", proposalVersion: 1 };
    await route.fulfill({ json: { appointment } });
  });
  await page.route(`**/api/organizations/${organizationId}/appointments/${appointmentId}/reschedule/accept`, async (route) => {
    approvals += 1;
    expect(route.request().postDataJSON()).toEqual({ proposalVersion: 1 });
    appointment = { ...appointment, startsAt: appointment.proposedStartsAt!, timeZone: appointment.proposedTimeZone!, proposedStartsAt: null, proposedTimeZone: null, proposalExpiresAt: null, proposalReason: null, proposalInitiator: null, proposalVersion: 2 };
    await route.fulfill({ json: { appointment } });
  });
  await page.goto("/owner");
  await page.getByRole("button", { name: "Request a different time" }).click();
  await page.getByLabel("Proposed date and time", { exact: true }).fill(dateInput(2));
  await page.getByLabel("Response deadline", { exact: true }).fill(dateInput(1));
  await page.getByLabel("Reason for rescheduling").fill("Please use a time that suits my work schedule");
  await page.getByRole("button", { name: "Send reschedule request" }).click();
  await expect(page.getByRole("heading", { name: "Owner requested a different time" })).toBeVisible();
  expect(appointment.startsAt).toBe(originalTime);
  await expect(page.getByRole("button", { name: "Accept proposed time" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Withdraw reschedule request" })).toBeVisible();
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.screenshot({ path: `playwright-report/care-qa/${testInfo.project.name}-owner-pending-change.png`, fullPage: true });
  await page.goto("/employer/appointments");
  await expect(page.getByRole("heading", { name: "Owner requested a different time" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Propose a different time" })).toHaveCount(0);
  await page.getByRole("button", { name: "Accept reschedule request" }).click();
  expect(approvals).toBe(0);
  await expect(page.getByRole("button", { name: "Confirm time change" })).toBeFocused();
  await page.getByRole("button", { name: "Confirm time change" }).click();
  await expect(page.getByRole("heading", { name: "Owner requested a different time" })).toHaveCount(0);
  expect(appointment.startsAt).not.toBe(originalTime);
  expect(requests).toBe(1);
  expect(approvals).toBe(1);
});

test("a conflicting reschedule preserves its draft and blocks retry until explicit refresh", async ({ page }) => {
  let appointment = makeAppointment();
  await surfaces(page, () => appointment);
  let submissions = 0;
  await page.route(`**/api/appointments/${appointmentId}/reschedule`, async (route) => {
    submissions += 1;
    appointment = { ...appointment, proposalVersion: 1 };
    await route.fulfill({ status: 409, json: { message: "Appointment changed." } });
  });
  await page.goto("/owner");
  await page.getByRole("button", { name: "Request a different time" }).click();
  const reason = page.getByLabel("Reason for rescheduling");
  await reason.fill("My original draft must be preserved");
  await page.getByRole("button", { name: "Send reschedule request" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your draft is kept");
  await expect(reason).toHaveValue("My original draft must be preserved");
  await expect(page.getByRole("button", { name: "Send reschedule request" })).toBeDisabled();
  expect(submissions).toBe(1);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send reschedule request" })).toBeEnabled();
  await expect(reason).toHaveValue("My original draft must be preserved");
  expect(submissions).toBe(1);
});

test("saved arrival survives a failed list refresh and requires explicit refresh before another command", async ({ page }) => {
  let appointment = makeAppointment({ startsAt: new Date(Date.now() + 3600000).toISOString() });
  await surfaces(page, () => appointment);
  let failRefresh = false;
  let arrivals = 0;
  await page.route(`**/api/organizations/${organizationId}/appointments`, async (route) => {
    if (failRefresh) {
      failRefresh = false;
      await route.fulfill({ status: 503, json: { message: "The appointment list is temporarily unavailable." } });
    } else await route.fulfill({ json: { appointments: [appointment] } });
  });
  await page.route(`**/api/organizations/${organizationId}/appointments/${appointmentId}/check-in`, async (route) => {
    arrivals += 1;
    appointment = { ...appointment, checkedInAt: new Date().toISOString(), proposalVersion: 1 };
    failRefresh = true;
    await route.fulfill({ json: { appointment } });
  });
  await page.goto("/employer/appointments");
  await page.getByLabel("Message for Luna").fill("Owner requested cancellation if arrival cannot be completed");
  await page.getByRole("button", { name: "Check in Luna" }).click();
  await expect(page.getByText("Checked in:", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("was updated");
  await expect(page.getByRole("button", { name: "Check in Luna" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel appointment", exact: true })).toBeDisabled();
  expect(arrivals).toBe(1);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel appointment", exact: true })).toBeEnabled();
  expect(arrivals).toBe(1);
});

test("owner time-change form rejects DST gaps and overlaps without sending or losing the draft", async ({ page }) => {
  const appointment = makeAppointment({ startsAt: "2028-02-01T17:00:00Z" });
  await surfaces(page, () => appointment);
  let submissions = 0;
  await page.route(`**/api/appointments/${appointmentId}/reschedule`, (route) => { submissions += 1; return route.fulfill({ json: { appointment } }); });
  await page.goto("/owner");
  await page.getByRole("button", { name: "Request a different time" }).click();
  await expect(page.getByRole("form", { name: "Owner reschedule request" })).toContainText(zone);
  const proposed = page.getByLabel("Proposed date and time", { exact: true });
  await page.getByLabel("Reason for rescheduling").fill("Keep this scheduling draft");
  await page.getByLabel("Response deadline", { exact: true }).fill(dateInput(1));
  for (const wallTime of ["2027-03-14T02:30", "2027-11-07T01:30"]) {
    await proposed.fill(wallTime);
    await page.getByRole("button", { name: "Send reschedule request" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("daylight-saving");
    await expect(proposed).toHaveValue(wallTime);
    await expect(page.getByLabel("Reason for rescheduling")).toHaveValue("Keep this scheduling draft");
    expect(submissions).toBe(0);
  }
});

test("clinic arrival uses the current version and removes owner change controls", async ({ page }, testInfo) => {
  let appointment = makeAppointment({ startsAt: new Date(Date.now() + 3600000).toISOString() });
  await surfaces(page, () => appointment);
  let arrivals = 0;
  await page.route(`**/api/organizations/${organizationId}/appointments/${appointmentId}/check-in`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ proposalVersion: 0 }); arrivals += 1;
    appointment = { ...appointment, checkedInAt: new Date().toISOString(), proposalVersion: 1 };
    await route.fulfill({ json: { appointment } });
  });
  await page.goto("/employer/appointments");
  await page.getByRole("button", { name: "Check in Luna" }).click();
  await expect(page.getByText("Checked in:", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in Luna" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark no-show" })).toHaveCount(0);
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.screenshot({ path: `playwright-report/care-qa/${testInfo.project.name}-clinic-arrival.png`, fullPage: true });
  await page.goto("/owner");
  await expect(page.getByText("Your pet has been checked in.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request a different time" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel request for Luna" })).toHaveCount(0);
  expect(arrivals).toBe(1);
});

test("clinic no-show requires a reason and an explicit focused confirmation", async ({ page }) => {
  let appointment = makeAppointment({ startsAt: new Date(Date.now() - 3600000).toISOString() });
  await surfaces(page, () => appointment);
  let decisions = 0;
  await page.route(`**/api/organizations/${organizationId}/appointments/${appointmentId}`, async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({ status: "NO_SHOW", proposalVersion: 0, reason: "Owner did not attend the scheduled visit" });
    decisions += 1;
    appointment = { ...appointment, status: "NO_SHOW", responseNote: "Owner did not attend the scheduled visit", proposalVersion: 1 };
    await route.fulfill({ json: { appointment } });
  });
  await page.goto("/employer/appointments");
  await expect(page.getByRole("button", { name: "Mark no-show" })).toBeDisabled();
  await page.getByLabel("Message for Luna").fill("Owner did not attend the scheduled visit");
  await page.getByRole("button", { name: "Mark no-show" }).click();
  expect(decisions).toBe(0);
  await expect(page.getByRole("button", { name: "Confirm no-show" })).toBeFocused();
  await page.getByRole("button", { name: "Confirm no-show" }).click();
  await page.getByRole("button", { name: "History (1)", exact: true }).click();
  await expect(page.getByText("no-show", { exact: true })).toBeVisible();
  expect(decisions).toBe(1);
});
