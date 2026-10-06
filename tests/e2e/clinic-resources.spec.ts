import {expect, test, type Page} from "@playwright/test";
import {appointmentTimeInput} from "../../src/lib/appointment-time";
import type {ApiClinicSchedule, ApiAppointmentSlot} from "../../src/lib/server/vetlinx-api";

test.use({timezoneId: "Asia/Dubai"});
const organizationId = "bdc28eb6-fa4b-4e32-9a70-c6eb844dd74b";
const serviceId = "fde99870-6dc8-446f-ae93-ed046b4b10a2";
const resourceId = "4dfab4c5-a545-45d9-93a2-9179895d8e31";
const slotId = "e6d94bc8-2433-4f8e-b0f5-d0f21bf6c179";
function fixture(): ApiClinicSchedule {
  const startsAt = new Date(Date.now() + 3 * 86400000).toISOString();
  return {enabled: true, services: [{id: serviceId, name: "Wellness visit", description: "A routine wellness examination", durationMinutes: 30, active: true, version: 0}], resources: [{id: resourceId, name: "Consultation room 1", kind: "ROOM", active: true, version: 0}], slots: [{id: slotId, serviceId, startsAt, endsAt: new Date(new Date(startsAt).getTime() + 1800000).toISOString(), timeZone: "Asia/Dubai", capacity: 1, remaining: 1, published: false, version: 0, resourcesReserved: true, resources: [{resourceId}]}], nextCursor: null};
}
async function clinic(page: Page, data: ApiClinicSchedule, role = "OWNER") {
  await page.route("**/api/session/me", route => route.fulfill({json: {account: {accountId: "fixture", email: "fixture@example.test", roles: []}, profile: null, owner: null, organizations: [{id: "membership", role, organization: {id: organizationId, type: "CLINIC", status: "VERIFIED", legalName: "Resource Clinic", acceptsAppointmentRequests: true, appointmentSchedulingEnabled: true}}]}}));
  await page.route("**/api/notifications", route => route.fulfill({json: {notifications: []}}));
  await page.route(`**/api/organizations/${organizationId}/appointments`, route => route.fulfill({json: {appointments: []}}));
  await page.route(`**/api/organizations/${organizationId}/schedule`, route => route.fulfill({json: {schedule: data}}));
  await page.goto("/employer/appointments");
  await page.getByText(/Services and availability ·/).click();
  await expect(page.getByRole("heading", {name: "Shared clinic resources"})).toBeVisible();
}

test("resource creation preserves its draft and retry ID after a network failure", async ({page}, testInfo) => {
  const data = fixture(); const requests: Record<string, unknown>[] = [];
  await page.route(`**/api/organizations/${organizationId}/schedule/resources`, route => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (requests.length === 1) return route.fulfill({status: 503, json: {message: "Connection interrupted"}});
    const resource = {id: String(body.id), name: String(body.name), kind: "EQUIPMENT" as const, active: true, version: 0}; data.resources!.push(resource);
    return route.fulfill({json: {result: resource}});
  });
  await clinic(page, data);
  const form = page.getByRole("form", {name: "Add clinic resource"});
  await form.getByLabel("Resource name").fill("Ultrasound unit");
  await form.getByRole("combobox", {name: "Resource type", exact: true}).selectOption("EQUIPMENT");
  await form.getByRole("button", {name: "Add resource", exact: true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Connection interrupted");
  await expect(form.getByLabel("Resource name")).toHaveValue("Ultrasound unit");
  await form.getByRole("button", {name: "Add resource", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Ultrasound unit · Equipment · Available"})).toBeVisible();
  expect(requests[1]).toEqual(requests[0]);
  await expect(form.getByLabel("Resource name")).toHaveValue("");
  await expect(form.getByLabel("Resource name")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.evaluate(() => {if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0);});
  await page.screenshot({path: `playwright-report/resource-qa/${testInfo.project.name}-resources.png`, fullPage: true});
});

test("overlap conflicts retain selected resources and require explicit schedule refresh", async ({page}) => {
  const data = fixture(); const inputs: Record<string, unknown>[] = [];
  await page.route(`**/api/organizations/${organizationId}/schedule/slots`, route => {
    const body = route.request().postDataJSON(); inputs.push(body);
    if (inputs.length === 1) return route.fulfill({status: 409, json: {message: "A selected resource is already reserved at this time"}});
    const result: ApiAppointmentSlot = {id: String(body.id), serviceId, startsAt: String(body.startsAt), endsAt: new Date(new Date(String(body.startsAt)).getTime() + 1800000).toISOString(), timeZone: "Asia/Dubai", capacity: 1, remaining: 1, published: true, version: 0, resourcesReserved: true, resources: [{resourceId}]}; data.slots.push(result);
    return route.fulfill({json: {result}});
  });
  await clinic(page, data);
  const form = page.getByRole("form", {name: "Publish appointment time"});
  const selectedTime = appointmentTimeInput(new Date(Date.now() + 4 * 86400000), "Asia/Dubai");
  await form.getByLabel("Available date and time").fill(selectedTime);
  await form.getByRole("checkbox", {name: "Consultation room 1"}).check();
  await form.getByRole("button", {name: "Publish time", exact: true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("already reserved");
  await expect(form.getByRole("checkbox", {name: "Consultation room 1"})).toBeChecked();
  await expect(form.getByRole("button", {name: "Publish time", exact: true})).toBeDisabled();
  await page.getByRole("button", {name: "Refresh schedule"}).click();
  await expect(form.getByLabel("Available date and time")).toHaveValue(selectedTime);
  await form.getByRole("button", {name: "Publish time", exact: true}).click();
  await expect(page.getByRole("button", {name: "Close this time"})).toBeVisible();
  expect(inputs[0].resourceIds).toEqual([resourceId]); expect(inputs[1]).toEqual(inputs[0]);
});

test("release conflicts preserve reservations; retirement asks for a focused confirmation", async ({page}) => {
  const data = fixture(); let releases = 0; let retirements = 0;
  await page.route(`**/api/organizations/${organizationId}/schedule/slots/${slotId}`, route => {
    expect(route.request().postDataJSON()).toMatchObject({published: false, releaseResources: true, version: 0});
    if (++releases === 1) return route.fulfill({status: 409, json: {message: "An active hold still uses this time"}});
    data.slots[0] = {...data.slots[0], resourcesReserved: false, version: 1};
    return route.fulfill({json: {result: data.slots[0]}});
  });
  await page.route(`**/api/organizations/${organizationId}/schedule/resources/${resourceId}`, route => {
    retirements++; expect(route.request().postDataJSON()).toEqual({active: false, version: 0});
    data.resources![0] = {...data.resources![0], active: false, version: 1};
    return route.fulfill({json: {result: data.resources![0]}});
  });
  await clinic(page, data);
  await page.getByRole("button", {name: "Release unused resources"}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("active hold");
  await expect(page.getByText(/^Resources reserved:/)).toBeVisible();
  await expect(page.getByRole("button", {name: "Release unused resources"})).toBeDisabled();
  await page.getByRole("button", {name: "Refresh schedule"}).click();
  await page.getByRole("button", {name: "Release unused resources"}).click();
  await expect(page.getByText(/^Resources released:/)).toBeVisible();
  await page.getByRole("button", {name: "Retire Consultation room 1"}).click();
  await expect(page.getByRole("button", {name: "Confirm retirement"})).toBeFocused();
  expect(retirements).toBe(0);
  await page.getByRole("button", {name: "Keep resource"}).click();
  await expect(page.getByRole("button", {name: "Retire Consultation room 1"})).toBeFocused();
  await page.getByRole("button", {name: "Retire Consultation room 1"}).click();
  await page.getByRole("button", {name: "Confirm retirement"}).click();
  await expect(page.getByRole("heading", {name: "Consultation room 1 · Room · Retired"})).toBeVisible();
  expect(retirements).toBe(1);
});

test("clinic staff can read assignments without resource management controls", async ({page}) => {
  await clinic(page, fixture(), "STAFF");
  await expect(page.getByText(/^Resources reserved:/)).toBeVisible();
  await expect(page.getByRole("form", {name: "Add clinic resource"})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Retire Consultation room 1"})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Release unused resources"})).toHaveCount(0);
});
