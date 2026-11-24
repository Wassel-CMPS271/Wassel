import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { credentials, signIn, signInAs } from "./auth-helpers";
import { api, baseURL, card, childrenOf, cleanup, createRoute, driverByEmail, driverPage, found, headRun, morningRun, refused, savedTaps, watchInbox } from "./transport-helpers";
import type { Child } from "../src/lib/api/myChildren";
import type { BusLocation } from "../src/lib/api/parentTracking";
import type { DriverDay, Reassignment, Run } from "../src/lib/api/runs";

// Every response comes from the real Spring API through the real Next proxy. The only fakes are the test
// Monday (backend clock, browser clock) and context.setOffline, a real network interruption.
const NADIA = "auth+driver-nadia@auth-e2e.invalid", RAMI = "auth+driver-rami@auth-e2e.invalid";
const heads = "/api/head-of-transport";
const position = { latitude: 33.88, longitude: 35.52, accuracyMeters: 12.5 };
const share = async (page: Page, runPath: string) => {
  await api(page, "put", `${runPath}/location-sharing`, 200, { enabled: true });
  await api(page, "put", `${runPath}/location`, 204, position);
};
const confirmedAt = (run: Run, studentId: string) => run.stops.find(s => s.studentId === studentId)?.confirmation?.at;

test("reassignment journey: Head UI, old driver 404 on every write, new driver continues", async ({ browser }) => {
  test.setTimeout(240_000);
  const parent = await browser.newPage({ baseURL, viewport: { width: 360, height: 800 } });
  const head = await browser.newPage({ baseURL }), rami = await browser.newPage({ baseURL });
  const karim = await driverPage(browser), nadia = await driverPage(browser);
  let routeId: string | undefined, runId = "", runPath = "", passed = false;
  try {
    await signIn(parent, "PARENT"); await signIn(head, "HEAD_OF_TRANSPORT"); await signInAs(rami, RAMI, "DRIVER");
    await signInAs(nadia, NADIA, "DRIVER"); // signed in up front so the cleanup can end the run as her whatever fails
    const { lea, jad } = await childrenOf(parent);
    const names = [lea, jad].map(c => `${c.firstName} ${c.lastName}`);
    const added = await watchInbox(parent);
    const karimAccount = await driverByEmail(head, credentials().accounts.DRIVER), nadiaAccount = await driverByEmail(head, NADIA);
    const label = "Transport E2E reassignment (morning)";
    const children = () => api<Child[]>(parent, "get", "/api/parent/children");
    let leaAt: string | undefined;

    await test.step("Karim starts the run and shares one position; the parent sees it live", async () => {
      routeId = await createRoute(head, "Transport E2E reassignment", karimAccount, [lea.studentId, jad.studentId]);
      await signIn(karim, "DRIVER");
      runId = await morningRun(karim, routeId); runPath = `/api/driver/runs/${runId}`;
      await karim.getByRole("button", { name: "Start run", exact: true }).click();
      await expect(karim.getByRole("button", { name: "End run", exact: true })).toBeVisible();
      await share(karim, runPath);
      expect((await api<BusLocation>(parent, "get", `/api/parent/children/${lea.studentId}/bus-location`)).status).toBe("LIVE");
      await parent.reload(); await parent.getByRole("button", { name: "Bus tracking", exact: true }).click();
      await expect(parent.getByText("Live bus location", { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(parent.locator(".leaflet-marker-icon")).toHaveCount(1);
    });

    const k1 = randomUUID();
    await test.step("Karim picks Lea up, then taps Jad twice while offline; a second key for Lea is sent by API", async () => {
      await card(karim, names[0]).getByRole("button", { name: "Picked up", exact: true }).click();
      await expect.poll(added).toEqual([`${lea.studentId}:PICKED_UP`]);
      await karim.context().setOffline(true);
      await card(karim, names[1]).getByRole("button", { name: "Picked up", exact: true }).click();
      await card(karim, names[1]).getByRole("button", { name: "Dropped off", exact: true }).click();
      await expect(card(karim, names[1]).getByText("Saved on phone", { exact: false })).toBeVisible();
      const saved = await savedTaps(karim); // the queue's storage has no fixed order
      expect(saved.length).toBe(2); // a number, so a failed run's summary can say how many taps the phone held
      expect(saved.map(t => `${t.studentId}:${t.status}`).sort()).toEqual([`${jad.studentId}:DROPPED_OFF`, `${jad.studentId}:PICKED_UP`].sort());
      // K1 has never been sent: it is a second key for a status Lea already has (runs.md, offline replay rule 5). Karim still
      // owns the run, so it is a 200 that keeps her first confirmation time and records nothing more.
      const run = await api<Run>(karim.context(), "put", `${runPath}/students/${lea.studentId}/confirmation`, 200, { status: "PICKED_UP", clientRequestId: k1 });
      leaAt = confirmedAt(run, lea.studentId);
      expect(leaAt).toBeTruthy();
      expect(await added()).toEqual([`${lea.studentId}:PICKED_UP`]);
    });

    await test.step("the Head reassigns the live run to Nadia in the UI", async () => {
      await head.goto("/head-of-transport/live");
      await head.getByRole("button", { name: `Reassign driver for ${label}` }).click({ timeout: 45_000 });
      const dialog = head.getByRole("dialog");
      await dialog.getByLabel("New driver").selectOption({ label: "Nadia Khoury" });
      await dialog.getByLabel("Reason (optional)").fill("Karim off sick (E2E)");
      await dialog.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Nadia Khoury now drives Transport E2E reassignment");
      await expect(dialog.getByRole("listitem").first()).toContainText("Nadia Khoury replaced Karim Haddad");
      await expect(dialog.getByRole("listitem").first()).toContainText("auth+head@auth-e2e.invalid");
      const history = await api<Reassignment[]>(head, "get", `${heads}/runs/${runId}/reassignments`);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ runState: "IN_PROGRESS", fromDriver: { id: karimAccount.id }, toDriver: { id: nadiaAccount.id }, reason: "Karim off sick (E2E)" });
      // Same run, same state and counts, new driver; the parent's children follow the route.
      const run = await headRun(head, runId);
      expect(run).toMatchObject({ state: "IN_PROGRESS", driver: { id: nadiaAccount.id }, counts: { students: 2, pickedUp: 1, notPresent: 0 } });
      for (const child of await children()) expect(child.driver?.id).toBe(nadiaAccount.id);
    });

    await test.step("Karim's every write is a 404, including the replay of a key he used before", async () => {
      const lost = { request: karim.context().request };
      for (const [method, path, data] of [
        ["post", `${runPath}/start`], ["post", `${runPath}/end`],
        ["put", `${runPath}/students/${jad.studentId}/confirmation`, { status: "PICKED_UP", clientRequestId: randomUUID() }],
        ["put", `${runPath}/students/${lea.studentId}/confirmation`, { status: "PICKED_UP", clientRequestId: k1 }], // never the "already applied" 200
        ["put", `${runPath}/location-sharing`, { enabled: true }],
        ["put", `${runPath}/location`, position],
      ] as const) await refused(lost, method, path, 404, data);
      expect((await api<DriverDay>(lost, "get", "/api/driver/runs/today")).runs).toEqual([]);
      await refused(rami, "put", `${runPath}/students/${jad.studentId}/confirmation`, 404, { status: "PICKED_UP" });
    });

    await test.step("Karim reconnects: the saved taps are dropped with a notice, nothing is recorded for him", async () => {
      await karim.context().setOffline(false);
      // Karim's day has already been reloaded without the run, so the page cannot name the student: it says "that student".
      await expect(karim.getByRole("status").filter({ hasText: "Run not found. 1 later tap for that student was not sent." })).toBeVisible({ timeout: 45_000 });
      await expect(karim.getByText("Saved on phone")).toHaveCount(0);
      expect(await savedTaps(karim)).toEqual([]);
      expect(await added()).toEqual([`${lea.studentId}:PICKED_UP`]);
      expect((await headRun(head, runId)).counts).toMatchObject({ students: 2, pickedUp: 1, droppedOff: 0, notPresent: 0 }); // Jad is still unconfirmed
    });

    // Jad is still waiting for the bus, so he is the child whose tracking shows (a picked-up child has none).
    await test.step("the parent's tracking goes unavailable: Nadia has not shared yet", async () => {
      expect((await api<BusLocation>(parent, "get", `/api/parent/children/${jad.studentId}/bus-location`)).status).toBe("UNAVAILABLE");
      await parent.reload(); await parent.getByRole("button", { name: "Bus tracking", exact: true }).click();
      await parent.getByRole("combobox", { name: "Choose child for bus tracking" }).selectOption(jad.studentId);
      await expect(parent.getByRole("status").filter({ hasText: "Bus location is unavailable." })).toBeVisible();
      await expect(parent.locator(".leaflet-marker-icon")).toHaveCount(0);
    });

    await test.step("Nadia reloads, sees Lea already picked up, shares, and picks Jad up", async () => {
      await nadia.reload();
      const run = found((await api<DriverDay>(nadia, "get", "/api/driver/runs/today")).runs.find(r => r.id === runId), "the run on Nadia's day");
      expect(run.state).toBe("IN_PROGRESS");
      expect(run.stops.find(s => s.studentId === lea.studentId)?.confirmation?.status).toBe("PICKED_UP");
      expect(confirmedAt(run, lea.studentId)).toBe(leaAt); // the time Karim's tap made, not a new one
      expect(confirmedAt(run, jad.studentId)).toBeUndefined();
      await share(nadia, runPath);
      expect((await api<BusLocation>(parent, "get", `/api/parent/children/${jad.studentId}/bus-location`)).status).toBe("LIVE");
      await card(nadia, names[1]).getByRole("button", { name: "Picked up", exact: true }).click();
      await expect.poll(added).toEqual([`${lea.studentId}:PICKED_UP`, `${jad.studentId}:PICKED_UP`].sort());
      expect((await headRun(head, runId)).counts).toMatchObject({ students: 2, pickedUp: 2 });
    });
    passed = true;
  } finally {
    await cleanup({
      head, routes: [{ id: routeId, runId }], drivers: [karim.context(), nadia.context()], passed,
      undo: [() => karim.context().setOffline(false)],
      contexts: [parent.context(), head.context(), rami.context(), karim.context(), nadia.context()],
    });
  }
});

test("reassignment failures through the real proxy: 401, 403, 404, 400 and a stale 409 change nothing, and a live route is not deletable", async ({ browser }) => {
  test.setTimeout(120_000);
  const [parent, head, driver, nadia, admin] = await Promise.all([1, 2, 3, 4, 5].map(() => browser.newPage({ baseURL })));
  const signedOut = await browser.newContext({ baseURL });
  let routeId: string | undefined, otherRouteId: string | undefined, runId = "", passed = false;
  try {
    await signIn(parent, "PARENT"); await signIn(head, "HEAD_OF_TRANSPORT"); await signIn(driver, "DRIVER"); await signInAs(nadia, NADIA, "DRIVER"); await signIn(admin, "ADMIN");
    const { lea, jad } = await childrenOf(parent);
    const karimAccount = await driverByEmail(head, credentials().accounts.DRIVER), nadiaAccount = await driverByEmail(head, NADIA), ramiAccount = await driverByEmail(head, RAMI);
    routeId = await createRoute(head, "Transport E2E reassignment failures", karimAccount, [lea.studentId, jad.studentId]);
    runId = await morningRun(driver, routeId);
    await api(driver, "post", `/api/driver/runs/${runId}/start`);
    const path = `${heads}/runs/${runId}/reassignments`, body = { driverId: nadiaAccount.id, fromDriverId: karimAccount.id };
    const history = () => api<Reassignment[]>(head, "get", path);

    await test.step("who may reassign: signed out 401, parent, driver and admin 403; a driver may not read the history; an unknown run is 404", async () => {
      await refused(signedOut, "post", path, 401, body);
      await refused(parent, "post", path, 403, body);
      await refused(driver, "post", path, 403, body);
      await refused(admin, "post", path, 403, body);
      await refused(driver, "get", path, 403);
      await refused(signedOut, "get", "/api/driver/runs/today", 401);
      await refused(head, "post", `${heads}/runs/${randomUUID()}/reassignments`, 404, body);
      expect(await history()).toHaveLength(0);
    });

    await test.step("what is refused or ignored: a reason over 200 characters is 400, the same driver is 200, a driver on another route is 409", async () => {
      await refused(head, "post", path, 400, { ...body, reason: "x".repeat(201) });
      await api(head, "post", path, 200, { driverId: karimAccount.id, fromDriverId: karimAccount.id }); // the route already has him: nothing recorded
      otherRouteId = await createRoute(head, "Transport E2E other route", ramiAccount, []);
      await refused(head, "post", path, 409, { driverId: ramiAccount.id, fromDriverId: karimAccount.id });
      await api(head, "delete", `${heads}/routes/${otherRouteId}`, 204);
      otherRouteId = undefined;
      expect(await history()).toHaveLength(0);
    });

    await test.step("a reassignment, then a stale screen: the second head is refused with 409 and nothing more is recorded", async () => {
      await api(head, "post", path, 201, body);
      // The route now belongs to Nadia, so a second head still holding Karim's screen is refused.
      await refused(head, "post", path, 409, { driverId: ramiAccount.id, fromDriverId: karimAccount.id });
      expect(await history()).toHaveLength(1);
      await refused(driver, "post", `/api/driver/runs/${runId}/end`, 404);
    });

    await test.step("a route with a run in progress cannot be deleted; once the new driver ends the run, it can", async () => {
      await refused(head, "delete", `${heads}/routes/${routeId}`, 409);
      await api(head, "get", `${heads}/routes/${routeId}`); // still there, and so is its run
      expect((await headRun(head, runId)).state).toBe("IN_PROGRESS");
      await api(nadia, "post", `/api/driver/runs/${runId}/end`);
      await api(head, "delete", `${heads}/routes/${routeId}`, 204);
      routeId = undefined; // nothing left for the cleanup to end or delete
    });
    passed = true;
  } finally {
    // Nadia may now drive the run, and only the driver can end it.
    await cleanup({
      head, routes: [{ id: routeId, runId }, { id: otherRouteId }], drivers: [driver, nadia], passed,
      contexts: [parent.context(), head.context(), driver.context(), nadia.context(), admin.context(), signedOut],
    });
  }
});
