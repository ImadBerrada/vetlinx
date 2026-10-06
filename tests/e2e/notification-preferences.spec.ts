import { expect, test } from "@playwright/test";

test("owner notification preferences preserve conflicting edits and require an explicit reload", async ({ page }, testInfo) => {
  await page.context().addCookies([{ name: "vetlinx_workspace", value: "owner", url: process.env.BASE_URL ?? "http://localhost:3000" }]);
  await page.route("**/api/session/me", (route) => route.fulfill({ json: { account: { accountId: "fixture", email: "owner@example.test", roles: [] }, profile: { displayName: "Dr. Maya Rahman" }, owner: { displayName: "Maya Rahman" }, organizations: [] } }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { notifications: [] } }));
  let preferences = { appointmentUpdatesEmail: true, appointmentRemindersEmail: true, credentialUpdatesEmail: false, version: 3 };
  let saves = 0;
  await page.route("**/api/notifications/preferences", async (route) => {
    if (route.request().method() === "GET") { await route.fulfill({ json: { preferences } }); return; }
    saves += 1;
    const payload = route.request().postDataJSON();
    expect(payload).toEqual({ appointmentUpdatesEmail: saves === 1, appointmentRemindersEmail: false, credentialUpdatesEmail: false, expectedVersion: saves === 1 ? 3 : 4 });
    if (saves === 1) {
      preferences = { ...preferences, appointmentUpdatesEmail: false, version: 4 };
      await route.fulfill({ status: 409, json: { message: "Preferences changed." } });
    } else {
      preferences = { appointmentUpdatesEmail: false, appointmentRemindersEmail: false, credentialUpdatesEmail: false, version: 5 };
      await route.fulfill({ json: { preferences } });
    }
  });
  await page.goto("/settings/notifications");
  await expect(page.getByRole("heading", { name: "Notification preferences", exact: true })).toBeVisible();
  await expect(page.getByText("Security emails, including password recovery", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("notification-preferences.png"), fullPage: true });
  const reminders = page.getByRole("checkbox", { name: /^Appointment reminders/ });
  await reminders.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("changed in another session");
  await expect(reminders).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeDisabled();
  await page.getByRole("button", { name: "Reload latest settings" }).click();
  await expect(reminders).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^Appointment updates/ })).not.toBeChecked();
  expect(saves).toBe(1);
  await reminders.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("preferences have been saved");
  expect(saves).toBe(2);
});
