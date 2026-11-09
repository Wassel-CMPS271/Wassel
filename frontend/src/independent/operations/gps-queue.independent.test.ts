// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { candidate } from "@/test-support/operationsCandidate";

interface GpsState { status: string; consent: boolean; blocked: boolean; blockedReason?: string; }
interface Gps { initialGpsState(available: boolean): GpsState; nextGpsState(s: GpsState, e: object): GpsState; isGpsActive(s: GpsState): boolean; isAvailable(v: { hasApi: boolean; hasGeolocation: boolean; secureContext: boolean }): boolean; }
interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; subscribe(fn: () => void): () => void; tab(): Store; }
interface Tap { runId: string; runDate: string; studentId: string; status: string; }
interface Item extends Tap { clientRequestId: string; state: string; }
interface Queue { enqueue(v: Tap): { ok: boolean }; drain(): Promise<void>; resume(): Promise<void>; retry(id: string): void; dispose(): void; getSnapshot(): { items: Item[]; paused: boolean }; }
const date = "2026-11-09";
const tap = (studentId = "a"): Tap => ({ runId: "r", runDate: date, studentId, status: "PICKED_UP" });
function modules() {
  return {
    ...candidate<{ OfflineQueue: new (opts: object) => Queue }>("lib/offline/queue.ts"),
    ...candidate<{ memoryStore(): Store }>("lib/offline/storage.ts"),
    ...candidate<{ ApiError: new (status: number) => Error }>("lib/api/errors.ts"),
  };
}
const lock = { run: async (fn: (renew: () => void) => Promise<unknown>) => ({ acquired: true, value: await fn(() => {}) }) };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("SCRUM-273 independent consent/permission criteria", () => {
  it.each([{ hasApi: false, hasGeolocation: true, secureContext: true }, { hasApi: true, hasGeolocation: false, secureContext: true }, { hasApi: true, hasGeolocation: true, secureContext: false }])("does not permit sharing without every prerequisite %j", values => { const gps = candidate<Gps>("app/(driver)/driver/gpsState.ts"); expect(gps.isAvailable(values)).toBe(false); });
  it("starts with no consent and requires an explicit opt-in", () => { const gps = candidate<Gps>("app/(driver)/driver/gpsState.ts"); const off = gps.initialGpsState(true); expect(off.consent).toBe(false); expect(gps.isGpsActive(off)).toBe(false); expect(gps.nextGpsState(off, { type: "optIn" }).status).toBe("requesting"); });
  it("stops on permission denial and explicit opt-out", () => { const gps = candidate<Gps>("app/(driver)/driver/gpsState.ts"); const on = gps.nextGpsState(gps.initialGpsState(true), { type: "optIn" }); const denied = gps.nextGpsState(on, { type: "permissionDenied" }); expect(denied.status).toBe("denied"); expect(gps.isGpsActive(denied)).toBe(false); const off = gps.nextGpsState(on, { type: "optOut" }); expect(off.consent).toBe(false); expect(gps.isGpsActive(off)).toBe(false); });
  it("cannot continue sharing when the run stops being active", () => { const gps = candidate<Gps>("app/(driver)/driver/gpsState.ts"); const on = gps.nextGpsState(gps.initialGpsState(true), { type: "optIn" }); const ended = gps.nextGpsState(on, { type: "conditions", blocked: true, reason: "runNotInProgress" }); expect(gps.isGpsActive(ended)).toBe(false); });
  it("does not carry consent to the next run", () => { const gps = candidate<Gps>("app/(driver)/driver/gpsState.ts"); const on = gps.nextGpsState(gps.initialGpsState(true), { type: "optIn" }); expect(gps.nextGpsState(on, { type: "reset", available: true }).consent).toBe(false); });
});

describe("SCRUM-273 independent queue/replay criteria", () => {
  it("retains offline work without a replay API and isolates storage by account", async () => {
    const { OfflineQueue, memoryStore } = modules(); const store = memoryStore(); const a = new OfflineQueue({ store, storageKey: "driver-a", api: null, lock, today: () => date }); const b = new OfflineQueue({ store: store.tab(), storageKey: "driver-b", api: null, lock, today: () => date });
    try { expect(a.enqueue(tap()).ok).toBe(true); await a.drain(); expect(a.getSnapshot().items).toHaveLength(1); expect(b.getSnapshot().items).toHaveLength(0); } finally { a.dispose(); b.dispose(); }
  });
  it("reconnects with the same idempotency key after a transient failure", async () => {
    vi.useFakeTimers(); const { OfflineQueue, memoryStore } = modules(); const confirm = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue({});
    const q = new OfflineQueue({ store: memoryStore(), storageKey: "a", api: { confirm }, lock, today: () => date });
    try { q.enqueue(tap()); await q.drain(); const key = q.getSnapshot().items[0].clientRequestId; await vi.advanceTimersByTimeAsync(2000); await q.drain(); expect(confirm).toHaveBeenCalledTimes(2); expect(confirm.mock.calls.every(call => JSON.stringify(call).includes(key))).toBe(true); expect(q.getSnapshot().items[0].state).toBe("synced"); } finally { q.dispose(); }
  });
  it("does not silently lose a tap when two tabs interleave persistence", () => {
    const { OfflineQueue, memoryStore } = modules(); const store = memoryStore(); let inject = false; const queues: { b?: Queue } = {}; let bSaved = false;
    const aStore = { ...store, getItem(k: string) { const before = store.getItem(k); if (inject && k === "shared") { inject = false; bSaved = queues.b!.enqueue(tap("b")).ok; } return before; } };
    const a = new OfflineQueue({ store: aStore, storageKey: "shared", api: null, lock, today: () => date }); const b = new OfflineQueue({ store: store.tab(), storageKey: "shared", api: null, lock, today: () => date });
    queues.b = b;
    try { inject = true; expect(a.enqueue(tap("a")).ok).toBe(true); expect(bSaved).toBe(true); const saved = JSON.parse(store.getItem("shared")!); expect(saved.items.map((i: Item) => i.studentId).sort()).toEqual(["a", "b"]); } finally { a.dispose(); b.dispose(); }
  });
  it("enforces the deadline through a stalled response body", async () => {
    vi.useFakeTimers();
    const { request } = candidate<{ request(path: string, opts: object): Promise<unknown> }>("lib/api/client.ts");
    let controller!: ReadableStreamDefaultController; let signal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn(async (_: string, options: { signal: AbortSignal }) => { signal = options.signal; return new Response(new ReadableStream({ start(c) { controller = c; signal.addEventListener("abort", () => c.error(new DOMException("Aborted", "AbortError")), { once: true }); } })); }));
    const pending = request("/independent-timeout", { timeoutMs: 25 }).then(() => "resolved", error => error.name);
    try { await vi.advanceTimersByTimeAsync(26); expect(signal.aborted).toBe(true); expect(await pending).toBe("AbortError"); } finally { if (!signal.aborted) { controller.enqueue(new TextEncoder().encode("{}")); controller.close(); } await pending; }
  });
});
