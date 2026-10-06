import { expect, test, type Page } from "@playwright/test";
import { appointmentTimeInput } from "../../src/lib/appointment-time";
import type { ApiAppointment, ApiClinicSchedule } from "../../src/lib/server/vetlinx-api";

test.use({ timezoneId: "Asia/Dubai" });
const organizationId = "bdc28eb6-fa4b-4e32-9a70-c6eb844dd74b";
const serviceId = "fde99870-6dc8-446f-ae93-ed046b4b10a2";
const slotId = "e6d94bc8-2433-4f8e-b0f5-d0f21bf6c179";
const secondId = "1d24d042-de4c-4fd2-8de1-9c6f241414e9";
const petId = "c6a7ae84-0fe3-410c-b5df-a8034c89e65a";
const time = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
function schedule(): ApiClinicSchedule {
  return { enabled: true, services: [{ id: serviceId, name: "Wellness visit", description: "A routine health examination", durationMinutes: 30, active: true, version: 0 }], slots: [slotId, secondId].map((id, index) => ({ id, serviceId, startsAt: time(index + 3), endsAt: time(index + 3), timeZone: "Asia/Dubai", capacity: 1, remaining: 1, published: true, version: 0 })), nextCursor: null };
}
async function shell(page: Page) {
  await page.context().addCookies([{ name: "vetlinx_access", value: "fixture", url: process.env.BASE_URL ?? "http://localhost:3000" }]);
  await page.route("**/api/session/me", route => route.fulfill({ json: { account: {accountId: "fixture", email: "fixture@example.test", roles: []}, profile: null, owner: {displayName: "Samira Hassan"}, organizations: [{id: "membership", role: "OWNER", organization: {id: organizationId, type: "CLINIC", status: "VERIFIED", legalName: "Scheduling Clinic", acceptsAppointmentRequests: true, appointmentSchedulingEnabled: true}}] } }));
  await page.route("**/api/notifications", route => route.fulfill({json: {notifications: []}}));
  await page.route("**/api/pets", route => route.fulfill({json: {pets: [{id: petId, name: "Luna", speciesCode: "CAT", sex: "FEMALE", breed: null, birthDate: null}]}}));
}
async function directory(page: Page, data: ApiClinicSchedule) {
  await shell(page);
  await page.route(/\/api\/clinics\?/, route => route.fulfill({json: {clinics: [{id: organizationId, legalName: "Scheduling Clinic", publicName: null, city: "Dubai", countryCode: "AE", appointmentSchedulingEnabled: true}]}}));
  await page.route(`**/api/clinics/${organizationId}/availability`, route => route.fulfill({json: {schedule: data}}));
  await page.goto("/clinics");
  await page.getByRole("article").getByRole("button", {name: "Request appointment"}).click();
  await page.getByRole("combobox", {name: "Service", exact: true}).selectOption(serviceId);
  await page.getByRole("combobox", {name: "Available time", exact: true}).selectOption(slotId);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
}

test("published booking keeps the same submission ID on retry and requires explicit consent", async ({page}, testInfo) => {
  const data = schedule();
  const submissions: Record<string, unknown>[] = [];
  await page.route(`**/api/clinics/${organizationId}/holds`, route => route.fulfill({json: {hold: {id: route.request().postDataJSON().id, expiresAt: time(0.003), slot: {...data.slots[0], service: data.services[0]}}}}));
  await page.route("**/api/appointments", route => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill(submissions.length === 1 ? {status: 503, json: {message: "Connection interrupted"}} : {json: {appointment: {id: "saved"}}});
  });
  await directory(page, data);
  await page.getByRole("button", {name: "Hold this time"}).click();
  await expect(page.getByRole("region", {name: "Your held time"})).toBeFocused();
  await page.getByLabel("Reason for visit").fill("Annual wellness examination");
  await page.getByRole("button", {name: "Send appointment request"}).click();
  expect(submissions).toHaveLength(0);
  await page.getByLabel(/I agree to share my name/).check();
  await noOverflow(page);
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.screenshot({path: `playwright-report/scheduling-qa/${testInfo.project.name}-held-time.png`, fullPage: true});
  await page.getByRole("button", {name: "Send appointment request"}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Connection interrupted");
  await expect(page.getByLabel("Reason for visit")).toHaveValue("Annual wellness examination");
  await page.getByRole("button", {name: "Send appointment request"}).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Your request has been sent");
  expect(submissions).toHaveLength(2);
  expect(submissions[1]).toEqual(submissions[0]);
  expect(submissions[0]).toMatchObject({organizationId, petId, startsAt: data.slots[0].startsAt, timeZone: "Asia/Dubai", sharingConsent: true});
});

test("expired hold blocks submission and changing time retains reason and consent", async ({page}) => {
  const data = schedule();
  let releases = 0;
  await page.route(`**/api/clinics/${organizationId}/holds`, route => route.fulfill({json: {hold: {id: "hold", expiresAt: new Date(Date.now() - 1000).toISOString(), slot: {...data.slots[0], service: data.services[0]}}}}));
  await page.route("**/api/appointments/holds/hold/release", route => {releases++; return route.fulfill({json: {result: {released: true}}});});
  await directory(page, data);
  await page.getByLabel("Reason for visit").fill("Please keep my original reason");
  await page.getByLabel(/I agree to share my name/).check();
  await page.getByRole("button", {name: "Hold this time"}).click();
  await expect(page.getByRole("region", {name: "Your held time"})).toContainText("Your hold expired");
  await expect(page.getByRole("button", {name: "Send appointment request"})).toBeDisabled();
  await page.getByRole("button", {name: "Choose another time"}).click();
  await expect(page.getByRole("combobox", {name: "Available time", exact: true})).toBeVisible();
  await expect(page.getByLabel("Reason for visit")).toHaveValue("Please keep my original reason");
  await expect(page.getByLabel(/I agree to share my name/)).toBeChecked();
  expect(releases).toBe(1);
});

test("clinic capacity conflict preserves edits and requires a schedule refresh", async ({page}, testInfo) => {
  const data = schedule();
  await shell(page);
  await page.route(`**/api/organizations/${organizationId}/appointments`, route => route.fulfill({json: {appointments: []}}));
  await page.route(`**/api/organizations/${organizationId}/schedule`, route => route.fulfill({json: {schedule: data}}));
  let changes = 0;
  await page.route(`**/api/organizations/${organizationId}/schedule/slots/${slotId}`, route => {changes++; data.slots[0].capacity = 3; data.slots[1].capacity = 4; return route.fulfill({status: 409, json: {message: "Capacity cannot be lower than current requests and active holds"}});});
  await page.goto("/employer/appointments");
  await page.getByText(/Services and availability ·/).click();
  const capacity = page.getByLabel(`Capacity for Wellness visit at ${data.slots[0].startsAt}`);
  await capacity.fill("2");
  await page.getByRole("button", {name: "Save capacity"}).first().click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Refresh and review");
  await expect(capacity).toHaveValue("2");
  await expect(page.getByRole("button", {name: "Save capacity"}).first()).toBeDisabled();
  await page.getByRole("button", {name: "Refresh schedule"}).click();
  await expect(page.getByRole("button", {name: "Save capacity"}).first()).toBeEnabled();
  await expect(capacity).toHaveValue("2");
  expect(changes).toBe(1);
  await expect(page.getByLabel(`Capacity for Wellness visit at ${data.slots[1].startsAt}`)).toHaveValue("4");
  await noOverflow(page);
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.screenshot({path: `playwright-report/scheduling-qa/${testInfo.project.name}-clinic-schedule.png`, fullPage: true});
});

test("scheduled rescheduling uses a published alternative and preserves draft on capacity conflict", async ({page}, testInfo) => {
  const data = schedule();
  const appointment: ApiAppointment = {id: "appointment", organizationId, petId, petName: "Luna", speciesCode: "CAT", ownerName: "Samira Hassan", contactPhone: "+971501234567", clinicName: "Scheduling Clinic", startsAt: data.slots[0].startsAt, timeZone: "Asia/Dubai", visitReason: "Wellness visit", status: "CONFIRMED", responseNote: null, proposedStartsAt: null, proposedTimeZone: null, proposalExpiresAt: null, proposalReason: null, proposalVersion: 0, proposalInitiator: null, checkedInAt: null, history: [], slotId, serviceName: "Wellness visit", durationMinutes: 30};
  await shell(page);
  await page.route("**/api/appointments", route => route.fulfill({json: {appointments: [appointment]}}));
  await page.route("**/api/appointments/appointment/alternatives", route => route.fulfill({json: {schedule: data}}));
  let changes = 0;
  await page.route("**/api/appointments/appointment/reschedule", route => {
    changes++;
    expect(route.request().postDataJSON()).toMatchObject({slotId: secondId, startsAt: data.slots[1].startsAt, timeZone: "Asia/Dubai"});
    return route.fulfill({status: 409, json: {message: "This time is no longer available"}});
  });
  await page.goto("/owner");
  await page.getByRole("button", {name: "Request a different time"}).click();
  await expect(page.getByLabel("Proposed date and time", {exact: true})).toHaveCount(0);
  await page.getByRole("combobox", {name: "Published alternative time", exact: true}).selectOption(secondId);
  await page.getByLabel(/Response deadline/).fill(appointmentTimeInput(time(1), "Asia/Dubai"));
  await page.getByLabel("Reason for rescheduling").fill("My original reschedule reason");
  await page.getByRole("button", {name: "Send reschedule request"}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your draft is kept");
  await expect(page.getByLabel("Reason for rescheduling")).toHaveValue("My original reschedule reason");
  await expect(page.getByRole("button", {name: "Send reschedule request"})).toBeDisabled();
  await page.getByRole("button", {name: "Refresh", exact: true}).click();
  await expect(page.getByRole("button", {name: "Send reschedule request"})).toBeEnabled();
  expect(appointment.startsAt).toBe(data.slots[0].startsAt);
  expect(changes).toBe(1);
  await noOverflow(page);
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.screenshot({path: `playwright-report/scheduling-qa/${testInfo.project.name}-published-reschedule.png`, fullPage: true});
});
