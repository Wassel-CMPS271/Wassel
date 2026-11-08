// The offline confirmation queue (SCRUM-273) with a memory store, a fake replay API
// and fake timers. The fake server records each clientRequestId once, the way the
// draft contract (docs/contracts/driver-gps-offline.md) says SCRUM-263 will, so
// "recorded once" below means "no duplicate confirmation on the server".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConfirmationReplayApi,
  ConfirmationReplayInput,
  ConfirmationReplayOptions,
} from "../api/confirmationReplay";
import { ApiError, ApiValidationError } from "../api/errors";
import type { Run } from "../api/runs";
import { DEFAULT_LEASE_TTL_MS, leaseLock, type DrainLock } from "./lock";
import {
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_SEND_TIMEOUT_MS,
  DEFAULT_SYNCED_DISPLAY_MS,
  OfflineQueue,
  STALE_MESSAGE,
  backoffDelay,
  todayInBeirut,
  type EnqueueInput,
  type OfflineQueueOptions,
  type QueueItem,
} from "./queue";
import { StorageError, memoryStore, queueStorageKey, type KeyValueStore } from "./storage";

const TODAY = "2026-11-09";
const YESTERDAY = "2026-11-08";
const KEY = queueStorageKey("driver-1");

const DANA_PICKED: EnqueueInput = {
  runId: "run-1",
  runDate: TODAY,
  studentId: "dana",
  status: "PICKED_UP",
};
const DANA_DROPPED: EnqueueInput = { ...DANA_PICKED, status: "DROPPED_OFF" };
const TAREK_PICKED: EnqueueInput = { ...DANA_PICKED, studentId: "tarek" };

// Always free: for tests that aren't about two tabs.
const freeLock: DrainLock = {
  run: async (fn) => ({ acquired: true, value: await fn(() => {}) }),
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function runFor(input: ConfirmationReplayInput): Run {
  return { id: input.runId, stops: [] } as unknown as Run;
}

// Answers every call with success unless a step was scripted for it. A step can fail
// the call, or hold it until the test lets it go.
function fakeServer() {
  const calls: ConfirmationReplayInput[] = [];
  const timeouts: Array<number | undefined> = [];
  const recorded = new Map<string, ConfirmationReplayInput>();
  const script: Array<() => Promise<void>> = [];
  const confirm = vi.fn(
    async (input: ConfirmationReplayInput, options?: ConfirmationReplayOptions): Promise<Run> => {
      calls.push(input);
      timeouts.push(options?.timeoutMs);
      const step = script.shift();
      if (step) await step();
      if (!recorded.has(input.clientRequestId)) recorded.set(input.clientRequestId, input);
      return runFor(input);
    },
  );
  return {
    api: { confirm } as ConfirmationReplayApi,
    confirm,
    calls,
    timeouts,
    recorded,
    failNext(error: unknown) {
      script.push(() => Promise.reject(error));
    },
    holdNext() {
      const gate = deferred();
      script.push(() => gate.promise);
      return gate;
    },
  };
}

const queues: OfflineQueue[] = [];

function makeQueue(options: Partial<OfflineQueueOptions> = {}): OfflineQueue {
  const queue = new OfflineQueue({
    store: memoryStore(),
    storageKey: KEY,
    api: null,
    lock: freeLock,
    today: () => TODAY,
    ...options,
  });
  queues.push(queue);
  return queue;
}

function stored(store: KeyValueStore): QueueItem[] {
  const raw = store.getItem(KEY);
  return raw === null ? [] : (JSON.parse(raw) as { items: QueueItem[] }).items;
}

function items(queue: OfflineQueue) {
  return queue.getSnapshot().items;
}

function only(queue: OfflineQueue): QueueItem {
  const all = items(queue);
  expect(all).toHaveLength(1);
  return all[0];
}

// Lets promise chains settle without moving the clock.
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

// A store that refuses writes (full) or reads while the flag is on.
function failingStore(base: KeyValueStore = memoryStore()) {
  const state = { fullWrites: false, unreadable: false };
  const store: KeyValueStore = {
    getItem(key) {
      if (state.unreadable) throw new StorageError("unavailable", "Can't read");
      return base.getItem(key);
    },
    setItem(key, value) {
      if (state.fullWrites) throw new StorageError("quota", "Storage on this device is full");
      base.setItem(key, value);
    },
    removeItem: (key) => base.removeItem(key),
    subscribe: (listener) => base.subscribe(listener),
  };
  return { store, state };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T05:00:00Z"));
});

afterEach(() => {
  for (const queue of queues.splice(0)) queue.dispose();
  vi.useRealTimers();
});

describe("enqueue", () => {
  it("writes the item and its clientRequestId to storage before anything is sent", () => {
    const store = memoryStore();
    const server = fakeServer();
    const queue = makeQueue({ store, api: server.api });

    const result = queue.enqueue(DANA_PICKED);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.duplicate).toBe(false);
    expect(result.item).toMatchObject({
      ...DANA_PICKED,
      state: "queued",
      attempts: 0,
      occurredAt: "2026-11-09T05:00:00.000Z",
      createdAt: Date.now(),
    });
    expect(result.item.clientRequestId).toEqual(expect.any(String));
    expect(result.item.clientRequestId).not.toBe(result.item.id);
    // In storage already, key included, and nothing sent.
    expect(stored(store)).toEqual([result.item]);
    expect(server.confirm).not.toHaveBeenCalled();
  });

  it("does nothing for a tap identical to one not sent yet", () => {
    const store = memoryStore();
    const queue = makeQueue({ store });

    const first = queue.enqueue(DANA_PICKED);
    const again = queue.enqueue(DANA_PICKED);

    expect(again).toEqual({ ok: true, item: first.ok && first.item, duplicate: true });
    expect(stored(store)).toHaveLength(1);
  });

  it("gives every new tap its own key", () => {
    const queue = makeQueue();

    const picked = queue.enqueue(DANA_PICKED);
    const dropped = queue.enqueue(DANA_DROPPED);
    const tarek = queue.enqueue(TAREK_PICKED);

    const keys = [picked, dropped, tarek].map((r) => r.ok && r.item.clientRequestId);
    expect(new Set(keys).size).toBe(3);
  });

  it("treats a tap identical to one already synced as a new tap with a new key", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    const first = queue.enqueue(DANA_PICKED);
    await queue.drain();

    const again = queue.enqueue(DANA_PICKED);

    expect(again.ok && again.duplicate).toBe(false);
    expect(again.ok && again.item.clientRequestId).not.toBe(first.ok && first.item.clientRequestId);
  });
});

describe("drain", () => {
  it("sends with the item's key and the request timeout, shows it synced, then prunes it", async () => {
    const store = memoryStore();
    const server = fakeServer();
    const onEvent = vi.fn();
    const queue = makeQueue({ store, api: server.api, onEvent });
    const result = queue.enqueue(DANA_PICKED);
    if (!result.ok) throw new Error("enqueue failed");

    await queue.drain();

    expect(server.confirm).toHaveBeenCalledTimes(1);
    expect(server.confirm).toHaveBeenCalledWith(
      {
        runId: "run-1",
        studentId: "dana",
        status: "PICKED_UP",
        clientRequestId: result.item.clientRequestId,
      },
      { timeoutMs: DEFAULT_SEND_TIMEOUT_MS },
    );
    // occurredAt stays on the phone while it's an open question in the contract.
    expect(server.calls[0]).not.toHaveProperty("occurredAt");
    expect(only(queue)).toMatchObject({ state: "synced", attempts: 1, serverStatus: 200 });
    expect(onEvent).toHaveBeenCalledWith({
      type: "synced",
      item: expect.objectContaining({ id: result.item.id, state: "synced" }),
      run: { id: "run-1", stops: [] },
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_SYNCED_DISPLAY_MS - 1);
    expect(items(queue)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(items(queue)).toEqual([]);
    expect(stored(store)).toEqual([]);
  });

  it("keeps the item marked sending in storage while the request is out", async () => {
    const store = memoryStore();
    const server = fakeServer();
    const gate = server.holdNext();
    const queue = makeQueue({ store, api: server.api });
    queue.enqueue(DANA_PICKED);

    const draining = queue.drain();
    await flush();

    expect(stored(store)[0]).toMatchObject({ state: "sending", attempts: 1 });
    expect(queue.getSnapshot().draining).toBe(true);
    gate.resolve();
    await draining;
    expect(queue.getSnapshot().draining).toBe(false);
  });

  it("sends once when drain() is called twice at the same time", async () => {
    const server = fakeServer();
    const gate = server.holdNext();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);

    const first = queue.drain();
    const second = queue.drain();
    await flush();

    expect(second).toBe(first);
    expect(server.confirm).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(server.confirm).toHaveBeenCalledTimes(1);
    expect(server.recorded.size).toBe(1);
  });

  it("sends every stop's items in one drain", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(TAREK_PICKED);

    await queue.drain();

    expect(server.calls.map((c) => c.studentId)).toEqual(["dana", "tarek"]);
    expect(items(queue).map((i) => i.state)).toEqual(["synced", "synced"]);
  });

  it("keeps items queued and sends nothing while there is no replay API", async () => {
    const store = memoryStore();
    const queue = makeQueue({ store, api: null });
    queue.enqueue(DANA_PICKED);

    await queue.drain();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(queue.getSnapshot().replayAvailable).toBe(false);
    expect(only(queue).state).toBe("queued");
    expect(stored(store)[0].state).toBe("queued");
  });
});

describe("the same key on every resend", () => {
  it("resends a network failure after the backoff, with the same key", async () => {
    const server = fakeServer();
    const onEvent = vi.fn();
    const queue = makeQueue({ api: server.api, onEvent });
    queue.enqueue(DANA_PICKED);
    server.failNext(new TypeError("Failed to fetch"));

    await queue.drain();

    expect(only(queue)).toMatchObject({
      state: "error",
      lastError: { kind: "retryable", message: "Failed to fetch" },
      nextAttemptAt: Date.now() + 2_000,
    });
    expect(onEvent).toHaveBeenCalledWith({ type: "network", reachable: false });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(server.confirm).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.confirm).toHaveBeenCalledTimes(2);
    expect(server.calls[1].clientRequestId).toBe(server.calls[0].clientRequestId);
    expect(only(queue)).toMatchObject({ state: "synced", attempts: 2 });
    expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: "synced" }));
  });

  it.each([
    ["a timeout", new DOMException("The operation was aborted.", "AbortError")],
    ["a 5xx", new ApiError(503, "Unavailable")],
    ["a 429", new ApiError(429, "Slow down")],
  ])("resends after %s too", async (_label, error) => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    server.failNext(error);

    await queue.drain();
    expect(only(queue).lastError?.kind).toBe("retryable");
    await vi.advanceTimersByTimeAsync(2_000);

    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].clientRequestId).toBe(server.calls[0].clientRequestId);
    expect(only(queue).state).toBe("synced");
  });

  it("backs off exponentially, up to a cap", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    const delays = [2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000];
    for (let i = 0; i < delays.length; i++) server.failNext(new TypeError("Failed to fetch"));

    await queue.drain();
    for (const delay of delays) {
      expect(only(queue).nextAttemptAt! - Date.now()).toBe(delay);
      await vi.advanceTimersByTimeAsync(delay);
    }

    expect(server.calls).toHaveLength(delays.length + 1);
    expect(new Set(server.calls.map((c) => c.clientRequestId)).size).toBe(1);
    expect(new Set(server.timeouts)).toEqual(new Set([DEFAULT_SEND_TIMEOUT_MS]));
    expect(only(queue).state).toBe("synced");
  });

  it("stops the drain at a network failure instead of failing every other item", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(TAREK_PICKED);
    server.failNext(new TypeError("Failed to fetch"));

    await queue.drain();

    expect(server.calls).toHaveLength(1);
    expect(items(queue).map((i) => i.state)).toEqual(["error", "queued"]);
  });

  it("resends at once on Try again, with the same key", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    server.failNext(new ApiError(400, "Malformed request body"));
    await queue.drain();
    const failed = only(queue);
    expect(failed).toMatchObject({
      state: "error",
      serverStatus: 400,
      lastError: { kind: "rejected", message: "Malformed request body" },
    });

    expect(queue.retry(failed.id)).toBe(true);
    await queue.drain();

    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].clientRequestId).toBe(failed.clientRequestId);
    expect(only(queue)).toMatchObject({ state: "synced", lastError: undefined });
  });

  it("keeps the key across a reload", async () => {
    const store = memoryStore();
    const before = makeQueue({ store, api: null });
    const saved = before.enqueue(DANA_PICKED);
    before.dispose();

    const server = fakeServer();
    const after = makeQueue({ store, api: server.api });
    expect(only(after)).toEqual(saved.ok && saved.item);
    await after.drain();

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].clientRequestId).toBe(saved.ok && saved.item.clientRequestId);
  });

  it("loses nothing and records once when the tab reloads mid-send", async () => {
    const store = memoryStore();
    const server = fakeServer();
    const lostAnswer = server.holdNext();
    const tab1 = makeQueue({
      store,
      api: server.api,
      lock: leaseLock({ store, key: `${KEY}.lease`, tabId: "tab-1" }),
    });
    const saved = tab1.enqueue(DANA_PICKED);
    void tab1.drain();
    await flush();
    expect(stored(store)[0].state).toBe("sending");
    // The page reloads: the old instance is gone and its answer never arrives.
    tab1.dispose();

    const tab2 = makeQueue({
      store: store.tab(),
      api: server.api,
      lock: leaseLock({ store: store.tab(), key: `${KEY}.lease`, tabId: "tab-2" }),
    });
    expect(only(tab2).state).toBe("sending");
    // The closed tab's lease still holds until it expires.
    await tab2.drain();
    expect(server.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(DEFAULT_LEASE_TTL_MS);
    await tab2.drain();

    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].clientRequestId).toBe(saved.ok && saved.item.clientRequestId);
    expect(only(tab2)).toMatchObject({ id: saved.ok && saved.item.id, state: "synced" });
    // Even if the first request reached the server after all, it counts once.
    lostAnswer.resolve();
    await flush();
    expect(server.recorded.size).toBe(1);
    expect(stored(store)).toHaveLength(1);
  });
});

describe("order per student", () => {
  it("sends one student's taps in the order they were made, one at a time", async () => {
    const server = fakeServer();
    const gate = server.holdNext();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(DANA_DROPPED);

    const draining = queue.drain();
    await flush();
    expect(server.calls.map((c) => c.status)).toEqual(["PICKED_UP"]);
    expect(items(queue).map((i) => i.state)).toEqual(["sending", "queued"]);

    gate.resolve();
    await draining;
    expect(server.calls.map((c) => c.status)).toEqual(["PICKED_UP", "DROPPED_OFF"]);
  });

  it("blocks a student's later taps behind a failed one, but not other students'", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(DANA_DROPPED);
    queue.enqueue(TAREK_PICKED);
    server.failNext(new ApiError(409, "Dana is already dropped off"));

    await queue.drain();

    expect(items(queue).map((i) => [i.studentId, i.status, i.state])).toEqual([
      ["dana", "PICKED_UP", "conflict"],
      ["dana", "DROPPED_OFF", "blocked"],
      ["tarek", "PICKED_UP", "synced"],
    ]);
    // An hour later Tarek's synced item is pruned; Dana's still wait for the driver.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(items(queue).map((i) => i.state)).toEqual(["conflict", "blocked"]);
    expect(server.calls.map((c) => c.studentId)).toEqual(["dana", "tarek"]);
  });

  it("enqueues a new tap as blocked when it's behind a failed one", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    server.failNext(new ApiError(409, "Not in progress"));
    await queue.drain();

    const later = queue.enqueue(DANA_DROPPED);

    expect(later.ok && later.item.state).toBe("blocked");
  });

  it("releases the next tap when the failed one is discarded", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(DANA_DROPPED);
    server.failNext(new ApiError(409, "Not in progress"));
    await queue.drain();

    expect(queue.discard(items(queue)[0].id)).toBe(true);
    await queue.drain();

    expect(server.calls.map((c) => c.status)).toEqual(["PICKED_UP", "DROPPED_OFF"]);
    expect(only(queue)).toMatchObject({ status: "DROPPED_OFF", state: "synced" });
  });

  it("sends the failed tap first, then the next, on Try again", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(DANA_DROPPED);
    server.failNext(new ApiError(409, "Not in progress"));
    await queue.drain();

    queue.retry(items(queue)[0].id);
    // Try again starts sending at once; the next tap is no longer blocked.
    expect(items(queue).map((i) => i.state)).toEqual(["sending", "queued"]);
    await queue.drain();

    expect(server.calls.map((c) => c.status)).toEqual(["PICKED_UP", "PICKED_UP", "DROPPED_OFF"]);
    expect(items(queue).map((i) => i.state)).toEqual(["synced", "synced"]);
  });

  it("holds the next tap behind a retryable failure until that one is sent", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(DANA_DROPPED);
    server.failNext(new TypeError("Failed to fetch"));

    await queue.drain();
    expect(items(queue).map((i) => i.state)).toEqual(["error", "blocked"]);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(server.calls.map((c) => c.status)).toEqual(["PICKED_UP", "PICKED_UP", "DROPPED_OFF"]);
    expect(items(queue).map((i) => i.state)).toEqual(["synced", "synced"]);
  });
});

describe("a 401", () => {
  it("pauses the whole queue and keeps every item", async () => {
    const store = memoryStore();
    const server = fakeServer();
    const onEvent = vi.fn();
    const queue = makeQueue({ store, api: server.api, onEvent });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(TAREK_PICKED);
    server.failNext(new ApiError(401));

    await queue.drain();
    await queue.drain();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(queue.getSnapshot().paused).toBe(true);
    expect(server.calls).toHaveLength(1);
    expect(items(queue).map((i) => i.state)).toEqual(["queued", "queued"]);
    expect(stored(store).map((i) => i.state)).toEqual(["queued", "queued"]);
    expect(onEvent).toHaveBeenCalledWith({ type: "auth" });
  });

  it("sends them with the same keys once resumed", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    queue.enqueue(TAREK_PICKED);
    server.failNext(new ApiError(401));
    await queue.drain();

    await queue.resume();

    expect(queue.getSnapshot().paused).toBe(false);
    expect(server.calls.map((c) => c.studentId)).toEqual(["dana", "dana", "tarek"]);
    expect(server.calls[1].clientRequestId).toBe(server.calls[0].clientRequestId);
    expect(items(queue).map((i) => i.state)).toEqual(["synced", "synced"]);
  });
});

describe("conflicts and rejections", () => {
  it.each([409, 404])(
    "turns a %s into a conflict with the server's detail, never retried automatically",
    async (status) => {
      const server = fakeServer();
      const onEvent = vi.fn();
      const queue = makeQueue({ api: server.api, onEvent });
      queue.enqueue(DANA_PICKED);
      server.failNext(new ApiError(status, "Dana is not on this run"));

      await queue.drain();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      await queue.drain();

      expect(server.calls).toHaveLength(1);
      expect(only(queue)).toMatchObject({
        state: "conflict",
        serverStatus: status,
        lastError: { kind: "conflict", message: "Dana is not on this run" },
      });
      expect(only(queue).nextAttemptAt).toBeUndefined();
      expect(onEvent).toHaveBeenCalledWith({
        type: "conflict",
        item: expect.objectContaining({ state: "conflict" }),
      });
      expect(onEvent).toHaveBeenCalledWith({ type: "network", reachable: true });
    },
  );

  it("resends a conflict on Try again with the same key", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    server.failNext(new ApiError(409, "Not in progress"));
    await queue.drain();

    expect(queue.retry(only(queue).id)).toBe(true);
    await queue.drain();

    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].clientRequestId).toBe(server.calls[0].clientRequestId);
    expect(only(queue).state).toBe("synced");
  });

  it.each([400, 403, 422])("rejects a %s and waits for the driver", async (status) => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    server.failNext(new ApiError(status, "Refused"));

    await queue.drain();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(server.calls).toHaveLength(1);
    expect(only(queue)).toMatchObject({
      state: "error",
      serverStatus: status,
      lastError: { kind: "rejected", message: "Refused" },
    });
  });

  it("rejects a field error map with its message", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue(DANA_PICKED);
    server.failNext(new ApiValidationError({ status: "Status is required" }));

    await queue.drain();

    expect(only(queue).lastError).toEqual({ kind: "rejected", message: "Status is required" });
  });
});

describe("retry and discard", () => {
  it("only work on failed items", async () => {
    const server = fakeServer();
    const gate = server.holdNext();
    const queue = makeQueue({ api: server.api });
    const sending = queue.enqueue(DANA_PICKED);
    const waiting = queue.enqueue(TAREK_PICKED);
    if (!sending.ok || !waiting.ok) throw new Error("enqueue failed");
    const draining = queue.drain();
    await flush();

    for (const id of [sending.item.id, waiting.item.id, "unknown"]) {
      expect(queue.retry(id)).toBe(false);
      expect(queue.discard(id)).toBe(false);
    }

    gate.resolve();
    await draining;
    expect(queue.retry(sending.item.id)).toBe(false);
    expect(queue.discard(sending.item.id)).toBe(false);
  });

  it("discard removes the item from storage", async () => {
    const store = memoryStore();
    const server = fakeServer();
    const queue = makeQueue({ store, api: server.api });
    queue.enqueue(DANA_PICKED);
    server.failNext(new ApiError(404, "Not on this run"));
    await queue.drain();

    expect(queue.discard(only(queue).id)).toBe(true);

    expect(items(queue)).toEqual([]);
    expect(stored(store)).toEqual([]);
  });
});

describe("items from another day", () => {
  it("are never sent, and show as a conflict the driver can only discard", async () => {
    const server = fakeServer();
    const queue = makeQueue({ api: server.api });
    queue.enqueue({ ...DANA_PICKED, runDate: YESTERDAY });

    await queue.drain();

    expect(server.confirm).not.toHaveBeenCalled();
    const item = only(queue);
    expect(item).toMatchObject({
      state: "conflict",
      lastError: { kind: "conflict", message: STALE_MESSAGE },
    });
    expect(queue.retry(item.id)).toBe(false);
    expect(queue.discard(item.id)).toBe(true);
  });

  it("stop being replayed once the day is over", async () => {
    let today = TODAY;
    const server = fakeServer();
    const queue = makeQueue({ api: server.api, today: () => today });
    queue.enqueue(DANA_PICKED);
    server.failNext(new TypeError("Failed to fetch"));
    await queue.drain();

    today = "2026-11-10";
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(server.calls).toHaveLength(1);
    expect(only(queue)).toMatchObject({ state: "conflict", lastError: { message: STALE_MESSAGE } });
  });

  it("are not resent when a closed tab left them sending", async () => {
    const store = memoryStore();
    const left: QueueItem = {
      id: "i-1",
      clientRequestId: "k-1",
      ...DANA_PICKED,
      runDate: YESTERDAY,
      occurredAt: "2026-11-08T05:00:00.000Z",
      createdAt: 0,
      attempts: 1,
      state: "sending",
    };
    store.setItem(KEY, JSON.stringify({ v: 1, items: [left] }));
    const server = fakeServer();
    const queue = makeQueue({ store, api: server.api });

    await queue.drain();

    expect(server.confirm).not.toHaveBeenCalled();
    expect(only(queue).state).toBe("conflict");
  });
});

describe("storage that fails", () => {
  it("shows corrupt data as an error, refuses new taps and leaves the data as it was", async () => {
    const store = memoryStore();
    store.setItem(KEY, "{not json");
    const server = fakeServer();
    const queue = makeQueue({ store, api: server.api });

    expect(queue.getSnapshot().storageError?.kind).toBe("corrupt");
    const result = queue.enqueue(DANA_PICKED);
    await queue.drain();

    expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: "corrupt" }) });
    expect(store.getItem(KEY)).toBe("{not json");
    expect(server.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["items that aren't items", { v: 1, items: [{ id: 1 }] }],
    ["an unknown status", { v: 1, items: [{ ...DANA_PICKED, status: "LOST" }] }],
    ["another version", { v: 2, items: [] }],
    ["not an object", 42],
  ])("treats %s as corrupt", (_label, value) => {
    const store = memoryStore();
    store.setItem(KEY, JSON.stringify(value));

    const queue = makeQueue({ store });

    expect(queue.getSnapshot().storageError?.kind).toBe("corrupt");
    expect(items(queue)).toEqual([]);
  });

  it("refuses a tap when storage is full, says so, and recovers once there's room", () => {
    const { store, state } = failingStore();
    const queue = makeQueue({ store });
    state.fullWrites = true;

    const refused = queue.enqueue(DANA_PICKED);

    expect(refused).toEqual({ ok: false, error: expect.objectContaining({ kind: "quota" }) });
    expect(items(queue)).toEqual([]);
    expect(queue.getSnapshot().storageError?.kind).toBe("quota");

    state.fullWrites = false;
    const saved = queue.enqueue(DANA_PICKED);

    expect(saved.ok).toBe(true);
    expect(items(queue)).toHaveLength(1);
    expect(queue.getSnapshot().storageError).toBeNull();
  });

  it("refuses a tap when storage can't be read", () => {
    const { store, state } = failingStore();
    state.unreadable = true;

    const queue = makeQueue({ store });

    expect(queue.getSnapshot().storageError?.kind).toBe("unavailable");
    expect(queue.enqueue(DANA_PICKED).ok).toBe(false);
  });

  it("doesn't send an item it can't mark as sending, and sends it with its key later", async () => {
    const { store, state } = failingStore();
    const server = fakeServer();
    const queue = makeQueue({ store, api: server.api });
    const saved = queue.enqueue(DANA_PICKED);
    state.fullWrites = true;

    await queue.drain();

    expect(server.confirm).not.toHaveBeenCalled();
    expect(queue.getSnapshot().storageError?.kind).toBe("quota");
    expect(only(queue).state).toBe("queued");

    state.fullWrites = false;
    await queue.drain();

    expect(server.calls[0].clientRequestId).toBe(saved.ok && saved.item.clientRequestId);
    expect(only(queue).state).toBe("synced");
  });
});

describe("two tabs", () => {
  function twoTabs() {
    const shared = memoryStore();
    const server = fakeServer();
    const tab = (store: KeyValueStore, tabId: string) =>
      makeQueue({ store, api: server.api, lock: leaseLock({ store, key: `${KEY}.lease`, tabId }) });
    return { server, shared, a: tab(shared, "tab-a"), b: tab(shared.tab(), "tab-b") };
  }

  it("send each item once: the tab without the lock sends nothing", async () => {
    const { server, a, b } = twoTabs();
    const gate = server.holdNext();
    a.enqueue(DANA_PICKED);

    const aDraining = a.drain();
    await flush();
    await b.drain();
    expect(server.confirm).toHaveBeenCalledTimes(1);

    gate.resolve();
    await aDraining;
    await b.drain();
    expect(server.confirm).toHaveBeenCalledTimes(1);
    expect(server.recorded.size).toBe(1);
  });

  it("see each other's changes as they happen", async () => {
    const { a, b } = twoTabs();
    const listener = vi.fn();
    b.subscribe(listener);

    a.enqueue(DANA_PICKED);
    expect(only(b).state).toBe("queued");
    expect(listener).toHaveBeenCalled();

    await a.drain();
    expect(only(b).state).toBe("synced");
  });

  it("wait lockRetryMs, not spin, when a retry comes due while the other tab holds the lock", async () => {
    const shared = memoryStore();
    const server = fakeServer();
    const a = makeQueue({
      store: shared,
      api: server.api,
      lock: leaseLock({ store: shared, key: `${KEY}.lease`, tabId: "tab-a" }),
    });
    const bStore = shared.tab();
    const bLease = leaseLock({ store: bStore, key: `${KEY}.lease`, tabId: "tab-b" });
    const bAttempts = vi.fn();
    const b = makeQueue({
      store: bStore,
      api: server.api,
      lock: {
        run(fn) {
          bAttempts();
          return bLease.run(fn);
        },
      },
    });
    a.enqueue(TAREK_PICKED);
    a.enqueue(DANA_PICKED);
    server.failNext(new TypeError("Failed to fetch"));
    await a.drain(); // Tarek fails (retry due in 2s); the drain stops there.
    const gate = server.holdNext();
    const aDraining = a.drain(); // Dana goes out; a holds the lock until she's answered.
    await flush();
    expect(server.calls.map((c) => c.studentId)).toEqual(["tarek", "dana"]);

    // Tarek's retry comes due in both tabs while a is busy. b can't get the lock, and
    // tries again every lockRetryMs (5s): at 2s, 7s and 12s, not every millisecond.
    await vi.advanceTimersByTimeAsync(12_000);
    expect(bAttempts).toHaveBeenCalledTimes(3);
    expect(server.calls).toHaveLength(2);
    expect(b.getSnapshot().items.map((i) => i.state)).toEqual(["error", "sending"]);

    // Once Dana is answered, a's own loop sends Tarek's due retry.
    gate.resolve();
    await aDraining;
    expect(server.calls.map((c) => c.studentId)).toEqual(["tarek", "dana", "tarek"]);
    expect(items(b).map((i) => i.state)).toEqual(["synced", "synced"]);
    expect(server.recorded.size).toBe(2);
  });

  it("keep both tabs' taps when both enqueue", async () => {
    const { shared, server, a, b } = twoTabs();

    a.enqueue(DANA_PICKED);
    b.enqueue(TAREK_PICKED);
    expect(stored(shared).map((i) => i.studentId)).toEqual(["dana", "tarek"]);

    await a.drain();
    expect(server.calls.map((c) => c.studentId)).toEqual(["dana", "tarek"]);
    expect(items(b).map((i) => i.state)).toEqual(["synced", "synced"]);
  });
});

describe("snapshot", () => {
  it("is the same object until something changes, and subscribers hear each change", () => {
    const queue = makeQueue();
    const before = queue.getSnapshot();
    expect(queue.getSnapshot()).toBe(before);
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    queue.enqueue(DANA_PICKED);

    expect(listener).toHaveBeenCalled();
    expect(queue.getSnapshot()).not.toBe(before);
    const calls = listener.mock.calls.length;
    unsubscribe();
    queue.enqueue(TAREK_PICKED);
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("reports whether each attempt reached the server", async () => {
    const server = fakeServer();
    const onEvent = vi.fn();
    const queue = makeQueue({ api: server.api, onEvent });
    queue.enqueue(DANA_PICKED);
    server.failNext(new TypeError("Failed to fetch"));
    server.failNext(new ApiError(500, "Oops"));

    await queue.drain();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(4_000);

    const network = onEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === "network")
      .map((event) => event.reachable);
    expect(network).toEqual([false, true, true]);
  });
});

describe("helpers", () => {
  it("backoffDelay doubles from the base up to the cap", () => {
    expect([1, 2, 3, 4, 10].map((n) => backoffDelay(n, 2_000, DEFAULT_BACKOFF_MAX_MS))).toEqual([
      2_000, 4_000, 8_000, 16_000, 60_000,
    ]);
    expect(backoffDelay(0, 2_000, 60_000)).toBe(2_000);
  });

  it("todayInBeirut is the calendar date in Asia/Beirut, not UTC", () => {
    expect(todayInBeirut(new Date("2026-11-08T21:59:00Z"))).toBe("2026-11-08");
    expect(todayInBeirut(new Date("2026-11-08T22:30:00Z"))).toBe("2026-11-09");
  });
});
