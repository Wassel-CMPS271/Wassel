// useOfflineQueue (SCRUM-273) against the real OfflineQueue engine (already covered
// end to end in lib/offline/queue.test.ts) with a fake ConfirmationReplayApi and a
// fake Connectivity, so this file only has to prove the *wiring*: onEvent reaching
// the right callback, mount draining leftovers, dispose on unmount, and a 401
// pausing the queue for good (no retry signal resumes it; only the page or a new
// queue after signing in does).

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmationReplayInput } from "@/lib/api/confirmationReplay";
import { ApiError } from "@/lib/api/errors";
import type { Run } from "@/lib/api/runs";
import type { Connectivity, ConnectivityState } from "@/lib/offline/connectivity";
import { queueStorageKey } from "@/lib/offline/storage";
import { todayInBeirut } from "@/lib/offline/queue";
import { useOfflineQueue } from "./useOfflineQueue";

vi.mock("@/components/auth/RoleGuard", () => ({
  useCurrentUser: () => ({ id: "driver-1", email: "karim@wassel.local", role: "DRIVER", schoolId: "s-1" }),
}));

const RUN_ID = "run-1";
// The real "today" in Beirut, not a fixed string: hardcoding one would make these
// tests flaky depending on which real calendar day they happen to run on (the engine
// treats an item for any other date as stale and never sends it — queue.test.ts).
const RUN_DATE = todayInBeirut();
const STORAGE_KEY = queueStorageKey("driver-1");

function runFor(input: ConfirmationReplayInput): Run {
  return { id: input.runId, stops: [] } as unknown as Run;
}

function fakeApi() {
  const calls: ConfirmationReplayInput[] = [];
  const script: Array<() => Promise<void>> = [];
  const confirm = vi.fn(async (input: ConfirmationReplayInput) => {
    calls.push(input);
    const step = script.shift();
    if (step) await step();
    return runFor(input);
  });
  return {
    confirm,
    calls,
    failNext(error: unknown) {
      script.push(() => Promise.reject(error));
    },
  };
}

function fakeConnectivity(): Connectivity & {
  retry: () => void;
  setState: (next: ConnectivityState) => void;
} {
  const retryListeners = new Set<() => void>();
  const stateListeners = new Set<() => void>();
  let state: ConnectivityState = "online";
  return {
    getState: () => state,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onRetry(listener) {
      retryListeners.add(listener);
      return () => retryListeners.delete(listener);
    },
    reportSuccess: vi.fn(),
    reportFailure: vi.fn(),
    dispose: () => {},
    retry() {
      for (const listener of [...retryListeners]) listener();
    },
    // The real Connectivity's own state changes (an "online" event, or the server
    // answering after a failure): what the new effect in useOfflineQueue.ts listens
    // for, as opposed to retry() (the periodic tick, or the tab becoming visible).
    setState(next) {
      if (next === state) return;
      state = next;
      for (const listener of [...stateListeners]) listener();
    },
  };
}

// Lets a promise chain settle without moving the clock (fake timers don't affect
// microtasks, only setTimeout/setInterval, but a chain can still take several
// microtask hops to resolve).
async function flush() {
  await act(async () => {});
}

async function setUp(
  overrides: { api?: ReturnType<typeof fakeApi>; keepMountCalls?: boolean } = {},
) {
  const api = overrides.api ?? fakeApi();
  const onSynced = vi.fn();
  const onConflict = vi.fn();
  const onAuthExpired = vi.fn();
  const connectivity = fakeConnectivity();
  const rendered = renderHook(() =>
    useOfflineQueue({ api, connectivity, onSynced, onConflict, onAuthExpired }),
  );
  // The hook drains on mount; with nothing queued yet that settles almost at once,
  // but still across a few microtask hops. Letting it finish here means a test's
  // own enqueue()+drain() can't be handed that already-resolving (and by now
  // stale) promise instead of starting a fresh run that sees its new item —
  // drain() shares one in-flight run, and this one found nothing before anything
  // was queued. keepMountCalls is for the one test about that mount-time drain
  // itself, where there's something in storage for it to find.
  await flush();
  if (!overrides.keepMountCalls) api.confirm.mockClear();
  return { ...rendered, api, onSynced, onConflict, onAuthExpired, connectivity };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("useOfflineQueue", () => {
  it("builds one queue per signed-in driver, keyed by their id", async () => {
    const { result } = await setUp();

    const enqueued = result.current.queue!.enqueue({
      runId: RUN_ID,
      runDate: RUN_DATE,
      studentId: "dana",
      status: "PICKED_UP",
    });

    expect(enqueued.ok).toBe(true);
    if (!enqueued.ok) return;
    // Saved under the driver's key at once, as a pending key the next change merges.
    const pending = JSON.parse(window.localStorage.getItem(`${STORAGE_KEY}.pending.${enqueued.item.id}`)!);
    expect(pending.item).toEqual(enqueued.item);
  });

  it("drains whatever was left in storage from a previous visit, on mount", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        items: [
          {
            id: "i-1",
            clientRequestId: "6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b",
            runId: RUN_ID,
            runDate: RUN_DATE,
            studentId: "dana",
            status: "PICKED_UP",
            occurredAt: "2026-11-09T05:00:00.000Z",
            createdAt: 0,
            attempts: 0,
            state: "queued",
          },
        ],
      }),
    );

    const { api } = await setUp({ keepMountCalls: true });

    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ runId: RUN_ID, studentId: "dana", clientRequestId: "6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b" }),
      expect.anything(),
    );
  });

  it("calls onSynced with the server's run once an item sends", async () => {
    const { result, onSynced } = await setUp();

    act(() => {
      result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });
    await act(() => result.current.queue!.drain());

    expect(onSynced).toHaveBeenCalledWith(expect.objectContaining({ id: RUN_ID }), "dana");
  });

  it("calls onConflict on a 404/409, without touching onSynced", async () => {
    const api = fakeApi();
    api.failNext(new ApiError(409, "Not in progress"));
    const { result, onConflict, onSynced } = await setUp({ api });

    act(() => {
      result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });
    await act(() => result.current.queue!.drain());

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith(
      expect.objectContaining({ status: 409, message: "Not in progress", run: undefined, dropped: 0 }),
    );
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("reports a reachable server through connectivity on success, and unreachable on a network failure", async () => {
    const failing = fakeApi();
    failing.failNext(new TypeError("Failed to fetch"));
    const { result, connectivity } = await setUp({ api: failing });

    act(() => {
      result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });
    await act(() => result.current.queue!.drain());
    expect(connectivity.reportFailure).toHaveBeenCalled();

    // The failed attempt backed off 2s before retrying; advancing fake time lets
    // the queue's own timer fire the retry rather than calling drain() again
    // before it's due.
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(connectivity.reportSuccess).toHaveBeenCalled();
  });

  it("pauses on a 401, keeps the item saved, calls onAuthExpired, and no retry tick resumes it", async () => {
    const api = fakeApi();
    api.failNext(new ApiError(401));
    const { result, connectivity, onAuthExpired } = await setUp({ api });
    act(() => {
      result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });
    await act(() => result.current.queue!.drain());
    expect(result.current.queue!.getSnapshot().paused).toBe(true);
    expect(onAuthExpired).toHaveBeenCalledTimes(1);

    // The 30 s tick, the connection coming back, the tab becoming visible: all the
    // same retry signal, and none of them brings a session back.
    act(() => connectivity.retry());
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    act(() => connectivity.retry());
    await flush();

    expect(result.current.queue!.getSnapshot().paused).toBe(true);
    expect(api.calls).toHaveLength(1);
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).items;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ state: "queued", clientRequestId: api.calls[0].clientRequestId });
  });

  it("after a 401, a new queue for the same driver (back from signing in) sends the item once, with the same key", async () => {
    const api = fakeApi();
    api.failNext(new ApiError(401));
    const first = await setUp({ api });
    act(() => {
      first.result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });
    await act(() => first.result.current.queue!.drain());
    const key = api.calls[0].clientRequestId;
    first.unmount(); // The redirect to /login.

    // Back on /driver: a fresh mount drains what was left, unpaused.
    const second = await setUp({ api, keepMountCalls: true });
    await act(() => second.result.current.queue!.drain());

    expect(api.calls.map((call) => call.clientRequestId)).toEqual([key, key]);
    expect(second.onSynced).toHaveBeenCalledTimes(1);
    expect(second.result.current.queue!.getSnapshot().paused).toBe(false);

    // Nothing left to send: another tick or reload sends nothing more.
    act(() => second.connectivity.retry());
    await flush();
    expect(api.calls).toHaveLength(2);
  });

  it("resume() (the page, once /me says the session is fine) sends the paused item with the same key", async () => {
    const api = fakeApi();
    api.failNext(new ApiError(401));
    const { result } = await setUp({ api });
    act(() => {
      result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });
    await act(() => result.current.queue!.drain());

    await act(() => result.current.queue!.resume());

    expect(api.calls).toHaveLength(2);
    expect(api.calls[1].clientRequestId).toBe(api.calls[0].clientRequestId);
  });

  it("drains on a retry signal when not paused, without redundant sends (the queue dedups concurrent drains)", async () => {
    const { result, connectivity, api } = await setUp();
    act(() => {
      result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });

    act(() => connectivity.retry());
    act(() => connectivity.retry());
    await act(() => result.current.queue!.drain());

    expect(api.confirm).toHaveBeenCalledTimes(1);
  });

  it("disposes the queue on unmount, so a pending retry never fires afterwards", async () => {
    const failing = fakeApi();
    failing.failNext(new TypeError("Failed to fetch"));
    const { result, unmount } = await setUp({ api: failing });
    act(() => {
      result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });
    await act(() => result.current.queue!.drain());
    expect(failing.confirm).toHaveBeenCalledTimes(1);

    unmount();
    await vi.advanceTimersByTimeAsync(60_000); // past the backoff that would have retried it

    expect(failing.confirm).toHaveBeenCalledTimes(1);
  });

  // SCRUM-298: a tap that got no answer at all (offline, a timeout) must not sit out
  // its backoff once connectivity itself says the connection is back — not only on
  // the shared retry signal (the tick, visibility), which already drains whatever is
  // due without speeding anything up.
  it.each<[string, ConnectivityState]>([
    ["unknown (the browser's online event)", "unknown"],
    ["online (the server answering after a failure)", "online"],
  ])(
    "sends a network-waiting tap at once when connectivity goes from offline to %s",
    async (_label, next) => {
      const failing = fakeApi();
      failing.failNext(new TypeError("Failed to fetch"));
      const { result, connectivity } = await setUp({ api: failing });
      act(() => {
        result.current.queue!.enqueue({
          runId: RUN_ID,
          runDate: RUN_DATE,
          studentId: "dana",
          status: "PICKED_UP",
        });
      });
      await act(() => result.current.queue!.drain());
      expect(failing.calls).toHaveLength(1);
      expect(result.current.queue!.getSnapshot().items[0]).toMatchObject({
        state: "error",
        lastError: { kind: "retryable", network: true },
      });

      // The periodic tick / visibility signal (onRetry) alone drains what's due,
      // without skipping the backoff: still only the one call so far.
      act(() => connectivity.retry());
      await flush();
      expect(failing.calls).toHaveLength(1);

      act(() => connectivity.setState("offline"));
      act(() => connectivity.setState(next));
      await flush();

      expect(failing.calls).toHaveLength(2);
      expect(failing.calls[1].clientRequestId).toBe(failing.calls[0].clientRequestId);
      expect(result.current.queue!.getSnapshot().items[0].state).toBe("synced");
    },
  );

  it("keeps a 5xx's own backoff on the same connectivity change that speeds up a network-waiting tap", async () => {
    const failing = fakeApi();
    failing.failNext(new ApiError(503, "Unavailable"));
    const { result, connectivity } = await setUp({ api: failing });
    act(() => {
      result.current.queue!.enqueue({
        runId: RUN_ID,
        runDate: RUN_DATE,
        studentId: "dana",
        status: "PICKED_UP",
      });
    });
    await act(() => result.current.queue!.drain());
    expect(result.current.queue!.getSnapshot().items[0]).toMatchObject({
      state: "error",
      lastError: { kind: "retryable", network: false },
    });
    const dueAt = result.current.queue!.getSnapshot().items[0].nextAttemptAt!;

    act(() => connectivity.setState("offline"));
    act(() => connectivity.setState("online"));
    await flush();

    expect(failing.calls).toHaveLength(1); // not sent early
    expect(result.current.queue!.getSnapshot().items[0].nextAttemptAt).toBe(dueAt); // backoff untouched

    // It still goes once its own backoff ends, same key.
    await act(() => vi.advanceTimersByTimeAsync(dueAt - Date.now()));

    expect(failing.calls).toHaveLength(2);
    expect(failing.calls[1].clientRequestId).toBe(failing.calls[0].clientRequestId);
    expect(result.current.queue!.getSnapshot().items[0].state).toBe("synced");
  });

  it("on mount, sends a stored no-answer tap at once but keeps a stored 5xx tap's own backoff", async () => {
    const future = Date.now() + 30_000;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        items: [
          {
            id: "i-network",
            clientRequestId: "6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b",
            runId: RUN_ID,
            runDate: RUN_DATE,
            studentId: "dana",
            status: "PICKED_UP",
            occurredAt: "2026-11-09T05:00:00.000Z",
            createdAt: 0,
            attempts: 1,
            state: "error",
            lastError: { kind: "retryable", message: "Failed to fetch", network: true },
            nextAttemptAt: future,
          },
          {
            id: "i-5xx",
            clientRequestId: "7f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6c",
            runId: RUN_ID,
            runDate: RUN_DATE,
            studentId: "tarek",
            status: "PICKED_UP",
            occurredAt: "2026-11-09T05:00:00.000Z",
            createdAt: 1,
            attempts: 1,
            state: "error",
            lastError: { kind: "retryable", message: "Unavailable" },
            serverStatus: 503,
            nextAttemptAt: future,
          },
        ],
      }),
    );

    const { api } = await setUp({ keepMountCalls: true });

    // The network-waiting tap (dana) is sent on mount, before its stored backoff
    // would have elapsed; the 5xx tap (tarek) is left waiting for its own.
    expect(api.calls.map((call) => call.studentId)).toEqual(["dana"]);
  });
});
