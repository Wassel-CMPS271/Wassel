import { expect, test, type APIResponse, type Response } from "@playwright/test";
import { credentials, signIn } from "./auth-helpers";
import type { DriverDay, Run } from "../src/lib/api/runs";

async function json<T>(response: APIResponse | Response, status = 200): Promise<T> {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

// Independent review of the actual feature candidate, not sample-run responses.
// The dedicated review launcher uses the existing isolated PostgreSQL/auth seed.
test("real Driver Today client: login/2FA, GPS consent/withdrawal, actions, persistence, role denial and 360px", async ({ browser }) => {
  const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:4180";
  const head = await browser.newPage({ baseURL });
  const driver = await browser.newPage({ baseURL, viewport: { width: 360, height: 800 } });
  const parent = await browser.newPage({ baseURL });
  const crashes: string[] = [];
  driver.on("pageerror", error => crashes.push(error.message));
  await driver.context().grantPermissions(["geolocation"]);
  await driver.context().setGeolocation({ latitude: 33.8961, longitude: 35.4823, accuracy: 12.5 });
  const routes = "/api/head-of-transport/routes";
  let routeId: string | undefined;
  try {
    await signIn(head, "HEAD_OF_TRANSPORT");
    const drivers = await json<{ id: string; email: string; assignedVehicleId: string }[]>(await head.request.get("/api/head-of-transport/drivers"));
    const account = drivers.find(item => item.email === credentials().accounts.DRIVER)!;
    expect(account).toBeTruthy();
    expect(account.assignedVehicleId).toBeTruthy();
    await signIn(parent, "PARENT");
    const children = await json<{ studentId: string }[]>(await parent.request.get("/api/parent/children"));
    const students = await json<{ id: string; firstName: string; lastName: string }[]>(await head.request.get("/api/head-of-transport/students"));
    expect(students.length).toBeGreaterThanOrEqual(2);
    const created = await json<{ id: string }>(await head.request.post(routes, { data: {
      name: "Independent real driver review", driverId: account.id, vehicleId: account.assignedVehicleId,
    } }), 201);
    routeId = created.id;
    const selected = students.filter(student => children.some(child => child.studentId === student.id)).slice(0, 2);
    expect(selected).toHaveLength(2);
    for (const student of selected) {
      await json(await head.request.post(`${routes}/${routeId}/students`, { data: { studentId: student.id } }));
    }
    const initialRead = driver.waitForResponse(r => new URL(r.url()).pathname === "/api/driver/runs/today" && r.request().method() === "GET");
    await signIn(driver, "DRIVER");
    const initial: DriverDay = await (await initialRead).json();
    expect(initial.dayType).not.toBe("HOLIDAY");
    const morning = initial.runs.find(run => run.route.id === routeId && run.direction === "MORNING")!;
    expect(morning).toBeTruthy();
    expect(morning.state).toBe("NOT_STARTED");
    expect(morning.stops).toHaveLength(2);
    await expect(driver.getByRole("heading", { name: "Independent real driver review" })).toBeVisible();
    const runPath = `/api/driver/runs/${morning.id}`;
    const action = async (method: string, path: string, label: string) => {
      const response = driver.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === method);
      await driver.getByRole("button", { name: label, exact: true }).click();
      const actual = await response;
      expect(actual.status(), await actual.text()).toBe(200);
      return actual.json() as Promise<Run>;
    };
    expect((await action("POST", `${runPath}/start`, "Start run")).state).toBe("IN_PROGRESS");
    const sharingPath = `${runPath}/location-sharing`;
    const locationPath = `${runPath}/location`;
    const shared = driver.waitForResponse(r => new URL(r.url()).pathname === sharingPath && r.request().method() === "PUT" && r.request().postDataJSON().enabled === true);
    const sent = driver.waitForResponse(r => new URL(r.url()).pathname === locationPath && r.request().method() === "PUT");
    await driver.getByRole("button", { name: "Share my location", exact: true }).click();
    expect((await json<Run & { locationSharing: boolean }>(await shared)).locationSharing).toBe(true);
    const fix = await sent; expect(fix.status()).toBe(204);
    expect(fix.request().postDataJSON()).toEqual({ latitude: 33.8961, longitude: 35.4823, accuracyMeters: 12.5 });
    const busPath = `/api/parent/children/${selected[0].id}/bus-location`;
    expect(await json(await parent.request.get(busPath))).toMatchObject({ status: "LIVE", position: { latitude: 33.8961, longitude: 35.4823 } });
    const withdrew = driver.waitForResponse(r => new URL(r.url()).pathname === sharingPath && r.request().method() === "PUT" && r.request().postDataJSON().enabled === false);
    await driver.getByRole("button", { name: "Stop sharing", exact: true }).click();
    expect((await json<Run & { locationSharing: boolean }>(await withdrew)).locationSharing).toBe(false);
    expect(await json(await parent.request.get(busPath))).toMatchObject({ status: "UNAVAILABLE", position: null });
    const first = morning.stops[0], second = morning.stops[1];
    const row = driver.getByRole("listitem").filter({ hasText: `${first.firstName} ${first.lastName}` });
    const confirmationPath = `${runPath}/students/${first.studentId}/confirmation`;
    let response = driver.waitForResponse(r => new URL(r.url()).pathname === confirmationPath && r.request().method() === "PUT");
    await row.getByRole("button", { name: "Picked up", exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(row.getByText(/done.*picked up/i)).toBeVisible();
    response = driver.waitForResponse(r => new URL(r.url()).pathname === confirmationPath && r.request().method() === "PUT");
    await row.getByRole("button", { name: "Dropped off", exact: true }).click();
    expect((await response).status()).toBe(200);
    const secondPath = `${runPath}/students/${second.studentId}/confirmation`;
    response = driver.waitForResponse(r => new URL(r.url()).pathname === secondPath && r.request().method() === "PUT");
    await driver.getByRole("listitem").filter({ hasText: `${second.firstName} ${second.lastName}` }).getByRole("button", { name: "Not present", exact: true }).click();
    expect((await response).status()).toBe(200);
    const persisted = await json<DriverDay>(await driver.request.get("/api/driver/runs/today"));
    const saved = persisted.runs.find(run => run.id === morning.id)!;
    expect(saved.stops.find(stop => stop.studentId === first.studentId)?.confirmation?.status).toBe("DROPPED_OFF");
    expect(saved.stops.find(stop => stop.studentId === second.studentId)?.confirmation?.status).toBe("NOT_PRESENT");
    await driver.reload();
    await expect(driver.getByRole("listitem").filter({ hasText: `${first.firstName} ${first.lastName}` }).getByText(/done.*dropped off/i)).toBeVisible();
    expect((await action("POST", `${runPath}/end`, "End run")).state).toBe("FINISHED");
    const final = await json<DriverDay>(await driver.request.get("/api/driver/runs/today"));
    expect(final.runs.find(run => run.id === morning.id)?.state).toBe("FINISHED");
    expect((await parent.request.get("/api/driver/runs/today")).status()).toBe(403);
    expect((await parent.request.post(`${runPath}/start`)).status()).toBe(403);
    const size = await driver.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    expect(size.width).toBeLessThanOrEqual(size.viewport);
    expect(crashes).toEqual([]);
    await driver.screenshot({ path: "e2e-artifacts/driver-real-360.png", fullPage: true });
    console.log("PASS real driver client: PostgreSQL/Flyway, real password+2FA, browser geolocation fixture with real consent/location APIs and parent LIVE/withdrawal, GET today, POST start/end, PUT pickup/dropoff/not-present, reload persistence, parent role denied, 360px without overflow or crashes.");
  } finally {
    if (routeId) {
      const cleanup = await head.request.delete(`${routes}/${routeId}`);
      expect(cleanup.status(), await cleanup.text()).toBe(204);
    }
    await Promise.all([head.close(), driver.close(), parent.close()]);
  }
});
