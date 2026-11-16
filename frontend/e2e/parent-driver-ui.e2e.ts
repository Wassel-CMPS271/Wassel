import { expect, test, type APIResponse } from "@playwright/test";
import { credentials, signIn } from "./auth-helpers";
async function json<T>(r: APIResponse, status = 200): Promise<T> { expect(r.status(), await r.text()).toBe(status); return r.json(); }
test("actual candidate driver UI feeds the production Parent Leaflet map and ETA", async ({ browser }) => {
 test.setTimeout(240_000);
 const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:4180";
 const parent = await browser.newPage({ baseURL, viewport: { width: 360, height: 800 } });
 const head = await browser.newPage({ baseURL });
 const driver = await browser.newPage({ baseURL: "http://127.0.0.1:4192", viewport: { width: 360, height: 800 } });
 const errors: string[] = []; parent.on("pageerror", e => errors.push(e.message)); driver.on("pageerror", e => errors.push(e.message));
 await driver.context().grantPermissions(["geolocation"]);
 await driver.context().setGeolocation({ latitude: 33.8800, longitude: 35.5200, accuracy: 12.5 });
 const routes = "/api/head-of-transport/routes";
 let routeId: string | undefined;
 let gpsFeed: ReturnType<typeof setInterval> | undefined;
 let feeding = false;
 try {
  await signIn(parent, "PARENT"); await signIn(head, "HEAD_OF_TRANSPORT");
  const children = await json<{ studentId: string; firstName: string; lastName: string }[]>(await parent.request.get("/api/parent/children")); expect(children).toHaveLength(2);
  const drivers = await json<{ id: string; email: string; assignedVehicleId: string }[]>(await head.request.get("/api/head-of-transport/drivers"));
  const account = drivers.find(d => d.email === credentials().accounts.DRIVER)!; expect(account).toBeTruthy();
  routeId = (await json<{ id: string }>(await head.request.post(routes, { data: { name: "Dual UI parent review", driverId: account.id, vehicleId: account.assignedVehicleId } }), 201)).id;
  for (const child of children) await json(await head.request.post(`${routes}/${routeId}/students`, { data: { studentId: child.studentId } }));
  await signIn(driver, "DRIVER");
  const day = await json<{ runs: { id: string; route: { id: string }; direction: string }[] }>(await driver.request.get("/api/driver/runs/today"));
  const run = day.runs.find(r => r.route.id === routeId && r.direction === "MORNING")!; expect(run).toBeTruthy();
  const runPath = `/api/driver/runs/${run.id}`;
  // Refresh the new route assignment once BEFORE the driver starts. Tracking
  // then stays open across both run transitions, with no reload or manual refresh.
  const childSnapshot = parent.waitForResponse(r => new URL(r.url()).pathname === "/api/parent/children" && r.request().method() === "GET");
  await parent.getByRole("button", { name: "Refresh transport details", exact: true }).click(); expect((await childSnapshot).status()).toBe(200);
  await parent.getByRole("button", { name: "Bus tracking", exact: true }).click(); await expect(parent.getByText("Run not started.", { exact: true })).toBeVisible();
  await expect(parent.locator(".leaflet-marker-icon")).toHaveCount(0); await expect(parent.getByRole("timer")).toHaveCount(0);
  const start = driver.waitForResponse(r => new URL(r.url()).pathname === `${runPath}/start` && r.request().method() === "POST");
  await driver.getByRole("button", { name: "Start run", exact: true }).click(); expect((await start).status()).toBe(200);
  const sharing = driver.waitForResponse(r => new URL(r.url()).pathname === `${runPath}/location-sharing` && r.request().postDataJSON()?.enabled === true);
  const sent = driver.waitForResponse(r => new URL(r.url()).pathname === `${runPath}/location` && r.request().method() === "PUT");
  await driver.getByRole("button", { name: "Share my location", exact: true }).click(); expect((await sharing).status()).toBe(200);
  const fix = await sent; expect(fix.status()).toBe(204); expect(fix.request().postDataJSON()).toEqual({ latitude: 33.8800, longitude: 35.5200, accuracyMeters: 12.5 });
  // Real browser position updates keep the actual API fix fresh during the
  // coarse run-status poll; no business API response is mocked.
  feeding = true;
  gpsFeed = setInterval(() => { void driver.context().setGeolocation({ latitude: 33.8800, longitude: 35.5200, accuracy: 12.5 }).catch(error => { if (feeding) errors.push(`GPS fixture: ${String(error)}`); }); }, 15_000);
  await expect(parent.getByText("Live bus location", { exact: true })).toBeVisible({ timeout: 90_000 }); await expect(parent.locator(".leaflet-marker-icon")).toHaveCount(1);
  await expect(parent.getByRole("timer")).toContainText("Estimated arrival in");
  const path = (id: string) => `/api/parent/children/${id}/bus-location`;
  expect(await json(await parent.request.get(path(children[0].studentId)))).toMatchObject({ status: "LIVE", position: { latitude: 33.8800, longitude: 35.5200, accuracyMeters: 12.5 } });
  await parent.getByRole("combobox", { name: "Choose child for bus tracking" }).selectOption(children[1].studentId);
  await expect(parent.getByRole("heading", { name: `Bus tracking for ${children[1].firstName} ${children[1].lastName}` })).toBeVisible(); await expect(parent.getByRole("timer")).toBeVisible();
  feeding = false; clearInterval(gpsFeed);
  const stop = driver.waitForResponse(r => new URL(r.url()).pathname === `${runPath}/location-sharing` && r.request().postDataJSON()?.enabled === false);
  await driver.getByRole("button", { name: "Stop sharing", exact: true }).click(); expect((await stop).status()).toBe(200);
  await expect(parent.getByText("Bus location is unavailable.")).toBeVisible({ timeout: 20_000 });
  await expect(parent.locator(".leaflet-marker-icon")).toHaveCount(0); await expect(parent.getByRole("timer")).toHaveCount(0);
  expect(await json(await parent.request.get(path(children[1].studentId)))).toMatchObject({ status: "UNAVAILABLE", position: null, estimate: null });
  const ended = driver.waitForResponse(r => new URL(r.url()).pathname === `${runPath}/end` && r.request().method() === "POST");
  await driver.getByRole("button", { name: "End run", exact: true }).click(); await driver.getByRole("button", { name: "Confirm end run", exact: true }).click(); expect((await ended).status()).toBe(200);
  await expect(parent.getByText("Run not started.", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(parent.getByText(/Planned morning pickup/)).toHaveCount(0); await expect(parent.getByRole("timer")).toHaveCount(0);
  for (const page of [parent, driver]) {
   const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth })); expect(size.width).toBeLessThanOrEqual(size.viewport);
  }
  expect((await parent.request.get("/api/driver/runs/today")).status()).toBe(403);
  expect((await driver.request.get(path(children[0].studentId))).status()).toBe(403);
  expect(errors).toEqual([]);
  await parent.screenshot({ path: "e2e-artifacts/parent-dual-ui-360.png", fullPage: true });
  console.log("PASS actual driver candidate UI -> real consent/location APIs -> production Parent Leaflet/ETA, automatic run start/end without reload, withdrawal, child switching, real password/2FA, PostgreSQL/Flyway, roles and both 360px layouts. Browser device GPS is simulated; offline replay and physical GPS are not certified.");
 } finally {
  feeding = false; clearInterval(gpsFeed);
  if (routeId) expect((await head.request.delete(`${routes}/${routeId}`)).status()).toBe(204);
  await Promise.all([parent.close(), head.close(), driver.close()]);
 }
});
