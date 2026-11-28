import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { credentials, signIn } from "./auth-helpers";
import { api, baseURL, card, childrenOf, cleanup, createRoute, driverByEmail, driverPage, found, headRun, morningRun, refused, savedTaps, watchInbox } from "./transport-helpers";
import type { Child } from "../src/lib/api/myChildren";
import type { DriverDay, Run } from "../src/lib/api/runs";

// Offline taps through the real driver UI. The network is interrupted for real (context.setOffline, and an aborted
// request to our own server); no answer is ever invented, so every status below comes from the Spring API.
const confirmation = "**/api/driver/runs/*/students/*/confirmation";

test("offline replay: taps survive a reload, send once, and a repeated key or a second key changes nothing", async ({ browser }) => {
  test.setTimeout(180_000);
  const parent = await browser.newPage({ baseURL, viewport: { width: 360, height: 800 } });
  const head = await browser.newPage({ baseURL });
  const karim = await driverPage(browser);
  let routeId: string | undefined, runId = "", passed = false;
  try {
    await signIn(parent, "PARENT"); await signIn(head, "HEAD_OF_TRANSPORT");
    const { lea, jad } = await childrenOf(parent);
    const names = [lea, jad].map(c => `${c.firstName} ${c.lastName}`);
    const added = await watchInbox(parent);
    routeId = await createRoute(head, "Transport E2E replay", await driverByEmail(head, credentials().accounts.DRIVER), [lea.studentId, jad.studentId]);
    await signIn(karim, "DRIVER");
    runId = await morningRun(karim, routeId);
    const runPath = `/api/driver/runs/${runId}`;
    await karim.getByRole("button", { name: "Start run", exact: true }).click();
    await expect(karim.getByRole("button", { name: "End run", exact: true })).toBeVisible();

    let keys: string[] = [], leaPickedUpKey = "";
    await test.step("three taps offline are saved with three different keys", async () => {
      await karim.context().setOffline(true);
      await card(karim, names[0]).getByRole("button", { name: "Picked up", exact: true }).click();
      await card(karim, names[1]).getByRole("button", { name: "Not present", exact: true }).click();
      await card(karim, names[0]).getByRole("button", { name: "Dropped off", exact: true }).click();
      await expect(karim.getByText("Saved on phone")).toHaveCount(2); // one pill per stop: Lea's shows her latest tap
      const items = await savedTaps(karim);
      keys = items.map(i => i.key);
      leaPickedUpKey = found(items.find(i => i.status === "PICKED_UP"), "Lea's picked-up tap is saved").key;
      expect(items.length).toBe(3); // a number, so a failed run's summary can say how many taps the phone held
      expect(new Set(keys).size).toBe(3);
      expect(await added()).toEqual([]);
    });

    await test.step("a reload while the server cannot be reached keeps the same three keys", async () => {
      await karim.route(confirmation, route => route.abort("internetdisconnected"));
      await karim.context().setOffline(false);
      await karim.reload();
      await expect(karim.getByText("Saved on phone")).toHaveCount(2);
      expect((await savedTaps(karim)).map(i => i.key).sort()).toEqual([...keys].sort());
      expect(await added()).toEqual([]);
    });

    await test.step("reconnecting sends each tap once: one record and one inbox entry per status", async () => {
      // The server answers again and the browser comes back online: the app's own retry sends what is saved, with the same keys.
      await karim.unroute(confirmation);
      await karim.context().setOffline(true);
      await karim.context().setOffline(false);
      await expect.poll(added, { timeout: 60_000 }).toEqual([`${lea.studentId}:DROPPED_OFF`, `${lea.studentId}:PICKED_UP`, `${jad.studentId}:NOT_PRESENT`].sort());
      await expect(karim.getByText("Saved on phone")).toHaveCount(0);
      expect(await savedTaps(karim)).toEqual([]);
      expect((await headRun(head, runId)).counts).toMatchObject({ students: 2, pickedUp: 1, droppedOff: 1, notPresent: 1 });
      const children = await api<Child[]>(parent, "get", "/api/parent/children");
      for (const child of children) expect(child.todayRun).toMatchObject({ state: "IN_PROGRESS", stopsLeft: null }); // nobody is waiting for the bus any more
      await parent.reload();
      await parent.getByRole("button", { name: "Inbox", exact: true }).click();
      // The inbox also holds earlier tests' entries, so the screen can only be asked for presence; the API counted above.
      for (const heading of [`${names[0]}: Picked up`, `${names[0]}: Dropped off`, `${names[1]}: Not at the stop`]) await expect(parent.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    });

    await test.step("the contract's edge cases through the API: a second key, a repeated key, a changed payload, after End run", async () => {
      const confirm = (student: string, body: { status: string; clientRequestId: string }) => api<Run>(karim, "put", `${runPath}/students/${student}/confirmation`, 200, body);
      const at = (run: Run, student: string) => found(run.stops.find(s => s.studentId === student)?.confirmation, "the stop's confirmation").at;
      const first = found((await api<DriverDay>(karim, "get", "/api/driver/runs/today")).runs.find(r => r.id === runId), "the run");
      const second = randomUUID();
      // A double tap whose second key is new: 200, the first time is kept, no second record.
      expect(at(await confirm(jad.studentId, { status: "NOT_PRESENT", clientRequestId: second }), jad.studentId)).toBe(at(first, jad.studentId));
      await confirm(jad.studentId, { status: "NOT_PRESENT", clientRequestId: second });
      // The key the UI sent for Lea's pick-up: "already applied", and her time is the one she already had.
      expect(at(await confirm(lea.studentId, { status: "PICKED_UP", clientRequestId: leaPickedUpKey }), lea.studentId)).toBe(at(first, lea.studentId));
      // The same key for another status is a client bug: 422, nothing recorded.
      await refused(karim, "put", `${runPath}/students/${jad.studentId}/confirmation`, 422, { status: "PICKED_UP", clientRequestId: second });
      expect(await added()).toEqual([`${lea.studentId}:DROPPED_OFF`, `${lea.studentId}:PICKED_UP`, `${jad.studentId}:NOT_PRESENT`].sort());
      await api(karim, "post", `${runPath}/end`);
      await confirm(jad.studentId, { status: "NOT_PRESENT", clientRequestId: second }); // already applied, even after End run
      await refused(karim, "put", `${runPath}/students/${jad.studentId}/confirmation`, 409, { status: "PICKED_UP", clientRequestId: randomUUID() });
      expect(await added()).toHaveLength(3);
    });
    passed = true;
  } finally {
    await karim.unroute(confirmation).catch(() => undefined); // nothing to remove when the test failed before the route was set
    await cleanup({
      head, routes: [{ id: routeId, runId }], drivers: [karim.context()], passed,
      undo: [() => karim.context().setOffline(false)],
      contexts: [parent.context(), head.context(), karim.context()],
    });
  }
});
