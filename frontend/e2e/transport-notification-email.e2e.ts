import { expect, test } from "@playwright/test";
import { credentials, signIn } from "./auth-helpers";
import { api, baseURL, childrenOf, cleanup, createRoute, driverByEmail, logLength, mailSince, morningRun, refused, watchInbox } from "./transport-helpers";
import type { NotificationPreferences } from "../src/lib/api/notificationPreferences";
import type { Route } from "../src/lib/api/routes";

// The email is read where it really exists: the LoggingMailer line of the isolated backend. The admin summary and
// metrics are the cross-check, compared as before/after differences because every earlier test emailed this parent too.
const preferences = "/api/parent/notification-preferences", summaryPath = "/api/admin/notification-deliveries/summary", metricsPath = "/api/admin/metrics";
const defaults: NotificationPreferences = { pickedUp: true, droppedOff: true, notPresent: true, late: true, lateAfterMinutes: 10 };
type DeliverySummary = { emailEnabled: boolean; counts: Record<string, number>; reasons: Record<string, number> };
const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("notification email: only the documented words reach the parent, a muted type sends nothing, the admin sees counts only", async ({ browser }) => {
  test.setTimeout(240_000);
  const [admin, head, driver, parent] = await Promise.all([1, 2, 3, 4].map(() => browser.newPage({ baseURL })));
  const signedOut = await browser.newContext({ baseURL });
  let routeId: string | undefined, runId = "", muted = false, passed = false;
  try {
    await signIn(admin, "ADMIN"); await signIn(head, "HEAD_OF_TRANSPORT"); await signIn(driver, "DRIVER"); await signIn(parent, "PARENT");
    for (const path of [summaryPath, metricsPath]) {
      for (const other of [head, driver, parent]) await refused(other, "get", path, 403);
      await refused(signedOut, "get", path, 401);
    }
    const { lea, jad } = await childrenOf(parent);
    const added = await watchInbox(parent);
    // Earlier tests' emails are sent by the next job cycle; wait until none is waiting so they cannot be mistaken for ours.
    const idle = async () => { const c = (await api<DeliverySummary>(admin, "get", summaryPath)).counts; return c.pending + c.sending; };
    await expect.poll(idle, { timeout: 90_000, intervals: [1000] }).toBe(0);
    const baseline = await api<DeliverySummary>(admin, "get", summaryPath);
    const baselineSent = (await api<{ notifications: { sent: number } }>(admin, "get", metricsPath)).notifications.sent;

    muted = true;
    await api(parent, "put", preferences, 200, { ...defaults, droppedOff: false });
    routeId = await createRoute(head, "Transport E2E notification", await driverByEmail(head, credentials().accounts.DRIVER), [lea.studentId, jad.studentId]);
    runId = await morningRun(driver, routeId);
    await api(driver, "post", `/api/driver/runs/${runId}/start`);
    const offset = logLength();
    const confirm = (student: string, status: string) => api(driver, "put", `/api/driver/runs/${runId}/students/${student}/confirmation`, 200, { status });
    await confirm(lea.studentId, "PICKED_UP"); await confirm(jad.studentId, "NOT_PRESENT"); await confirm(lea.studentId, "DROPPED_OFF");

    const to = credentials().accounts.PARENT;
    await expect.poll(() => mailSince(offset, to).length, { timeout: 90_000, intervals: [1000] }).toBe(2);
    const mails = mailSince(offset, to);
    for (const mail of mails) expect(mail.subject).toBe("Wassel: an update about your child");
    const bodies = mails.map(m => m.body.trim().split("\n").filter(Boolean));
    expect(bodies.every(lines => lines.length === 2 && lines[1] === `See the details in your Wassel inbox: ${baseURL}/parent`)).toBe(true);
    expect(bodies.map(lines => lines[0]).sort()).toEqual([expect.stringMatching(/^Jad was not at the stop this morning at \d{2}:\d{2}\.$/), expect.stringMatching(/^Lea was picked up this morning at \d{2}:\d{2}\.$/)]);
    // The contract's privacy rule: nothing about the child or the run beyond the first name, the event and the time.
    // What must not appear is read from the real records (surname, route, driver, plate, addresses), plus any coordinate.
    const route = await api<Route>(head, "get", `/api/head-of-transport/routes/${routeId}`);
    const secrets = [lea.lastName, route.name, route.driver.firstName, route.driver.lastName, route.vehicle.plateNumber, ...route.stops.map(s => s.address ?? "")].filter(Boolean);
    expect(secrets.length).toBeGreaterThanOrEqual(5);
    const everything = mails.map(m => `${m.subject}\n${m.body}`).join("\n");
    expect(everything).not.toMatch(new RegExp(`${secrets.map(literally).join("|")}|Nadia|Rami|\\bETA\\b|[Ee]stimate|\\d+\\.\\d{3,}`));

    // The muted type made no inbox entry, so it can make no delivery. Wait until the job has nothing left to send,
    // then count by the admin's summary and the mailer log rather than by a timer.
    await expect.poll(idle, { timeout: 90_000, intervals: [1000] }).toBe(0);
    expect(mailSince(offset, to)).toHaveLength(2);
    expect(await added()).toEqual([`${jad.studentId}:NOT_PRESENT`, `${lea.studentId}:PICKED_UP`].sort());

    const summary = await api<DeliverySummary>(admin, "get", summaryPath);
    expect(summary.emailEnabled).toBe(true);
    expect(Object.keys(summary.counts).sort()).toEqual(["failed", "pending", "sending", "sent", "skipped"]);
    expect(Object.keys(summary.reasons).sort()).toEqual(["DAILY_CAP", "EXPIRED", "INTERRUPTED", "NO_RECIPIENT", "PREFERENCE_OFF", "PROVIDER_ERROR"]);
    expect(summary.counts.sent - baseline.counts.sent).toBe(2);
    expect(summary.counts.failed - baseline.counts.failed).toBe(0);
    expect(summary.counts.skipped - baseline.counts.skipped).toBe(0); // a muted-before type is never created, so there is no PREFERENCE_OFF skip either
    expect(JSON.stringify(summary)).not.toMatch(/@|Lea|Jad|Mansour/);
    expect((await api<{ notifications: { sent: number } }>(admin, "get", metricsPath)).notifications.sent - baselineSent).toBe(2);
    passed = true;
  } finally {
    await cleanup({
      head, routes: [{ id: routeId, runId }], drivers: [driver], passed,
      undo: muted ? [() => api(parent, "put", preferences, 200, defaults)] : [],
      contexts: [admin.context(), head.context(), driver.context(), parent.context(), signedOut],
    });
  }
});
