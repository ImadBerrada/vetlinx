import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";

const fixtureDatabase = process.env.B2C_TEST_DATABASE_URL;
test("pet owner requests a visit, accepts a clinic time proposal, and cancels with history preserved", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    !fixtureDatabase,
    "Set B2C_TEST_DATABASE_URL to the disposable database used by the running API.",
  );
  test.setTimeout(90_000);
  if (
    !fixtureDatabase ||
    !new URL(fixtureDatabase).pathname.toLowerCase().includes("test")
  )
    throw new Error(
      "Booking fixtures require an explicitly named test database.",
    );
  const requireApi = createRequire(path.resolve("apps/api/package.json"));
  const { Client } = requireApi("pg") as {
    Client: new (config: { connectionString: string }) => {
      connect(): Promise<void>;
      end(): Promise<void>;
      query(sql: string, values: unknown[]): Promise<unknown>;
    };
  };
  const database = new Client({ connectionString: fixtureDatabase });
  await database.connect();
  const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
  const clinicContext = await browser.newContext({
    viewport: testInfo.project.use.viewport,
    baseURL,
  });
  const clinicPage = await clinicContext.newPage();
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const clinicName = `B2C Care Clinic ${stamp}`;
  try {
    const registration = await clinicContext.request.post(
      `${baseURL}/api/session/register`,
      {
        data: {
          email: `clinic-${stamp}@booking.test`,
          password: "Clinic-Booking-Fixture-2026",
        },
      },
    );
    expect(registration.ok()).toBeTruthy();
    const created = await clinicContext.request.post(
      `${baseURL}/api/organizations`,
      {
        data: {
          legalName: clinicName,
          type: "CLINIC",
          countryCode: "AE",
          city: "Dubai",
          phone: "+97140000000",
        },
      },
    );
    expect(created.ok()).toBeTruthy();
    const organization = (await created.json()) as {
      workspace: { organization: { id: string } };
    };
    // Fixture verification avoids introducing shared privileged login credentials.
    await database.query(
      "UPDATE organizations.organizations SET status = $1 WHERE id = $2",
      ["VERIFIED", organization.workspace.organization.id],
    );
    await clinicPage.goto("/employer/appointments");
    await clinicPage
      .getByRole("button", { name: "Enable appointment requests" })
      .click();
    await expect(
      clinicPage.getByRole("heading", {
        name: "Accepting appointment requests",
      }),
    ).toBeVisible();

    await page.goto("/register?intent=owner");
    await page
      .getByLabel("Email", { exact: true })
      .fill(`owner-${stamp}@booking.test`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Owner-Booking-Fixture-2026");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await page.getByLabel("Your name").fill("Samira Hassan");
    await page.getByLabel("Contact phone").fill("+971501234567");
    await page
      .getByRole("button", { name: "Create pet-owner profile" })
      .click();
    await page.getByRole("button", { name: "Add pet", exact: true }).click();
    await page.getByLabel("Pet name").fill("Luna");
    await page
      .getByRole("combobox", { name: "Species", exact: true })
      .selectOption("CAT");
    await page.getByRole("button", { name: "Save pet" }).click();
    await expect(
      page.getByRole("heading", { name: "Luna", exact: true }),
    ).toBeVisible();
    await page.goto("/clinics");
    await page.getByLabel("Clinic name").fill(clinicName);
    await page.getByRole("button", { name: "Search clinics" }).click();
    const clinic = page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: clinicName, exact: true }),
      });
    await clinic.getByRole("button", { name: "Request appointment" }).click();
    await page
      .getByRole("combobox", { name: "Pet", exact: true })
      .selectOption({ label: "Luna · cat" });
    await page
      .getByLabel("Preferred date and time")
      .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16));
    await page.getByLabel("Reason for visit").fill("Annual wellness check");
    await page.getByLabel(/I agree to share my name/).check();
    await page
      .getByRole("button", { name: "Send appointment request" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Your request has been sent",
    );
    await clinicPage
      .getByRole("button", { name: "Refresh", exact: true })
      .click();
    await expect(
      clinicPage.getByRole("heading", { name: "Luna · Samira Hassan" }),
    ).toBeVisible();
    await clinicPage.getByRole("button", { name: "Confirm time" }).click();
    await expect(
      clinicPage.getByText("confirmed", { exact: true }),
    ).toBeVisible();
    await clinicPage.evaluate(() => window.scrollTo(0, 0));
    await clinicPage.screenshot({
      path: testInfo.outputPath("clinic-confirmed.png"),
      fullPage: true,
    });
    await clinicPage
      .getByRole("button", { name: "Propose a different time" })
      .click();
    await clinicPage
      .getByLabel("Proposed date and time", { exact: true })
      .fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16));
    await clinicPage
      .getByLabel("Response deadline", { exact: true })
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await clinicPage
      .getByLabel("Reason for proposed time", { exact: true })
      .fill("We can see Luna at a different time");
    await clinicPage
      .getByRole("button", { name: "Send time proposal", exact: true })
      .click();
    await expect(
      clinicPage.getByRole("heading", {
        name: "Clinic proposed a different time",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/owner");
    await expect(page.getByText("confirmed", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Clinic proposed a different time",
        exact: true,
      }),
    ).toBeVisible();
    const beforeAcceptance = await page.request.get("/api/appointments");
    const before = (await beforeAcceptance.json()) as {
      appointments: Array<{ startsAt: string; proposedStartsAt: string }>;
    };
    expect(before.appointments[0].startsAt).not.toBe(
      before.appointments[0].proposedStartsAt,
    );
    await page
      .getByRole("button", { name: "Accept proposed time", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm time change", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Clinic proposed a different time",
        exact: true,
      }),
    ).toHaveCount(0);
    const afterAcceptance = await page.request.get("/api/appointments");
    const after = (await afterAcceptance.json()) as {
      appointments: Array<{
        startsAt: string;
        proposedStartsAt: string | null;
        status: string;
      }>;
    };
    expect(after.appointments[0]).toMatchObject({
      startsAt: before.appointments[0].proposedStartsAt,
      proposedStartsAt: null,
      status: "CONFIRMED",
    });
    await page.getByRole("button", { name: "Request a different time", exact: true }).click();
    await page.getByLabel("Proposed date and time", { exact: true }).fill(new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 16));
    await page.getByLabel("Response deadline", { exact: true }).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await page.getByLabel("Reason for rescheduling", { exact: true }).fill("Please move Luna's visit to fit my work schedule");
    await page.getByRole("button", { name: "Send reschedule request", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Owner requested a different time", exact: true })).toBeVisible();
    const ownerPending = await (await page.request.get("/api/appointments")).json() as { appointments: Array<{ startsAt: string; proposedStartsAt: string; proposalInitiator: string }> };
    expect(ownerPending.appointments[0].startsAt).toBe(after.appointments[0].startsAt);
    expect(ownerPending.appointments[0].proposalInitiator).toBe("OWNER");
    await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.screenshot({ path: `playwright-report/care-qa/${testInfo.project.name}-real-owner-request.png`, fullPage: true });
    await clinicPage.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(clinicPage.getByRole("heading", { name: "Owner requested a different time", exact: true })).toBeVisible();
    await clinicPage.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await clinicPage.screenshot({ path: `playwright-report/care-qa/${testInfo.project.name}-real-clinic-pending.png`, fullPage: true });
    await clinicPage.getByLabel("Response to reschedule request").fill("The requested time is unavailable; please suggest another time");
    await clinicPage.getByRole("button", { name: "Decline reschedule request", exact: true }).click();
    await expect(clinicPage.getByRole("heading", { name: "Owner requested a different time", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    const declinedChange = await (await page.request.get("/api/appointments")).json() as { appointments: Array<{ startsAt: string; proposedStartsAt: string | null }> };
    expect(declinedChange.appointments[0]).toMatchObject({ startsAt: after.appointments[0].startsAt, proposedStartsAt: null });
    await page.getByRole("button", { name: "Request a different time", exact: true }).click();
    await page.getByLabel("Proposed date and time", { exact: true }).fill(new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 16));
    await page.getByLabel("Response deadline", { exact: true }).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await page.getByLabel("Reason for rescheduling", { exact: true }).fill("This alternative time works for my schedule");
    await page.getByRole("button", { name: "Send reschedule request", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Owner requested a different time", exact: true })).toBeVisible();
    const replacementPending = await (await page.request.get("/api/appointments")).json() as { appointments: Array<{ proposedStartsAt: string }> };
    await clinicPage.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(clinicPage.getByRole("heading", { name: "Owner requested a different time", exact: true })).toBeVisible();
    await clinicPage.getByRole("button", { name: "Accept reschedule request", exact: true }).click();
    await clinicPage.getByRole("button", { name: "Confirm time change", exact: true }).click();
    await expect(clinicPage.getByRole("heading", { name: "Owner requested a different time", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Owner requested a different time", exact: true })).toHaveCount(0);
    const ownerAccepted = await (await page.request.get("/api/appointments")).json() as { appointments: Array<{ startsAt: string; proposedStartsAt: string | null }> };
    expect(ownerAccepted.appointments[0]).toMatchObject({ startsAt: replacementPending.appointments[0].proposedStartsAt, proposedStartsAt: null });
    await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.screenshot({
      path: testInfo.outputPath("owner-confirmed.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel request for Luna" }).click();
    await page
      .getByRole("button", { name: "Confirm cancellation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "History (1)", exact: true })
      .click();
    await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
    const result = await page.request.get("/api/appointments");
    const body = (await result.json()) as {
      appointments: Array<{ status: string; history: unknown[] }>;
    };
    expect(body.appointments[0]).toMatchObject({ status: "CANCELLED" });
    expect(body.appointments[0].history).toHaveLength(9);

    // Reuse the same sessions for a near-term visit, exercising the real arrival BFF.
    const pets = await (await page.request.get("/api/pets")).json() as { pets: Array<{ id: string }> };
    const arrivalRequest = await page.request.post("/api/appointments", { data: {
      requestId: randomUUID(), organizationId: organization.workspace.organization.id,
      petId: pets.pets[0].id, startsAt: new Date(Date.now() + 3600000).toISOString(),
      timeZone: "UTC", visitReason: "Follow-up wellness visit", sharingConsent: true,
    } });
    expect(arrivalRequest.ok()).toBeTruthy();
    const arriving = (await arrivalRequest.json()) as { appointment: { id: string; proposalVersion: number } };
    const confirmation = await clinicContext.request.patch(`/api/organizations/${organization.workspace.organization.id}/appointments/${arriving.appointment.id}`, {
      data: { status: "CONFIRMED", proposalVersion: arriving.appointment.proposalVersion },
    });
    expect(confirmation.ok()).toBeTruthy();
    await clinicPage.getByRole("button", { name: "Refresh", exact: true }).click();
    await clinicPage.getByRole("button", { name: "Check in Luna", exact: true }).click();
    await expect(clinicPage.getByText("Checked in:", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByRole("button", { name: "Active (1)", exact: true }).click();
    await expect(page.getByText("Your pet has been checked in.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request a different time", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel request for Luna", exact: true })).toHaveCount(0);
    await clinicPage.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await clinicPage.screenshot({ path: `playwright-report/care-qa/${testInfo.project.name}-real-clinic-arrival.png`, fullPage: true });
  } finally {
    await clinicContext.close();
    await database.end();
  }
});
