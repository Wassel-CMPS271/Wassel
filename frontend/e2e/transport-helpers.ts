import { expect, test, type APIRequestContext, type APIResponse, type Browser, type Page } from "@playwright/test";
import { LAST_API_CALL, formatApiCall } from "./transport-evidence";
import { backendLog, logEvents } from "./backend-log";
import type { Driver } from "../src/lib/api/drivers";
import type { InboxEvent } from "../src/lib/api/parentInbox";
import type { Child } from "../src/lib/api/myChildren";
import type { DriverDay, RunSummary, RunsDay } from "../src/lib/api/runs";

export const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:4180";
const routes = "/api/head-of-transport/routes";
/** The suite's fixed Monday: the backend's WeekdayE2eClock and the browser clock below agree on it. */
export const testDay = "2026-11-02";
type Method = "get" | "post" | "put" | "patch" | "delete";
export type Who = { request: APIRequestContext };

/** One API call. Remembers "METHOD path status" for the failure summary (the reporter reads only that, never the body). */
async function call(who: Who, method: Method, path: string, data?: unknown): Promise<APIResponse> {
  const response = await who.request[method](path, data === undefined ? undefined : { data });
  test.info().annotations.push({ type: LAST_API_CALL, description: formatApiCall(method, path, response.status()) });
  return response;
}
/** A call that must answer `status`; returns the JSON body, or undefined for an empty one. */
export async function api<T = unknown>(who: Who, method: Method, path: string, status = 200, data?: unknown): Promise<T> {
  const response = await call(who, method, path, data);
  expect(response.status(), `${method.toUpperCase()} answered ${response.status()}`).toBe(status);
  return (await response.text() ? response.json() : undefined) as T;
}
/**
 * A call that must answer `status`. Every refusal but a 401 must carry a ProblemDetail with a `detail` and no stack trace;
 * the 401 comes from the security entry point with an empty body, so only its status is checked.
 */
export async function refused(who: Who, method: Method, path: string, status: number, data?: unknown) {
  const response = await call(who, method, path, data);
  expect(response.status()).toBe(status);
  if (status === 401) return;
  const body = await response.json() as { detail?: string };
  expect(typeof body.detail).toBe("string");
  expect(JSON.stringify(body)).not.toMatch(/\bat [\w.$]+\(|Exception/);
}
/** `value`, or a failure that names what was missing (a bare `!` would end in a TypeError with no matcher behind it). */
export function found<T>(value: T | undefined | null, what: string): T {
  expect(value, what).toBeTruthy();
  return value as T;
}

export const logLength = () => backendLog().length;
/** Emails the LoggingMailer printed to `to` since `offset`, oldest first. */
export function mailSince(offset: number, to: string) {
  const head = `Email to ${to} | `;
  return logEvents(offset).flatMap(e => {
    if (!e.message?.startsWith(head)) return [];
    const [subject, ...body] = e.message.slice(head.length).split("\n");
    return [{ subject, body: body.join("\n") }];
  });
}

export async function driverByEmail(head: Who, email: string): Promise<Driver> {
  return found((await api<Driver[]>(head, "get", "/api/head-of-transport/drivers")).find(d => d.email === email), "seeded driver exists");
}
export async function childrenOf(parent: Who) {
  const children = await api<Child[]>(parent, "get", "/api/parent/children");
  expect(children).toHaveLength(2);
  // The API lists them in no fixed order.
  return { lea: found(children.find(c => c.firstName === "Lea"), "Lea"), jad: found(children.find(c => c.firstName === "Jad"), "Jad") };
}
/** A route for `driver` with the given students (the demo parent's Lea and Jad). A route it could not fill is deleted again. */
export async function createRoute(head: Who, name: string, driver: Driver, studentIds: string[]) {
  const id = (await api<{ id: string }>(head, "post", routes, 201, { name, driverId: driver.id, vehicleId: driver.assignedVehicleId })).id;
  try {
    for (const studentId of studentIds) await api(head, "post", `${routes}/${id}/students`, 200, { studentId });
  } catch (error) {
    await head.request.delete(`${routes}/${id}`);
    throw error;
  }
  return id;
}
/** Today's morning run of `routeId` as `driver` sees it. */
export async function morningRun(driver: Who, routeId: string) {
  const day = await api<DriverDay>(driver, "get", "/api/driver/runs/today");
  expect(day.date).toBe(testDay);
  return found(day.runs.find(r => r.route.id === routeId && r.direction === "MORNING"), "morning run exists").id;
}
/** One run as the Head's list shows it (its counts included). */
export async function headRun(head: Who, runId: string): Promise<RunSummary> {
  const day = await api<RunsDay>(head, "get", `/api/head-of-transport/runs?date=${testDay}`);
  return found(day.runs.find(r => r.id === runId), "run in the Head's list");
}

/** A phone: a 360 px browser context whose clock is the test Monday (the offline queue drops "earlier day" taps by it). */
export async function driverPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width: 360, height: 800 } });
  await context.clock.install({ time: `${testDay}T08:00:00Z` });
  return context.newPage();
}
export const card = (page: Page, name: string) => page.getByRole("group", { name: `Confirm ${name}` });
/**
 * The taps the phone has saved and not yet synced, read the way the app's own queue reads them (offline/queue.ts `load`): the
 * queue key, plus every `<queue key>.pending.<itemId>` key. A tap is written to its own pending key first and only merged into
 * the queue key by the next write under the lock, a few milliseconds later, so reading the queue key alone can miss the tap
 * the page has just shown as "Saved on phone" (this failed on a CI runner and passed on a faster machine).
 */
export function savedTaps(page: Page) {
  return page.evaluate(() => {
    type Item = { id: string; clientRequestId: string; state: string; status: string; studentId: string };
    const prefix = "wassel.driver.queue.v1.";
    const byId = new Map<string, Item>();
    for (const [key, value] of Object.entries(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      try {
        const stored = JSON.parse(value);
        const items: Item[] = Array.isArray(stored) ? stored : stored.items ?? (stored.item ? [stored.item] : []);
        for (const item of items) byId.set(item.id, item);
      } catch { /* A key that is not JSON holds no tap. */ }
    }
    return [...byId.values()].map(i => ({ key: i.clientRequestId, state: i.state, status: i.status, studentId: i.studentId }));
  }).then(taps => taps.filter(t => t.state !== "synced"));
}
/** The parent's inbox entries made after this call, as sorted "studentId:TYPE" (earlier tests emailed this parent too, so ids are compared). */
export async function watchInbox(parent: Who) {
  const list = () => api<InboxEvent[]>(parent, "get", "/api/parent/inbox");
  const before = new Set((await list()).map(e => e.id));
  return async () => (await list()).filter(e => !before.has(e.id)).map(e => `${e.studentId}:${e.type}`).sort();
}

export interface Teardown {
  head: Who;
  /** Each route to delete, with the run on it (if any) that must be ended first. */
  routes: { id: string | undefined; runId?: string }[];
  /** Every driver who may own a run now: the first one the server accepts ends it. */
  drivers: Who[];
  /** Resets to run first (back online, a preference turned back). */
  undo?: (() => Promise<unknown>)[];
  contexts: { close(): Promise<void> }[];
  /** Whether the test body passed. A failing body keeps its own error: cleanup problems are then only noted. */
  passed: boolean;
}
/**
 * The test's `finally`. It never throws over the real failure and never stops half way: every step runs, problems are
 * collected, and they fail the test only when the body passed. A route whose run could not be ended is not even
 * tried: the server refuses (409) to delete a route with a run in progress, so the route is reported and left.
 */
export async function cleanup({ head, routes: owned, drivers, undo = [], contexts, passed }: Teardown) {
  const problems: string[] = [];
  const attempt = async (what: string, step: () => Promise<unknown>) => {
    try { await step(); } catch (error) { problems.push(`${what}: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}`); }
  };
  for (const [index, reset] of undo.entries()) await attempt(`reset ${index + 1}`, reset);
  // Plain requests, not call(): the summary must keep pointing at the failing call, not at the cleanup.
  for (const { id, runId } of owned) {
    if (!id) continue;
    let ended = !runId; // a run never found was never started: nothing to end
    for (const driver of drivers) {
      if (ended) break;
      await attempt(`end run ${runId}`, async () => {
        const status = (await driver.request.post(`/api/driver/runs/${runId}/end`)).status(); // 404: not this driver's (now); 409: already over or never started
        if (status === 200 || status === 409) ended = true;
        else if (status !== 404) throw new Error(`answered ${status}`);
      });
    }
    if (!ended) { problems.push(`run ${runId} was ended by no driver, so route ${id} was left in place`); continue; }
    await attempt(`delete route ${id}`, async () => {
      const status = (await head.request.delete(`${routes}/${id}`)).status();
      if (status !== 204) throw new Error(`answered ${status}`);
    });
  }
  for (const context of contexts) await attempt("close a context", () => context.close());
  if (passed) expect(problems, "cleanup").toEqual([]);
  else if (problems.length) test.info().annotations.push({ type: "cleanup", description: problems.join("; ") });
}
