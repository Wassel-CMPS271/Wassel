// useLivePolling (SCRUM-274) with fake timers, the runs API and /me mocked at the module boundary, and
// document.hidden replaced so the tests can hide and show the tab. Calls the tests hold open use deferred().

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { getRunLocations, getRunsDay, type RunLocation, type RunsDay } from "@/lib/api/runs";
import { me } from "@/lib/api/auth";
import { LOCATIONS_POLL_MS, RUNS_POLL_MS, useLivePolling } from "./useLivePolling";

vi.mock("@/lib/api/runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/runs")>()),
  getRunsDay: vi.fn(),
  getRunLocations: vi.fn(),
}));

vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/auth")>()),
  me: vi.fn(),
}));

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const runsDay = vi.mocked(getRunsDay);
const runLocations = vi.mocked(getRunLocations);
const meMock = vi.mocked(me);

function day(marker: string): RunsDay {
  return { date: "2026-11-16", dayType: "SCHOOL_DAY", runs: [{ id: marker } as RunsDay["runs"][number]] };
}

function locations(marker: string): RunLocation[] {
  return [{ runId: marker, status: "LIVE", position: null, remainingStops: 1, nextStop: null }];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let hidden = false;

function setHidden(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

// Lets resolved mocks' reactions run without moving the clock.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  runsDay.mockReset().mockResolvedValue(day("r0"));
  runLocations.mockReset().mockResolvedValue(locations("l0"));
  meMock.mockReset().mockResolvedValue({} as Awaited<ReturnType<typeof me>>);
  replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLivePolling: schedule", () => {
  it("reads both at once, then locations every 15 s and runs every 30 s", async () => {
    const { result } = renderHook(() => useLivePolling());
    await flush();
    expect(runsDay).toHaveBeenCalledTimes(1);
    expect(runsDay).toHaveBeenCalledWith();
    expect(runLocations).toHaveBeenCalledTimes(1);
    expect(result.current.runsDay).toEqual(day("r0"));
    expect(result.current.locations).toEqual(locations("l0"));
    expect(result.current.runsUpdatedAt).toBeInstanceOf(Date);
    expect(result.current.locationsUpdatedAt).toBeInstanceOf(Date);
    expect(result.current.error).toBeNull();

    await advance(LOCATIONS_POLL_MS);
    expect(runLocations).toHaveBeenCalledTimes(2);
    expect(runsDay).toHaveBeenCalledTimes(1);

    await advance(LOCATIONS_POLL_MS);
    expect(runLocations).toHaveBeenCalledTimes(3);
    expect(runsDay).toHaveBeenCalledTimes(2);

    await advance(RUNS_POLL_MS);
    expect(runLocations).toHaveBeenCalledTimes(5);
    expect(runsDay).toHaveBeenCalledTimes(3);
  });

  it("shows each new answer", async () => {
    const { result } = renderHook(() => useLivePolling());
    await flush();
    runLocations.mockResolvedValue(locations("l1"));
    await advance(LOCATIONS_POLL_MS);
    expect(result.current.locations).toEqual(locations("l1"));
  });

  it("clears its timers on unmount", async () => {
    const { unmount } = renderHook(() => useLivePolling());
    await flush();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(RUNS_POLL_MS * 4);
    expect(runsDay).toHaveBeenCalledTimes(1);
    expect(runLocations).toHaveBeenCalledTimes(1);
  });

  it("ignores an answer that arrives after unmount", async () => {
    const pending = deferred<RunsDay>();
    runsDay.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(() => useLivePolling());
    unmount();
    await act(async () => pending.resolve(day("late")));
    expect(result.current.runsDay).toBeNull();
  });

  it("stops listening for visibility changes on unmount", async () => {
    const { unmount } = renderHook(() => useLivePolling());
    await flush();
    unmount();
    setHidden(true);
    setHidden(false);
    await flush();
    expect(runsDay).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useLivePolling: hidden tab", () => {
  it("pauses while hidden, then reads both at once and resumes when visible", async () => {
    renderHook(() => useLivePolling());
    await flush();
    act(() => setHidden(true));
    expect(vi.getTimerCount()).toBe(0);
    await advance(RUNS_POLL_MS * 3);
    expect(runsDay).toHaveBeenCalledTimes(1);
    expect(runLocations).toHaveBeenCalledTimes(1);

    act(() => setHidden(false));
    await flush();
    expect(runsDay).toHaveBeenCalledTimes(2);
    expect(runLocations).toHaveBeenCalledTimes(2);

    // The timers restarted from the moment the tab came back.
    await advance(LOCATIONS_POLL_MS);
    expect(runLocations).toHaveBeenCalledTimes(3);
    expect(runsDay).toHaveBeenCalledTimes(2);
    await advance(LOCATIONS_POLL_MS);
    expect(runsDay).toHaveBeenCalledTimes(3);
  });

  it("opened in a background tab: loads once, no timers until shown", async () => {
    hidden = true;
    const { result } = renderHook(() => useLivePolling());
    await flush();
    expect(result.current.runsDay).toEqual(day("r0"));
    expect(vi.getTimerCount()).toBe(0);
    await advance(RUNS_POLL_MS * 2);
    expect(runsDay).toHaveBeenCalledTimes(1);
    act(() => setHidden(false));
    await flush();
    expect(runsDay).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(2);
  });

  it("coming back while a read is still in flight doesn't send a second one", async () => {
    const pending = deferred<RunLocation[]>();
    renderHook(() => useLivePolling());
    await flush();
    runLocations.mockReturnValueOnce(pending.promise);
    await advance(LOCATIONS_POLL_MS);
    expect(runLocations).toHaveBeenCalledTimes(2);
    act(() => setHidden(true));
    act(() => setHidden(false));
    await flush();
    expect(runLocations).toHaveBeenCalledTimes(2);
    expect(runsDay).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(locations("l1")));
  });
});

describe("useLivePolling: no overlap", () => {
  it("skips a tick while that read is in flight, and resumes after it answers", async () => {
    const slow = deferred<RunLocation[]>();
    runLocations.mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => useLivePolling());
    await flush();
    await advance(LOCATIONS_POLL_MS * 3);
    expect(runLocations).toHaveBeenCalledTimes(1);
    // The other read isn't held back by it.
    expect(runsDay).toHaveBeenCalledTimes(2);

    await act(async () => slow.resolve(locations("slow")));
    expect(result.current.locations).toEqual(locations("slow"));
    await advance(LOCATIONS_POLL_MS);
    expect(runLocations).toHaveBeenCalledTimes(2);
  });

  it("frees the slot even when the read throws synchronously", async () => {
    runLocations.mockImplementationOnce(() => {
      throw new TypeError("boom");
    });
    const { result } = renderHook(() => useLivePolling());
    await flush();
    expect(result.current.error).toEqual({ kind: "failed", sources: ["locations"] });
    await advance(LOCATIONS_POLL_MS);
    expect(runLocations).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });
});

describe("useLivePolling: failures", () => {
  it("a failed poll keeps the last good data, sets error and keeps polling; the next success clears it", async () => {
    const { result } = renderHook(() => useLivePolling());
    await flush();
    runLocations.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await advance(LOCATIONS_POLL_MS);
    expect(result.current.locations).toEqual(locations("l0"));
    expect(result.current.error).toEqual({ kind: "failed", sources: ["locations"] });
    const updatedAt = result.current.locationsUpdatedAt;

    runsDay.mockRejectedValueOnce(new ApiError(500));
    runLocations.mockRejectedValueOnce(new ApiError(503));
    await advance(LOCATIONS_POLL_MS);
    expect(result.current.runsDay).toEqual(day("r0"));
    expect(result.current.error).toEqual({ kind: "failed", sources: ["runs", "locations"] });
    expect(result.current.locationsUpdatedAt).toBe(updatedAt);

    runLocations.mockResolvedValue(locations("l2"));
    await advance(LOCATIONS_POLL_MS);
    expect(result.current.error).toEqual({ kind: "failed", sources: ["runs"] });
    expect(result.current.locations).toEqual(locations("l2"));
    await advance(LOCATIONS_POLL_MS);
    expect(result.current.error).toBeNull();
  });

  it("a failed first load leaves no data and an error; retry() reads both again now", async () => {
    runsDay.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    runLocations.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useLivePolling());
    await flush();
    expect(result.current.runsDay).toBeNull();
    expect(result.current.locations).toBeNull();
    expect(result.current.error).toEqual({ kind: "failed", sources: ["runs", "locations"] });

    act(() => result.current.retry());
    await flush();
    expect(runsDay).toHaveBeenCalledTimes(2);
    expect(runLocations).toHaveBeenCalledTimes(2);
    expect(result.current.runsDay).toEqual(day("r0"));
    expect(result.current.error).toBeNull();
    // Still one timer per read, not doubled by retry.
    expect(vi.getTimerCount()).toBe(2);
  });

  it("retry() doesn't overlap a read still in flight", async () => {
    const slow = deferred<RunsDay>();
    runsDay.mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => useLivePolling());
    act(() => result.current.retry());
    await flush();
    expect(runsDay).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve(day("r0")));
  });
});

describe("useLivePolling: 403", () => {
  it("stops polling and says forbidden; never sends the head to /login", async () => {
    const { result } = renderHook(() => useLivePolling());
    await flush();
    runLocations.mockRejectedValueOnce(new ApiError(403, "Access denied"));
    await advance(LOCATIONS_POLL_MS);
    expect(result.current.error).toEqual({ kind: "forbidden" });
    expect(result.current.locations).toEqual(locations("l0"));
    expect(vi.getTimerCount()).toBe(0);
    await advance(RUNS_POLL_MS * 3);
    expect(runLocations).toHaveBeenCalledTimes(2);
    expect(runsDay).toHaveBeenCalledTimes(1);
    expect(meMock).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("doesn't restart when the tab comes back", async () => {
    runsDay.mockRejectedValueOnce(new ApiError(403, "Access denied"));
    renderHook(() => useLivePolling());
    await flush();
    act(() => setHidden(true));
    act(() => setHidden(false));
    await advance(RUNS_POLL_MS * 2);
    expect(runsDay).toHaveBeenCalledTimes(1);
  });

  it("retry() restarts polling", async () => {
    runsDay.mockRejectedValueOnce(new ApiError(403, "Access denied"));
    const { result } = renderHook(() => useLivePolling());
    await flush();
    expect(result.current.error).toEqual({ kind: "forbidden" });
    act(() => result.current.retry());
    await flush();
    expect(result.current.error).toBeNull();
    await advance(RUNS_POLL_MS);
    expect(runsDay).toHaveBeenCalledTimes(3);
  });
});

describe("useLivePolling: 401", () => {
  it("stops polling, and once /me confirms it, goes to /login?expired=1", async () => {
    meMock.mockRejectedValue(new ApiError(401));
    const { result } = renderHook(() => useLivePolling());
    await flush();
    runLocations.mockRejectedValueOnce(new ApiError(401));
    await advance(LOCATIONS_POLL_MS);
    expect(meMock).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/login?expired=1");
    expect(result.current.error).toEqual({ kind: "expired" });
    expect(vi.getTimerCount()).toBe(0);
    await advance(RUNS_POLL_MS * 3);
    expect(runLocations).toHaveBeenCalledTimes(2);
    expect(runsDay).toHaveBeenCalledTimes(1);
  });

  it("retry() does nothing once the session is confirmed gone", async () => {
    meMock.mockRejectedValue(new ApiError(401));
    runsDay.mockRejectedValueOnce(new ApiError(401));
    const { result } = renderHook(() => useLivePolling());
    await flush();
    act(() => result.current.retry());
    await flush();
    expect(runsDay).toHaveBeenCalledTimes(1);
    expect(result.current.error).toEqual({ kind: "expired" });
  });

  it("two 401s at once ask /me once", async () => {
    let answer!: (error: unknown) => void;
    meMock.mockReturnValue(new Promise((_, reject) => (answer = reject)));
    runsDay.mockRejectedValueOnce(new ApiError(401));
    runLocations.mockRejectedValueOnce(new ApiError(401));
    renderHook(() => useLivePolling());
    await flush();
    expect(meMock).toHaveBeenCalledTimes(1);
    await act(async () => answer(new ApiError(401)));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("a stray 401 (/me says the session is fine) stays stopped, without redirecting, until retry()", async () => {
    runsDay.mockRejectedValueOnce(new ApiError(401));
    const { result } = renderHook(() => useLivePolling());
    await flush();
    expect(meMock).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    expect(result.current.error).toEqual({ kind: "unauthorized" });
    await advance(RUNS_POLL_MS * 2);
    expect(runsDay).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await flush();
    expect(result.current.error).toBeNull();
    expect(runsDay).toHaveBeenCalledTimes(2);
  });

  it("a 401 when /me can't answer (offline) stays stopped and never redirects", async () => {
    meMock.mockRejectedValue(new TypeError("Failed to fetch"));
    runsDay.mockRejectedValueOnce(new ApiError(401));
    const { result } = renderHook(() => useLivePolling());
    await flush();
    expect(result.current.error).toEqual({ kind: "unauthorized" });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("useLivePolling: refreshRuns", () => {
  it("reads /runs now and resolves with the new answer in place", async () => {
    const { result } = renderHook(() => useLivePolling());
    await flush();
    runsDay.mockResolvedValue(day("after"));
    await act(() => result.current.refreshRuns());
    expect(runsDay).toHaveBeenCalledTimes(2);
    expect(runLocations).toHaveBeenCalledTimes(1);
    expect(result.current.runsDay).toEqual(day("after"));
  });

  it("with a read in flight, waits for it and sends exactly one more, however many callers ask", async () => {
    const { result } = renderHook(() => useLivePolling());
    await flush();
    const inFlight = deferred<RunsDay>();
    runsDay.mockReturnValueOnce(inFlight.promise);
    await advance(RUNS_POLL_MS);
    expect(runsDay).toHaveBeenCalledTimes(2);

    runsDay.mockResolvedValue(day("fresh"));
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.refreshRuns();
      second = result.current.refreshRuns();
    });
    expect(runsDay).toHaveBeenCalledTimes(2);
    await act(async () => {
      inFlight.resolve(day("stale"));
      await first;
      await second;
    });
    expect(runsDay).toHaveBeenCalledTimes(3);
    expect(result.current.runsDay).toEqual(day("fresh"));
  });
});
