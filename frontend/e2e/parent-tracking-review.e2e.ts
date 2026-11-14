import { expect, test, type APIResponse } from "@playwright/test";
import { credentials, signIn } from "./auth-helpers";
async function json<T>(response: APIResponse, status = 200): Promise<T> { expect(response.status(), await response.text()).toBe(status); return response.json(); }
test("real parent GPS: cookie auth, Leaflet, isolation, stale expiry, withdrawal and 360px", async ({ browser }) => {
  test.setTimeout(180_000); // Real server GPS freshness boundary is 60 seconds.
  const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:4180";
  const parent = await browser.newPage({ baseURL, viewport: { width: 360, height: 800 } });
  const head = await browser.newPage({ baseURL }); const driver = await browser.newPage({ baseURL });
  const errors: string[] = []; parent.on("pageerror", e => errors.push(e.message));
  let routeId: string | undefined;
  const routes = "/api/head-of-transport/routes";
  try {
    await signIn(parent, "PARENT");
    const children = await json<{ studentId: string; firstName: string; lastName: string }[]>(await parent.request.get("/api/parent/children")); expect(children.length).toBeGreaterThanOrEqual(2);
    await signIn(head, "HEAD_OF_TRANSPORT");
    const drivers = await json<{ id: string; email: string; assignedVehicleId: string }[]>(await head.request.get("/api/head-of-transport/drivers"));
    const students = await json<{ id: string }[]>(await head.request.get("/api/head-of-transport/students"));
    const foreign = students.find(s => !children.some(c => c.studentId === s.id)); expect(foreign).toBeTruthy();
    const account = drivers.find(d => d.email === credentials().accounts.DRIVER)!; expect(account).toBeTruthy();
    routeId = (await json<{ id: string }>(await head.request.post(routes, { data: { name: "Independent parent GPS review", driverId: account.id, vehicleId: account.assignedVehicleId } }), 201)).id;
    for (const child of children.slice(0, 2)) await json(await head.request.post(`${routes}/${routeId}/students`, { data: { studentId: child.studentId } }));
    await signIn(driver, "DRIVER");
    const day = await json<{ runs: { id: string; route: { id: string }; direction: string }[] }>(await driver.request.get("/api/driver/runs/today"));
    const run = day.runs.find(r => r.route.id === routeId && r.direction === "MORNING")!; expect(run).toBeTruthy();
    const runPath = `/api/driver/runs/${run.id}`;
    await json(await driver.request.post(`${runPath}/start`));
    const path = (id: string) => `/api/parent/children/${id}/bus-location`;
    expect(await json(await parent.request.get(path(children[0].studentId)))).toMatchObject({ status: "UNAVAILABLE", position: null });
    await json(await driver.request.put(`${runPath}/location-sharing`, { data: { enabled: true } }));
    expect((await driver.request.put(`${runPath}/location`, { data: { latitude: 33.8961, longitude: 35.4823, accuracyMeters: 12.5 } })).status()).toBe(204);
    await parent.reload(); await parent.getByRole("button", { name: "Bus tracking", exact: true }).click();
    await expect(parent.getByText("Live bus location", { exact: true })).toBeVisible();
    await expect(parent.locator(".leaflet-marker-icon")).toHaveCount(1);
    await expect(parent.getByRole("timer")).toHaveCount(0); // ETA feature is unmerged and disabled.
    await expect(parent.getByText("Live arrival estimate is not available yet.")).toBeVisible();
    const picker = parent.getByRole("combobox", { name: "Choose child for bus tracking" });
    const switched = parent.waitForResponse(r => new URL(r.url()).pathname === path(children[1].studentId));
    await picker.selectOption(children[1].studentId); expect((await switched).status()).toBe(200);
    await expect(parent.getByRole("heading", { name: `Bus tracking for ${children[1].firstName} ${children[1].lastName}` })).toBeVisible();
    const width = await parent.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth })); expect(width.width).toBeLessThanOrEqual(width.viewport);
    for (const button of await parent.locator(".leaflet-control-zoom a").all()) { const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); }
    await parent.screenshot({ path: "e2e-artifacts/parent-gps-live-360.png", fullPage: true });
    await expect(parent.getByText(/This position is stale/)).toBeVisible({ timeout: 75_000 });
    const stale = await json<{ status: string; position: { ageSeconds: number } }>(await parent.request.get(path(children[1].studentId)));
    expect(stale.status).toBe("STALE"); expect(stale.position.ageSeconds).toBeGreaterThanOrEqual(60); // displayed age is truncated
    await expect(parent.getByText("Live bus location", { exact: true })).toHaveCount(0);
    await parent.screenshot({ path: "e2e-artifacts/parent-gps-stale-360.png", fullPage: true });
    await json(await driver.request.put(`${runPath}/location-sharing`, { data: { enabled: false } }));
    await expect(parent.getByText("Bus location is unavailable.")).toBeVisible({ timeout: 20_000 });
    await expect(parent.locator(".leaflet-marker-icon")).toHaveCount(0);
    expect((await parent.request.get(path(foreign!.id))).status()).toBe(404);
    expect((await parent.request.get(path("00000000-0000-0000-0000-000000000000"))).status()).toBe(404);
    expect((await head.request.get(path(children[0].studentId))).status()).toBe(403);
    expect((await parent.request.put(`${runPath}/location-sharing`, { data: { enabled: true } })).status()).toBe(403);
    const signedOut = await browser.newContext({ baseURL }); expect((await signedOut.request.get(path(children[0].studentId))).status()).toBe(401); await signedOut.close();
    expect(errors).toEqual([]);
    console.log("PASS real merged GPS: real password/2FA, PostgreSQL/Flyway, driver API feed, parent production navigation + Leaflet, child switch, server STALE after 60s, withdrawal, 401/403/404, 360px. ETA not integrated; driver phone UI not claimed.");
  } finally {
    if (routeId) expect((await head.request.delete(`${routes}/${routeId}`)).status()).toBe(204);
    await Promise.all([parent.close(), head.close(), driver.close()]);
  }
});
