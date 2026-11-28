// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import * as gps from "@/app/(driver)/driver/gpsState";
import { OfflineQueue, type EnqueueInput } from "@/lib/offline/queue";
import { memoryStore } from "@/lib/offline/storage";
import type { DrainLock } from "@/lib/offline/lock";
import { request } from "@/lib/api/client";
import { confirmationReplayApi } from "@/lib/api/confirmationReplay";
import { getDriverToday, type DriverDay } from "@/lib/api/runs";
import { driverRun, pathOf, response } from "@/test-support/operationsContract";

const date = "2026-11-09";
const tap = (studentId = "student-1"): EnqueueInput => ({ runId: "run-1", runDate: date, studentId, status: "PICKED_UP" });
const lock: DrainLock = { run: async fn => ({ acquired: true, value: await fn(() => {}) }) };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("SCRUM-273 independent consent/permission criteria", () => {
  it.each([{ hasApi: false, hasGeolocation: true, secureContext: true }, { hasApi: true, hasGeolocation: false, secureContext: true }, { hasApi: true, hasGeolocation: true, secureContext: false }])("does not permit sharing without every prerequisite %j", values => expect(gps.isAvailable(values)).toBe(false));
  it("starts with no consent and requires an explicit opt-in", () => {
    const off = gps.initialGpsState(true); expect(off.consent).toBe(false); expect(gps.isGpsActive(off)).toBe(false);
    expect(gps.nextGpsState(off, { type: "optIn" }).status).toBe("requesting");
  });
  it("stops on permission denial and explicit opt-out", () => {
    const on = gps.nextGpsState(gps.initialGpsState(true), { type: "optIn" });
    const denied = gps.nextGpsState(on, { type: "permissionDenied" });
    expect(denied.status).toBe("denied"); expect(gps.isGpsActive(denied)).toBe(false);
    const off = gps.nextGpsState(on, { type: "optOut" }); expect(off.consent).toBe(false); expect(gps.isGpsActive(off)).toBe(false);
  });
  it("cannot continue sharing when the run stops being active", () => {
    const on = gps.nextGpsState(gps.initialGpsState(true), { type: "optIn" });
    expect(gps.isGpsActive(gps.nextGpsState(on, { type: "conditions", blocked: true, reason: "runNotInProgress" }))).toBe(false);
  });
  it("does not carry consent to the next run", () => {
    const on = gps.nextGpsState(gps.initialGpsState(true), { type: "optIn" });
    expect(gps.nextGpsState(on, { type: "reset", available: true }).consent).toBe(false);
  });
});

describe("SCRUM-273 independent queue/replay criteria through the real client", () => {
  it("retains offline work and isolates storage by account", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline")); vi.stubGlobal("fetch", fetcher);
    const store = memoryStore();
    const a = new OfflineQueue({ store, storageKey: "driver-a", api: confirmationReplayApi, lock, today: () => date });
    const b = new OfflineQueue({ store: store.tab(), storageKey: "driver-b", api: confirmationReplayApi, lock, today: () => date });
    try {
      expect(a.enqueue(tap()).ok).toBe(true); await a.drain();
      expect(a.getSnapshot().items).toHaveLength(1); expect(b.getSnapshot().items).toHaveLength(0);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "PUT", credentials: "include" });
    } finally { a.dispose(); b.dispose(); }
  });
  it("reconnects with the same idempotency key after a transient failure", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(response(driverRun()));
    vi.stubGlobal("fetch", fetcher);
    const q = new OfflineQueue({ store: memoryStore(), storageKey: "a", api: confirmationReplayApi, lock, today: () => date });
    try {
      q.enqueue(tap()); await q.drain(); const key = q.getSnapshot().items[0].clientRequestId;
      await vi.advanceTimersByTimeAsync(2000); await q.drain();
      expect(fetcher).toHaveBeenCalledTimes(2);
      for (const [, init] of fetcher.mock.calls) expect(JSON.parse(init.body)).toEqual({ status: "PICKED_UP", clientRequestId: key });
      expect(q.getSnapshot().items[0].state).toBe("synced");
    } finally { q.dispose(); }
  });
  it("does not silently lose a tap when two tabs interleave persistence", () => {
    const store = memoryStore(); let inject = false; let bSaved = false;
    const aStore = { ...store, getItem(k: string) { const before = store.getItem(k); if (inject && k === "shared") { inject = false; bSaved = b.enqueue(tap("b")).ok; } return before; } };
    const a = new OfflineQueue({ store: aStore, storageKey: "shared", api: confirmationReplayApi, lock, today: () => date });
    const b = new OfflineQueue({ store: store.tab(), storageKey: "shared", api: confirmationReplayApi, lock, today: () => date });
    try {
      inject = true; expect(a.enqueue(tap("a")).ok).toBe(true); expect(bSaved).toBe(true);
      const reloaded = new OfflineQueue({ store: store.tab(), storageKey: "shared", api: confirmationReplayApi, lock, today: () => date });
      try { expect(reloaded.getSnapshot().items.map(i => i.studentId).sort()).toEqual(["a", "b"]); } finally { reloaded.dispose(); }
    } finally { a.dispose(); b.dispose(); }
  });
  it("enforces the deadline through a stalled response body", async () => {
    vi.useFakeTimers(); let controller!: ReadableStreamDefaultController; let signal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn(async (_: RequestInfo | URL, options?: RequestInit) => {
      signal = options!.signal!;
      return new Response(new ReadableStream({ start(c) { controller = c; signal.addEventListener("abort", () => c.error(new DOMException("Aborted", "AbortError")), { once: true }); } }));
    }));
    const pending = request("/independent-timeout", { timeoutMs: 25 }).then(() => "resolved", error => error.name);
    try { await vi.advanceTimersByTimeAsync(26); expect(signal.aborted).toBe(true); expect(await pending).toBe("AbortError"); }
    finally { if (!signal.aborted) { controller.enqueue(new TextEncoder().encode("{}")); controller.close(); } await pending; }
  });
});

it("wires replay to the authenticated idempotent confirmation endpoint", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(driverRun())); vi.stubGlobal("fetch", fetcher);
  const body = { status: "PICKED_UP" as const, clientRequestId: "6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b" };
  await confirmationReplayApi.confirm({ runId: "run/a", studentId: "student/b", ...body });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/api/driver/runs/run%2Fa/students/student%2Fb/confirmation"), expect.objectContaining({ method: "PUT", credentials: "include" }));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(body);
});

it.each([401, 404, 409, 422])("handles HTTP %s according to the replay contract, without blind retries", async status => {
  vi.useFakeTimers(); let puts = 0;
  const day: DriverDay = { date, dayType: "SCHOOL_DAY", runs: status === 404 ? [] : [driverRun()] };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") { puts++; return response({ detail: "Confirmation refused" }, status); }
    if (pathOf(input) === "/api/driver/runs/today") return response(day);
    throw new Error(`Unexpected request: ${input}`);
  });
  vi.stubGlobal("fetch", fetcher);
  const refetch = vi.fn(async () => (await getDriverToday()).runs[0]);
  const q = new OfflineQueue({ store: memoryStore(), storageKey: "status", api: confirmationReplayApi, lock, today: () => date, refetch });
  try {
    q.enqueue(tap()); await q.drain();
    if (status === 401) { expect(q.getSnapshot().paused).toBe(true); expect(q.getSnapshot().items).toHaveLength(1); }
    if (status === 404 || status === 409) { expect(refetch).toHaveBeenCalledTimes(1); expect(q.getSnapshot().items).toHaveLength(0); }
    if (status === 422) {
      expect(q.getSnapshot().items[0]).toMatchObject({ state: "error", lastError: { kind: "rejected" } });
      expect(await q.retry(q.getSnapshot().items[0].id)).toBe(false);
    }
    await vi.advanceTimersByTimeAsync(60_000); await q.drain(); expect(puts).toBe(1);
  } finally { q.dispose(); }
});
