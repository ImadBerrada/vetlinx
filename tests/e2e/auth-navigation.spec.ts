import { expect, test } from "@playwright/test";
import { authEntryHref, authNavigationContext, safeReturnTo } from "../../src/lib/auth-navigation";

test("authentication return links preserve intent and reject external or privileged endpoints", () => {
  for (const unsafe of ["https://evil.test", "//evil.test", "/\\evil.test", "/api/session/logout", "/login", "/professional/../../api/session/logout", "/owner\n", "javascript:alert(1)"]) {
    expect(safeReturnTo(unsafe), unsafe).toBeNull();
  }
  const destination = "/clinics?clinic=clinic-id&city=Dubai";
  const register = authEntryHref("register", { intent: "owner", returnTo: destination });
  expect(authNavigationContext(register.slice(register.indexOf("?")))).toEqual({ intent: "owner", returnTo: destination });
  const login = authEntryHref("login", authNavigationContext(register.slice(register.indexOf("?"))));
  expect(authNavigationContext(login.slice(login.indexOf("?")))).toEqual({ intent: "owner", returnTo: destination });
});

test("clinic intent survives registration and owner setup without automatic private lookup or submission", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const clinicId = "601b4980-0113-438d-8b0f-ae2b653b8dcb";
  const clinicName = "Intent Test Clinic";
  let petLookups = 0;
  let submissions = 0;
  // Explicit public-directory fixture; this journey never creates an appointment for it.
  await page.route(/\/api\/clinics(?:\?.*)?$/, (route) => route.fulfill({ json: { clinics: [{ id: clinicId, legalName: clinicName, publicName: clinicName, type: "CLINIC", countryCode: "AE", city: "Dubai", addressLine1: null, phone: "+97140000000", website: null }] } }));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/pets") petLookups += 1;
    if (new URL(request.url()).pathname === "/api/appointments" && request.method() === "POST") submissions += 1;
  });
  await page.goto("/clinics?q=Intent");
  const clinic = page.getByRole("article").filter({ has: page.getByRole("heading", { name: clinicName, exact: true }) });
  await clinic.getByRole("button", { name: "Sign in to request" }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await expect(page).toHaveURL(/\/register\?/);
  const context = authNavigationContext(new URL(page.url()).search);
  expect(context.intent).toBe("owner");
  expect(new URL(context.returnTo!, "https://vetlinx.local").searchParams.get("clinic")).toBe(clinicId);
  await page.getByLabel("Email", { exact: true }).fill(`return-${testInfo.project.name}-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("VetLinX-Return-Intent-2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/owner\/onboarding\?/);
  await page.getByLabel("Your name").fill("Nadia Malik");
  await page.getByRole("combobox", { name: "Country", exact: true }).selectOption("AE");
  await page.getByLabel("Contact phone").fill("+971501234567");
  await page.getByRole("button", { name: "Create pet-owner profile" }).click();
  await expect(page).toHaveURL(/\/clinics\?/);
  await expect(page.getByRole("region", { name: "Selected clinic", exact: true })).toContainText(clinicName);
  expect(petLookups).toBe(0);
  expect(submissions).toBe(0);
  await page.getByRole("region", { name: "Selected clinic", exact: true }).getByRole("button", { name: "Request appointment" }).click();
  await expect(page.getByRole("region", { name: "Request appointment", exact: true })).toContainText("Add a pet before requesting an appointment");
  expect(petLookups).toBe(1);
  expect(submissions).toBe(0);
});

test("authentication mode links preserve return intent in server HTML before hydration", async ({ request }) => {
  const context = { intent: "owner" as const, returnTo: "/clinics?q=Harbour&clinic=601b4980-0113-438d-8b0f-ae2b653b8dcb" };
  for (const mode of ["login", "register"] as const) {
    const response = await request.get(authEntryHref(mode, context));
    expect(response.ok()).toBeTruthy();
    const next = authEntryHref(mode === "login" ? "register" : "login", context);
    expect(await response.text()).toContain(`href="${next.replaceAll("&", "&amp;")}"`);
  }
});
