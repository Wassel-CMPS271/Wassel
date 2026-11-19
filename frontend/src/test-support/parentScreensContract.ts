// SCRUM-246: independent acceptance harness for the parent home (SCRUM-248) and absences (SCRUM-249).
//
// This file contains NO production oracles. Nothing here imports a production parser, rule helper,
// sample client or another ticket's test-support file. Expected values are the contract samples in
// docs/contracts/samples, used as raw JSON, plus values worked out by hand in the comments below. The only
// production code a test exercises is the real page, the real layout and the real request() client behind
// a stubbed fetch.
import { vi } from "vitest";
import childrenSample from "../../../docs/contracts/samples/runs/parent-children.json";
import absencesSample from "../../../docs/contracts/samples/runs/absences.json";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// Contract fixtures (deep copies, so a test can never change a sample for the next one)
// ---------------------------------------------------------------------------------------------

export const samples = {
  children: () => copy(childrenSample) as Json[],
  absences: () => copy(absencesSample) as Absence[],
};

/** runs.md "Absence": whole days, inclusive; a single day has both dates equal. */
export interface Absence { id: string; studentId: string; fromDate: string; toDate: string }

// parent-children.json, ordered by first name as the contract says:
// [0] Layla Mansour: route null, so driver, vehicle, expectedPickupTime and todayRun are null too.
// [1] Tarek Mansour: Hamra morning run, driver Karim Haddad (+961 3 100 101), plate A 123456, pickup 07:21.
export const LAYLA_ID = "40000000-0000-4000-8000-000000000014";
export const TAREK_ID = "40000000-0000-4000-8000-000000000003";
// An id that belongs to no child of this parent: it must never appear in a request.
export const FOREIGN_ID = "40000000-0000-4000-8000-000000000099";

export const expected = {
  layla: { name: "Layla Mansour" },
  tarek: {
    name: "Tarek Mansour",
    route: "Hamra morning run",
    driver: "Karim Haddad",
    phone: "+961 3 100 101",
    // The phone with its display spaces removed: what a dialler needs after "tel:".
    dialled: "+9613100101",
    plate: "A 123456",
    pickup: "07:21",
  },
};

export const parentSession = { id: "parent-246", email: "parent246@contract.invalid", role: "PARENT", schoolId: "school-246" };

// ---------------------------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------------------------

export interface Deferred { promise: Promise<Reply>; resolve(reply: Reply): void }
export type Reply = { status: number; body?: unknown } | { network: true } | { hang: true } | Deferred;

export function deferred(): Deferred {
  let resolve!: (reply: Reply) => void;
  const promise = new Promise<Reply>(r => { resolve = r; });
  return { promise, resolve };
}
export const ok = (body: unknown): Reply => ({ status: 200, body });
export const fail = (status: number, body?: unknown): Reply => ({ status, body });
export const NETWORK: Reply = { network: true };
export const HANG: Reply = { hang: true };

const isDeferred = (reply: Reply): reply is Deferred => "promise" in reply;

function respond(reply: { status: number; body?: unknown }): Response {
  if (reply.body === undefined || reply.status === 204) return new Response(null, { status: reply.status });
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
}

async function serve(reply: Reply): Promise<Response> {
  const settled = isDeferred(reply) ? await reply.promise : reply;
  if ("network" in settled) throw new TypeError("Failed to fetch");
  if ("hang" in settled) return new Promise<Response>(() => {});
  if (isDeferred(settled)) return serve(settled);
  return respond(settled);
}

// ---------------------------------------------------------------------------------------------
// Fake backend behind a stubbed fetch. request() from lib/api/client.ts runs for real.
// ---------------------------------------------------------------------------------------------

export interface LoggedRequest {
  method: string;
  path: string;
  search: string;
  credentials?: RequestCredentials;
  body?: unknown;
}

export interface HomeState {
  /** The /api/auth/me user, or an HTTP status. */
  session: Json | number;
  /** GET /api/parent/children: the list served, or one Reply per call in order (the last one repeats). */
  children: Json[] | Reply[];
  /** "Today" as the server decides it: the calendar date in Asia/Beirut, "YYYY-MM-DD" (runs.md Conventions). */
  today: string;
  /** Every absence the backend holds, past ones included; GET filters them like the real endpoint. */
  absences: Absence[];
}

/** One-shot reply for the next request matching method + path, before the contract rules run. */
interface Override { method: string; pattern: RegExp; reply: Reply }

// Hand-written ProblemDetail messages for the test double (runs.md Errors). Not production text.
export const problems = {
  pastFrom: "The first day of an absence cannot be in the past.",
  inverted: "The last day cannot be before the first day.",
  overlap: (other: Absence) => `This overlaps the absence from ${other.fromDate} to ${other.toDate}.`,
  endedBeforeToday: "This absence has already ended, so it cannot be cancelled.",
  absenceGone: "Absence not found",
  childNotFound: "Child not found",
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** The calendar day before a "YYYY-MM-DD" date (pure date arithmetic, no time zone involved). */
export function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

export function createParentHomeServer(initial: Partial<HomeState> = {}) {
  // Default "today" 2026-10-20: both sample absences (21-23 Oct for Tarek, 2 Nov for Tarek) are upcoming.
  const state: HomeState = { session: parentSession, children: samples.children(), today: "2026-10-20", absences: samples.absences(), ...initial };
  const log: LoggedRequest[] = [];
  const unexpected: string[] = [];
  const overrides: Override[] = [];
  let nextId = 100;

  function childrenReply(): Reply {
    const value = state.children;
    const isReplyList = value.length > 0 && value.every(item => "status" in item || "network" in item || "hang" in item || "promise" in item);
    if (!isReplyList) return ok(copy(value));
    const queue = value as Reply[];
    return queue.length > 1 ? queue.shift()! : queue[0];
  }

  /** The ids of this parent's children, as the session sees them. */
  function ownIds(): string[] {
    return Array.isArray(state.children) ? state.children.flatMap(c => typeof (c as Json).studentId === "string" ? [(c as Json).studentId as string] : []) : [];
  }

  // runs.md "Absences" rules. Dates are "YYYY-MM-DD", so string comparison is date order.
  function absenceRoute(method: string, childId: string, absenceId: string | null, body: unknown): Reply {
    if (!ownIds().includes(childId)) return fail(404, { detail: problems.childNotFound });
    const mine = () => state.absences.filter(a => a.studentId === childId);

    if (absenceId === null && method === "GET") {
      const upcoming = mine().filter(a => a.toDate >= state.today).sort((a, b) => a.fromDate.localeCompare(b.fromDate));
      return ok(copy(upcoming));
    }
    if (absenceId === null && method === "POST") {
      const input = (body ?? {}) as Json;
      if (typeof input.fromDate !== "string") return fail(400, { errors: { fromDate: "The first day is required." } });
      const fromDate = input.fromDate;
      const toDate = typeof input.toDate === "string" ? input.toDate : fromDate;
      if (fromDate < state.today) return fail(400, { errors: { fromDate: problems.pastFrom } });
      if (toDate < fromDate) return fail(400, { errors: { toDate: problems.inverted } });
      const same = mine().find(a => a.fromDate === fromDate && a.toDate === toDate);
      if (same) return ok(copy(same));
      const clash = mine().find(a => a.fromDate <= toDate && fromDate <= a.toDate);
      if (clash) return fail(409, { errors: { fromDate: problems.overlap(clash) } });
      nextId += 1;
      const created: Absence = { id: `60000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`, studentId: childId, fromDate, toDate };
      state.absences.push(created);
      return { status: 201, body: copy(created) };
    }
    if (absenceId !== null && method === "DELETE") {
      const target = mine().find(a => a.id === absenceId);
      if (!target) return fail(404, { detail: problems.absenceGone });
      if (target.toDate < state.today) return fail(409, { detail: problems.endedBeforeToday });
      if (target.fromDate < state.today) target.toDate = dayBefore(state.today);
      else state.absences = state.absences.filter(a => a !== target);
      return fail(204);
    }
    unexpected.push(`${method} absences ${childId}/${absenceId ?? ""}`);
    return fail(405, { detail: "Method not allowed" });
  }

  function route(method: string, path: string, body: unknown): Reply {
    const override = overrides.findIndex(o => o.method === method && o.pattern.test(path));
    if (override >= 0) return overrides.splice(override, 1)[0].reply;
    if (method === "GET" && path === "/api/auth/me") return typeof state.session === "number" ? fail(state.session) : ok(state.session);
    if (method === "POST" && path === "/api/auth/logout") return fail(204);
    if (method === "GET" && path === "/api/parent/children") return childrenReply();
    const absences = /^\/api\/parent\/children\/([^/]+)\/absences(?:\/([^/]+))?$/.exec(path);
    if (absences) return absenceRoute(method, decodeURIComponent(absences[1]), absences[2] ? decodeURIComponent(absences[2]) : null, body);
    unexpected.push(`${method} ${path}`);
    // Like the backend for anything this parent cannot see: a 404 with no reason given.
    return fail(404, { detail: "Not found" });
  }

  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    log.push({ method, path: url.pathname, search: url.search, credentials: init.credentials, body });
    return serve(route(method, url.pathname, body));
  });

  return {
    state,
    log,
    unexpected,
    fetch,
    /** The next request matching method + path gets this reply instead of the contract rules (one use). */
    once(method: string, pattern: RegExp, reply: Reply) { overrides.push({ method, pattern, reply }); },
    absencesOf(childId: string) { return state.absences.filter(a => a.studentId === childId); },
    requests(pattern: RegExp | string, method?: string) {
      return log.filter(entry =>
        (method === undefined || entry.method === method) &&
        (typeof pattern === "string" ? entry.path === pattern : pattern.test(entry.path)));
    },
  };
}
export type ParentHomeServer = ReturnType<typeof createParentHomeServer>;
