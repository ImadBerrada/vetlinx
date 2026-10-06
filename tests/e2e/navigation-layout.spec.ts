import { expect, test, type Page } from "@playwright/test";

const organizationId = "bdc28eb6-fa4b-4e32-9a70-c6eb844dd74b";
const clinicName = "Harbour Veterinary Hospital and Specialist Care Centre";

test("public home and clinic navigation span the screen without overflowing", async ({page}, testInfo) => {
  const width = testInfo.project.name === "mobile" ? 320 : 1920;
  await page.setViewportSize({width, height: 900});
  await page.route(/\/api\/clinics\?/, route => route.fulfill({json: {clinics: []}}));
  for (const path of ["/", "/clinics"]) {
    await page.goto(path);
    const banner = page.getByRole("banner");
    await expect(page.getByRole("navigation", {name: "Public navigation"})).toBeVisible();
    const bounds = (await banner.boundingBox())!;
    expect(bounds.x).toBe(0);
    expect(bounds.width).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await expect(page.getByRole("link", {name: "Sign in", exact: true})).toBeVisible();
  }
  await page.screenshot({path: `playwright-report/navigation-qa/${testInfo.project.name}-public-navigation.png`});
});
async function workspace(page: Page, withNotification = false) {
  await page.route("**/api/session/me", route => route.fulfill({json: {account: {accountId: "fixture", email: "maya@example.test", roles: []}, profile: {displayName: "Dr. Maya Rahman"}, owner: {displayName: "Maya Rahman"}, organizations: [{id: "membership", role: "OWNER", organization: {id: organizationId, type: "CLINIC", status: "VERIFIED", legalName: clinicName, acceptsAppointmentRequests: true}}]}}));
  await page.route("**/api/notifications", route => route.fulfill({json: {notifications: withNotification ? [{id: "notice", status: "UNREAD", kind: "CREDENTIAL_VERIFIED", resourceType: "credential", title: "Your veterinary qualification has been verified", message: "Your trusted record is ready. Open your wallet to review the decision and its history.", createdAt: new Date().toISOString()}] : []}}));
  await page.route(`**/api/organizations/${organizationId}/appointments`, route => route.fulfill({json: {appointments: []}}));
  await page.route(`**/api/organizations/${organizationId}/schedule`, route => route.fulfill({json: {schedule: {enabled: false, services: [], slots: [], nextCursor: null}}}));
  await page.route("**/api/pets", route => route.fulfill({json: {pets: []}}));
  await page.route("**/api/appointments", route => route.fulfill({json: {appointments: []}}));
  await page.goto("/employer/appointments");
  await expect(page.getByRole("heading", {name: "Clinic appointments", exact: true})).toBeVisible();
  await expect(page.getByRole("button", {name: `Switch workspace: ${clinicName}`, exact: true}).first()).toBeAttached();
}
async function assertViewport(page: Page) {
  const size = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight, documentWidth: document.documentElement.scrollWidth, mainRight: document.querySelector("main")!.getBoundingClientRect().right, headerRight: document.querySelector("main")!.parentElement!.querySelector("header")!.getBoundingClientRect().right}));
  expect(size.documentWidth).toBeLessThanOrEqual(size.width + 1);
  expect(size.mainRight).toBeCloseTo(size.width, 0);
  expect(size.headerRight).toBeCloseTo(size.width, 0);
}

test("navigation and header fill the viewport at wide, tablet, mobile and short sizes", async ({page}, testInfo) => {
  await workspace(page);
  const mobile = testInfo.project.name === "mobile";
  const sizes = mobile ? [{width: 320, height: 568}, {width: 390, height: 844}, {width: 768, height: 600}] : [{width: 1024, height: 600}, {width: 1920, height: 1080}, {width: 2560, height: 1440}];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await assertViewport(page);
    if (mobile) await page.getByRole("button", {name: "Open navigation"}).click();
    const rail = page.getByRole(mobile ? "dialog" : "complementary", {name: "Primary navigation"});
    await expect(rail).toBeVisible();
    const bounds = await rail.boundingBox();
    expect(bounds!.y).toBeCloseTo(0, 0);
    expect(bounds!.height).toBeCloseTo(size.height, 0);
    await rail.getByRole("button", {name: "Sign out", exact: true}).scrollIntoViewIfNeeded();
    await expect(rail.getByRole("button", {name: "Sign out", exact: true})).toBeInViewport();
    if (mobile) await page.keyboard.press("Escape");
  }
  await page.setViewportSize(testInfo.project.use.viewport!);
  if (mobile) await expect(page.locator("aside")).toHaveCSS("visibility", "hidden");
  await page.evaluate(() => {window.scrollTo(0, 0); document.querySelector("aside")!.scrollTop = 0;});
  await page.screenshot({path: `playwright-report/navigation-qa/${testInfo.project.name}-full-layout.png`, fullPage: true});
});

test("desktop collapse preference persists while mobile keeps readable navigation", async ({page}, testInfo) => {
  await workspace(page);
  if (testInfo.project.name === "mobile") {
    await page.evaluate(() => {localStorage.setItem("vetlinx:navigation-collapsed", "true"); window.dispatchEvent(new Event("vetlinx:navigation-changed"));});
    await page.getByRole("button", {name: "Open navigation"}).click();
    const rail = page.getByRole("dialog", {name: "Primary navigation"});
    await expect(rail.getByRole("link", {name: "Appointments", exact: true})).toContainText("Appointments");
    await expect(rail.getByRole("link", {name: "Appointments", exact: true}).locator("span")).toBeVisible();
    await rail.getByRole("button", {name: "Close navigation"}).click();
  } else {
    const rail = page.getByRole("complementary", {name: "Primary navigation"});
    const originalWidth = (await rail.boundingBox())!.width;
    await page.getByRole("button", {name: "Collapse navigation"}).click();
    await expect(page.getByRole("button", {name: "Expand navigation"})).toBeVisible();
    expect((await rail.boundingBox())!.width).toBeLessThan(originalWidth / 2);
    await expect(rail.getByRole("link", {name: "Appointments", exact: true})).toHaveAttribute("aria-current", "page");
    await assertViewport(page);
    await page.screenshot({path: `playwright-report/navigation-qa/${testInfo.project.name}-collapsed.png`, fullPage: true});
    await page.reload();
    await expect(page.getByRole("button", {name: "Expand navigation"})).toBeVisible();
    await rail.getByRole("button", {name: `Switch workspace: ${clinicName}`}).click();
    await expect(page.getByRole("button", {name: "Collapse navigation"})).toBeVisible();
    await page.getByRole("menuitem", {name: "Pet owner, Maya Rahman"}).click();
    await expect(page).toHaveURL(/\/owner$/);
    await expect(page.getByRole("link", {name: "My pets & appointments", exact: true})).toBeVisible();
    await expect(page.getByRole("link", {name: "Recruitment", exact: true})).toHaveCount(0);
  }
});

test("mobile drawer traps focus, restores its trigger and resets across a desktop resize", async ({page}, testInfo) => {
  await page.setViewportSize({width: 390, height: 600});
  await workspace(page);
  await expect(page.locator("aside")).toHaveAttribute("inert", "");
  const opener = page.getByRole("button", {name: "Open navigation"});
  await opener.click();
  const drawer = page.getByRole("dialog", {name: "Primary navigation"});
  await expect(drawer.getByRole("button", {name: "Close navigation"})).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button", {name: "Sign out"})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(drawer.getByRole("button", {name: "Close navigation"})).toBeFocused();
  await expect.poll(async () => (await drawer.boundingBox())!.x).toBe(0);
  await page.screenshot({path: `playwright-report/navigation-qa/${testInfo.project.name}-drawer.png`});
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await opener.click();
  await page.setViewportSize({width: 1024, height: 768});
  await expect(page.getByRole("complementary", {name: "Primary navigation"})).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await page.setViewportSize({width: 390, height: 600});
  await expect(page.getByRole("dialog", {name: "Primary navigation"})).toHaveCount(0);
  await expect(page.locator("aside")).toHaveAttribute("inert", "");
});

test("notifications stay inside the viewport without expanding the header", async ({page}, testInfo) => {
  await workspace(page, true);
  const header = page.getByRole("banner");
  const originalHeight = (await header.boundingBox())!.height;
  const button = page.getByRole("button", {name: "Notifications, 1 unread"});
  await button.click();
  const popup = page.getByRole("dialog", {name: "Notifications", exact: true});
  await expect(popup).toContainText("Your veterinary qualification has been verified");
  await assertViewport(page);
  const bounds = (await popup.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect((await header.boundingBox())!.height).toBe(originalHeight);
  await page.screenshot({path: `playwright-report/navigation-qa/${testInfo.project.name}-notifications.png`});
  let dismissals = 0;
  await page.route("**/api/notifications/notice/read", route => route.fulfill(++dismissals === 1 ? {status: 503, json: {message: "Unavailable"}} : {json: {ok: true}}));
  const dismiss = popup.getByRole("button", {name: "Mark Your veterinary qualification has been verified as read"});
  await dismiss.click();
  await expect(popup.getByRole("alert")).toBeVisible();
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await expect(popup).toContainText("You have no unread updates");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", {name: "Notifications, 0 unread"})).toBeFocused();
});
