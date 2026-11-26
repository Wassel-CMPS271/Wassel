import { expect, test, type APIResponse, type Response } from "@playwright/test";
import { credentials, signIn } from "./auth-helpers";
import type { DriverDay, Run } from "../src/lib/api/runs";
async function json<T>(r: APIResponse | Response, status = 200): Promise<T> { expect(r.status(), await r.text()).toBe(status); return r.json(); }

test("real offline confirmations survive reconnect/reload and replay idempotently without duplicate inbox entries", async ({ browser }) => {
 const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:4180";
 const head = await browser.newPage({ baseURL }); const driver = await browser.newPage({ baseURL, viewport: { width: 360, height: 800 } }); const parent = await browser.newPage({ baseURL });
 await driver.clock.install({ time: new Date("2026-11-02T08:00:00Z") });
 const routes = "/api/head-of-transport/routes"; let routeId: string | undefined;
 try {
  await signIn(head, "HEAD_OF_TRANSPORT"); await signIn(parent, "PARENT");
  const children = await json<{ studentId: string }[]>(await parent.request.get("/api/parent/children")); expect(children).toHaveLength(2);
  const drivers = await json<{ id: string; email: string; assignedVehicleId: string }[]>(await head.request.get("/api/head-of-transport/drivers"));
  const account = drivers.find(item => item.email === credentials().accounts.DRIVER)!; expect(account).toBeTruthy();
  routeId = (await json<{ id: string }>(await head.request.post(routes, { data: { name: "Independent offline replay", driverId: account.id, vehicleId: account.assignedVehicleId } }), 201)).id;
  for (const child of children) await json(await head.request.post(`${routes}/${routeId}/students`, { data: { studentId: child.studentId } }));
  const initial = driver.waitForResponse(response => new URL(response.url()).pathname === "/api/driver/runs/today" && response.request().method() === "GET"); await signIn(driver, "DRIVER");
  const day = await json<DriverDay>(await initial); const run = day.runs.find(item => item.route.id === routeId && item.direction === "MORNING")!; expect(run).toBeTruthy(); expect(run.stops).toHaveLength(2);
  const started = driver.waitForResponse(response => new URL(response.url()).pathname === `/api/driver/runs/${run.id}/start` && response.request().method() === "POST"); await driver.getByRole("button", { name: "Start run", exact: true }).click(); expect((await json<Run>(await started)).state).toBe("IN_PROGRESS");
  const confirmations = run.stops.map(stop => `/api/driver/runs/${run.id}/students/${stop.studentId}/confirmation`);
  const attempted: { path: string; status: string; clientRequestId: string }[] = [];
  driver.on("request", request => { const path = new URL(request.url()).pathname; if (confirmations.includes(path) && request.method() === "PUT") attempted.push({ path, ...request.postDataJSON() }); });
  await driver.context().setOffline(true);
  await expect(driver.getByText(/^You’re offline\.|^You\x27re offline\./)).toBeVisible();
  const labels = ["Picked up", "Not present"];
  for (let i = 0; i < 2; i++) {
   const stop = run.stops[i]; const row = driver.getByRole("listitem").filter({ hasText: `${stop.firstName} ${stop.lastName}` });
   await row.getByRole("button", { name: labels[i], exact: true }).click(); // SCRUM-298: a network-waiting tap stays saved with the same durable key.
   await expect(row.getByText(/^Saved on phone/)).toBeVisible();
   await expect(row.getByText(/^Couldn.t send/)).toHaveCount(0);
   await expect(row.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  }
  // APIRequestContext is an independent real server oracle; only browser networking is offline.
  const before = (await json<DriverDay>(await driver.request.get("/api/driver/runs/today"))).runs.find(item => item.id === run.id)!;
  expect(before.stops.every(stop => stop.confirmation === null)).toBe(true);
  expect(attempted.length).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < 2; i++) {
   const savedAttempts = attempted.filter(item => item.path === confirmations[i]);
   expect(savedAttempts.length).toBeGreaterThanOrEqual(1);
   expect(new Set(savedAttempts.map(item => item.clientRequestId)).size).toBe(1);
   expect(savedAttempts.every(item => item.status === ["PICKED_UP", "NOT_PRESENT"][i])).toBe(true);
  }
  const sent = confirmations.map(path => driver.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "PUT" && response.status() === 200));
  await driver.context().setOffline(false); await driver.reload();
  const receipts = await Promise.all(sent); const statuses = ["PICKED_UP", "NOT_PRESENT"];
  for (let i = 0; i < 2; i++) {
   const body = receipts[i].request().postDataJSON(); expect(body).toEqual({ status: statuses[i], clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
   expect(new Set(attempted.filter(item => item.path === confirmations[i]).map(item => item.clientRequestId)).size).toBe(1);
   expect(attempted.filter(item => item.path === confirmations[i]).every(item => item.status === statuses[i])).toBe(true);
   // A lost success receipt may replay after a reload; the real server must accept
   // that exact durable key, preserving the same confirmation rather than duplicating it.
   const original = (await receipts[i].json() as Run).stops.find(stop => stop.studentId === run.stops[i].studentId)?.confirmation;
   expect(original?.status).toBe(statuses[i]);
   const duplicate = await json<Run>(await driver.request.put(confirmations[i], { data: body }));
   expect(duplicate.stops.find(stop => stop.studentId === run.stops[i].studentId)?.confirmation).toEqual(original);
  }
  const after = (await json<DriverDay>(await driver.request.get("/api/driver/runs/today"))).runs.find(item => item.id === run.id)!;
  for (let i = 0; i < 2; i++) expect(after.stops.find(stop => stop.studentId === run.stops[i].studentId)?.confirmation?.status).toBe(statuses[i]);
  const events = await json<{ studentId: string; type: string }[]>(await parent.request.get("/api/parent/inbox"));
  for (let i = 0; i < 2; i++) expect(events.filter(event => event.studentId === run.stops[i].studentId && event.type === statuses[i])).toHaveLength(1);
  const pickedUpRow = driver.getByRole("listitem").filter({ hasText: `${run.stops[0].firstName} ${run.stops[0].lastName}` });
  await expect(pickedUpRow.getByText("Done · Picked up", { exact: true })).toBeVisible();
  const absentRow = driver.getByRole("listitem").filter({ hasText: `${run.stops[1].firstName} ${run.stops[1].lastName}` });
  // A confirmed NOT_PRESENT stop is done; unconfirmed parent-reported
  // absence is the separate Skip state. Pin the complete confirmation label.
  expect(after.counts).toMatchObject({ students: 2, pickedUp: 1, notPresent: 1 });
  await expect(absentRow.getByText("Done · Not present", { exact: true })).toBeVisible();
  const size = await driver.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth })); expect(size.width).toBeLessThanOrEqual(size.viewport);
  console.log("PASS actual offline taps are durably retained through network failures, two durable confirmations survive reconnect plus online reload, real replay uses stable keys, idempotent duplicate receipt produces one inbox event each, real password/2FA and 360px. No business response mocked. Offline cold app loading and physical devices are not certified.");
 } finally { await driver.context().setOffline(false); if (routeId) expect((await head.request.delete(`${routes}/${routeId}`)).status()).toBe(204); await Promise.all([head.close(), driver.close(), parent.close()]); }
});
