// SCRUM-278: independent acceptance harness for the parent live map (SCRUM-279) and inbox (SCRUM-280).
//
// This file contains NO production oracles. Nothing here imports a production parser, rule helper,
// sample client or test-support file of the code under test (not parentTracking.ts, not
// parentNavigation.ts). Expected values are the contract samples in docs/contracts/samples, used as
// raw JSON, plus numbers computed by hand in the comments below. The only production code a test
// exercises is the real page, the real layout and the real request() client behind a stubbed fetch.
import { createElement, type ReactNode } from "react";
import { act } from "@testing-library/react";
import { vi } from "vitest";
import childrenSample from "../../../docs/contracts/samples/runs/parent-children.json";
import liveSample from "../../../docs/contracts/samples/runs/bus-location-live.json";
import staleSample from "../../../docs/contracts/samples/runs/bus-location-stale.json";
import unavailableSample from "../../../docs/contracts/samples/runs/bus-location-unavailable.json";
import afternoonSample from "../../../docs/contracts/samples/runs/bus-location-afternoon.json";
import inboxUnreadSample from "../../../docs/contracts/samples/inbox/inbox-event-unread.json";
import inboxReadSample from "../../../docs/contracts/samples/inbox/inbox-event-read.json";
import inboxLateSample from "../../../docs/contracts/samples/inbox/inbox-event-late.json";
import preferencesSample from "../../../docs/contracts/samples/inbox/notification-preferences.json";

// ---------------------------------------------------------------------------------------------
// Contract fixtures (deep copies, so a test can never mutate a sample for the next one)
// ---------------------------------------------------------------------------------------------

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Json = Record<string, unknown>;

export const samples = {
  children: () => copy(childrenSample) as Json[],
  live: () => copy(liveSample) as Json,
  stale: () => copy(staleSample) as Json,
  unavailable: () => copy(unavailableSample) as Json,
  afternoon: () => copy(afternoonSample) as Json,
  inboxUnread: () => copy(inboxUnreadSample) as Json,
  inboxRead: () => copy(inboxReadSample) as Json,
  inboxLate: () => copy(inboxLateSample) as Json,
  preferences: () => copy(preferencesSample) as Json,
};

// parent-children.json: [0] Layla (no route, todayRun null), [1] Tarek (IN_PROGRESS, stopsLeft null).
export const LAYLA_ID = "40000000-0000-4000-8000-000000000014";
export const TAREK_ID = "40000000-0000-4000-8000-000000000003";
// A second linked child invented for the multi-child cases (same route as Tarek, a new id).
export const SAMI_ID = "40000000-0000-4000-8000-000000000021";
// An id that belongs to no child of this parent: it must never appear in a request.
export const FOREIGN_ID = "40000000-0000-4000-8000-000000000099";

export const layla = () => samples.children()[0];
export const tarekAsSampled = () => samples.children()[1];

/** Sample Tarek, but waiting for the bus (the sample has stopsLeft null, which means "not waiting"). */
export function waitingTarek(run: Partial<{ direction: "MORNING" | "AFTERNOON"; state: string; stopsLeft: number | null }> = {}, extra: Json = {}): Json {
  return { ...tarekAsSampled(), todayRun: { direction: "MORNING", state: "IN_PROGRESS", stopsLeft: 2, ...run }, ...extra };
}
export function waitingSami(): Json {
  return { ...waitingTarek(), studentId: SAMI_ID, firstName: "Sami", expectedPickupTime: "07:30" };
}

/** A bus-location body built from a sample with hand-chosen overrides (e.g. a different age). */
export function busLocation(base: Json, overrides: Json = {}, position: Json = {}): Json {
  const value = { ...copy(base), ...overrides };
  if (value.position && typeof value.position === "object") value.position = { ...(value.position as Json), ...position };
  return value;
}

// Hand-computed expectations. Asia/Beirut is UTC+3 on 21 Oct 2026 (summer time ends 25 Oct 2026).
export const expected = {
  live: {
    // secondsAway 350 = 5 * 60 + 50
    countdown: "Estimated arrival in 5m 50s",
    // arrivesAt 2026-10-21T04:21:50Z + 3 h = 07:21 school time
    arrivesAt: "2026-10-21T04:21:50Z",
    arrivesSchoolTime: "07:21",
    planned: "07:18",
    coordinates: "33.8961, 35.4823",
  },
  stale: { ageSeconds: 140, coordinates: "33.8948, 35.4811" },
  unavailable: { stopsLeft: 1 },
  afternoon: {
    // secondsAway 470 = 7 * 60 + 50
    countdown: "Estimated arrival in 7m 50s",
    // arrivesAt 2026-10-21T11:38:50Z + 3 h = 14:38 school time
    arrivesAt: "2026-10-21T11:38:50Z",
    arrivesSchoolTime: "14:38",
    coordinates: "33.8995, 35.4871",
  },
};

let inboxIdSeq = 0;
/** An inbox entry built from the unread sample, overriding only what a case needs (type, direction, readAt…).
 *  Every call gets a fresh id so distinct rows in one list never collide. */
export function inboxEvent(overrides: Json = {}): Json {
  inboxIdSeq += 1;
  return { ...samples.inboxUnread(), id: `a0000000-0000-4000-8000-${String(inboxIdSeq).padStart(12, "0")}`, readAt: null, ...overrides };
}

export const parentSession = { id: "parent-278", email: "parent278@contract.invalid", role: "PARENT", schoolId: "school-278" };
export const sessionAs = (role: string) => ({ ...parentSession, id: `${role.toLowerCase()}-278`, role });

// ---------------------------------------------------------------------------------------------
// MapView stand-in: shows the region, every marker's label and its exact coordinates, so a test
// can prove that no marker (and no coordinate) is on screen.
// ---------------------------------------------------------------------------------------------

interface FakeMarker { id: string; latitude: number | null; longitude: number | null; label: string }
export function FakeMapView({ label, markers = [] }: { label: string; markers?: FakeMarker[] }): ReactNode {
  return createElement("section", { "aria-label": label, "data-testid": "fake-map" },
    createElement("ul", null, markers.map(marker =>
      createElement("li", { key: marker.id, "data-marker": marker.label }, `${marker.label} at ${marker.latitude}, ${marker.longitude}`))));
}

// ---------------------------------------------------------------------------------------------
// Stateful fake backend, behind a stubbed fetch. request() from lib/api/client.ts runs for real.
// The state object survives unmount/remount, so a "reload" is: unmount, then render again.
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

export interface LoggedRequest {
  method: string;
  path: string;
  search: string;
  url: string;
  credentials?: RequestCredentials;
  body?: unknown;
}

export interface ServerState {
  session: Json | number; // the /api/auth/me user, or an HTTP status
  children: Json[] | number | Reply;
  /** Per child id: replies served in order; the last one keeps being served. */
  busLocation: Record<string, Reply[]>;
  inbox: Json[];
  inboxFailure: number | null;
  /** Overrides the GET /inbox list reply (e.g. HANG for loading, a 500, NETWORK), independent of inboxFailure. */
  listReply: Reply | null;
  /** When set, /unread-count answers with this instead of counting state.inbox, so a test can show the
   *  count is read from its own endpoint rather than derived from the (at most 50) listed rows. */
  unreadCountOverride: number | null;
  preferences: Json;
  prefsFailure: number | null;
  /** A single-use override for the next PUT only (e.g. a 500, then null lets a retry save normally). */
  prefsPutReply: Reply | null;
}

const PREFERENCE_BOOLEAN_FIELDS = ["pickedUp", "droppedOff", "notPresent", "late"] as const;
/** Mirrors the contract's PUT validation (inbox.md "Notification preferences"): every field required,
 *  lateAfterMinutes a whole number 5-60. Messages are hand-written for the test double, not a production oracle. */
function preferencesErrors(body: Json): Record<string, string> | null {
  const errors: Record<string, string> = {};
  for (const field of PREFERENCE_BOOLEAN_FIELDS) {
    if (typeof body?.[field] !== "boolean") errors[field] = `${field} must be true or false`;
  }
  const minutes = body?.lateAfterMinutes;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 5 || minutes > 60) {
    errors.lateAfterMinutes = "Must be a whole number from 5 to 60";
  }
  return Object.keys(errors).length ? errors : null;
}

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

export function createParentServer(initial: Partial<ServerState> = {}) {
  const state: ServerState = {
    session: parentSession,
    children: samples.children(),
    busLocation: {},
    inbox: [],
    inboxFailure: null,
    listReply: null,
    unreadCountOverride: null,
    preferences: samples.preferences(),
    prefsFailure: null,
    prefsPutReply: null,
    ...initial,
  };
  const log: LoggedRequest[] = [];
  const unexpected: string[] = [];

  function route(method: string, path: string, search: string, body: unknown): Reply {
    if (method === "GET" && path === "/api/auth/me") return typeof state.session === "number" ? fail(state.session) : ok(state.session);
    if (method === "POST" && path === "/api/auth/logout") return fail(204);
    if (method === "GET" && path === "/api/parent/children") {
      return typeof state.children === "number" ? fail(state.children) : Array.isArray(state.children) ? ok(state.children) : state.children;
    }
    const bus = /^\/api\/parent\/children\/([^/]+)\/bus-location$/.exec(path);
    if (method === "GET" && bus) {
      const id = decodeURIComponent(bus[1]);
      const queue = state.busLocation[id];
      // Like the backend: an id that is not one of this parent's children is a 404 with no reason given.
      if (!queue || queue.length === 0) return fail(404, { detail: "Not found" });
      return queue.length > 1 ? queue.shift()! : queue[0];
    }
    const absences = /^\/api\/parent\/children\/([^/]+)\/absences$/.exec(path);
    if (method === "GET" && absences) return ok([]);
    if (path.startsWith("/api/parent/inbox") && state.inboxFailure !== null) return fail(state.inboxFailure, { detail: "Inbox failure" });
    if (method === "GET" && path === "/api/parent/inbox") {
      if (state.listReply) return state.listReply;
      const rows = search === "?unread=true" ? state.inbox.filter(event => event.readAt === null) : state.inbox;
      return ok(copy(rows.slice(0, 50)));
    }
    if (method === "GET" && path === "/api/parent/inbox/unread-count") {
      const count = state.unreadCountOverride ?? state.inbox.filter(event => event.readAt === null).length;
      return ok({ count });
    }
    if (method === "POST" && path === "/api/parent/inbox/read-all") {
      state.inbox.forEach(event => { if (event.readAt === null) event.readAt = "2026-11-16T08:00:00Z"; });
      return fail(204);
    }
    const read = /^\/api\/parent\/inbox\/([^/]+)\/read$/.exec(path);
    if (method === "POST" && read) {
      const event = state.inbox.find(row => row.id === decodeURIComponent(read[1]));
      if (!event) return fail(404, { detail: "Not found" });
      if (event.readAt === null) event.readAt = "2026-11-16T08:00:00Z";
      return ok(copy(event));
    }
    if (path === "/api/parent/notification-preferences") {
      if (state.prefsFailure !== null) return fail(state.prefsFailure, { detail: "Preferences failure" });
      if (method === "GET") return ok(copy(state.preferences));
      if (method === "PUT") {
        if (state.prefsPutReply) { const reply = state.prefsPutReply; state.prefsPutReply = null; return reply; }
        const next = body as Json;
        const errors = preferencesErrors(next);
        if (errors) return fail(400, { errors });
        state.preferences = copy(next);
        return ok(copy(state.preferences));
      }
    }
    unexpected.push(`${method} ${path}${search}`);
    return fail(599, { detail: `Unexpected request ${method} ${path}` });
  }

  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    log.push({ method, path: url.pathname, search: url.search, url: String(input), credentials: init.credentials, body });
    return serve(route(method, url.pathname, url.search, body));
  });

  return {
    state,
    log,
    unexpected,
    fetch,
    /** Replace the replies a child's bus-location will get (served in order, the last one repeats). */
    busLocation(id: string, ...replies: Reply[]) { state.busLocation[id] = replies; },
    requests(pattern: RegExp | string) {
      return log.filter(entry => typeof pattern === "string" ? entry.path === pattern : pattern.test(entry.path));
    },
    busRequests(id?: string) {
      return log.filter(entry => /\/bus-location$/.test(entry.path) && (id === undefined || entry.path.includes(`/children/${id}/`)));
    },
    parentRequests() { return log.filter(entry => entry.path.startsWith("/api/parent")); },
  };
}
export type ParentServer = ReturnType<typeof createParentServer>;

// ---------------------------------------------------------------------------------------------
// GPS-age clock. TrackingPanel measures elapsed time with performance.now(), so the fake timers
// must fake `performance` too, or ages would follow the real clock. `Date` is faked separately so
// a test can move the device wall clock (vi.setSystemTime) without touching performance.now().
// setImmediate and microtasks stay real: Response.json() needs them.
// ---------------------------------------------------------------------------------------------

export function installGpsClock(start = "2026-10-21T04:16:00Z") {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"], now: new Date(start) });
  const before = performance.now();
  vi.advanceTimersByTime(1000);
  if (performance.now() - before !== 1000) throw new Error("Harness: performance.now() is not under fake-timer control");
}

/** Let fetches, JSON parsing and React effects finish without moving the clock. */
export async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

/** Move fake time forward one second at a time, so every 1 s tick and every poll runs in order. */
export async function advanceSeconds(seconds: number) {
  for (let i = 0; i < seconds; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  await settle(2);
}
