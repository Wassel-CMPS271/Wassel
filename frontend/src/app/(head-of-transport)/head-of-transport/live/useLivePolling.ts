"use client";

// Polls the live control screen's two reads (SCRUM-274): GET /runs/locations every 15 s (freshness,
// progress, ETA; the driver sends a fix about every 10 s and LIVE lasts 60 s) and GET /runs every 30 s
// (state, driver, counts, locationSharing).
//
// - Each read has its own timer and never overlaps itself: a tick that finds its request still in flight
//   is skipped.
// - Hidden tab: both timers stop; back to visible, both reads go out at once and the timers restart.
// - A failed poll keeps the last good data and sets `error` ("failed"); polling goes on, and the next
//   success clears it. `retry()` reads both now.
// - 403: polling stops ("forbidden"). 401: polling stops, then /me says whether the session is really gone,
//   as the driver page does (SCRUM-273): /me 401 sends the head to /login?expired=1; /me answering
//   anything else leaves polling stopped ("unauthorized") until `retry()`, so a stray 401 can't loop.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { me } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { getRunLocations, getRunsDay, type RunLocation, type RunsDay } from "@/lib/api/runs";

export const LOCATIONS_POLL_MS = 15_000;
export const RUNS_POLL_MS = 30_000;

type Source = "runs" | "locations";

const INTERVALS: Record<Source, number> = { runs: RUNS_POLL_MS, locations: LOCATIONS_POLL_MS };
const SOURCES: readonly Source[] = ["runs", "locations"];

// "failed": a poll failed (network, 5xx, ...); last good data kept, still polling.
// "forbidden": a 403; polling stopped. "unauthorized": a 401 that /me didn't confirm (it said the session
// is fine, or couldn't answer); polling stopped until retry(). "expired": /me confirmed the 401; the page
// is on its way to /login?expired=1.
export type LivePollingError =
  | { kind: "failed"; sources: Source[] }
  | { kind: "forbidden" }
  | { kind: "unauthorized" }
  | { kind: "expired" };

type StopReason = "forbidden" | "unauthorized" | "expired";

export interface LivePolling {
  // Null until the first successful read of each.
  runsDay: RunsDay | null;
  locations: RunLocation[] | null;
  // When each was last read successfully (client clock, for "Showing data from HH:mm:ss" only).
  runsUpdatedAt: Date | null;
  locationsUpdatedAt: Date | null;
  error: LivePollingError | null;
  // Reads both now and restarts polling after a 403 or an unconfirmed 401. Does nothing once expired.
  retry: () => void;
  // Reads /runs now (after a reassignment). If a read is in flight it may predate the change, so one more
  // follows it; resolves when the fresh one has answered (or failed).
  refreshRuns: () => Promise<void>;
}

export function useLivePolling(): LivePolling {
  const router = useRouter();
  // In a ref so the polling effect never re-runs when the router object changes.
  const routerRef = useRef(router);
  routerRef.current = router;

  const [runsDay, setRunsDay] = useState<RunsDay | null>(null);
  const [locations, setLocations] = useState<RunLocation[] | null>(null);
  const [runsUpdatedAt, setRunsUpdatedAt] = useState<Date | null>(null);
  const [locationsUpdatedAt, setLocationsUpdatedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState<Record<Source, boolean>>({ runs: false, locations: false });
  const [stopReason, setStopReason] = useState<StopReason | null>(null);

  const mounted = useRef(false);
  const stopped = useRef(false);
  const checkingSession = useRef(false);
  const inFlight = useRef<Record<Source, Promise<void> | null>>({ runs: null, locations: null });
  const followUp = useRef<Record<Source, Promise<void> | null>>({ runs: null, locations: null });
  const timers = useRef<Record<Source, ReturnType<typeof setInterval> | null>>({ runs: null, locations: null });

  const clearTimers = useCallback(() => {
    for (const source of SOURCES) {
      const timer = timers.current[source];
      if (timer !== null) clearInterval(timer);
      timers.current[source] = null;
    }
  }, []);

  const stop = useCallback(
    (reason: StopReason) => {
      stopped.current = true;
      clearTimers();
      setStopReason(reason);
    },
    [clearTimers],
  );

  // The driver page's check (SCRUM-273): only /me can say whether a 401 means the session is gone.
  const checkSession = useCallback(() => {
    if (checkingSession.current) return;
    checkingSession.current = true;
    me().then(
      () => {
        checkingSession.current = false;
      },
      (error) => {
        checkingSession.current = false;
        if (mounted.current && error instanceof ApiError && error.status === 401) setStopReason("expired");
      },
    );
  }, []);

  const read = useCallback(
    (source: Source): Promise<void> => {
      if (stopped.current) return Promise.resolve();
      const running = inFlight.current[source];
      if (running) return running; // never overlap: this tick is skipped
      const load = async () => {
        try {
          if (source === "runs") {
            const day = await getRunsDay();
            if (!mounted.current) return;
            setRunsDay(day);
            setRunsUpdatedAt(new Date());
          } else {
            const result = await getRunLocations();
            if (!mounted.current) return;
            setLocations(result);
            setLocationsUpdatedAt(new Date());
          }
          setFailed((current) => (current[source] ? { ...current, [source]: false } : current));
        } catch (error) {
          if (!mounted.current) return;
          if (error instanceof ApiError && error.status === 403) {
            stop("forbidden");
          } else if (error instanceof ApiError && error.status === 401) {
            stop("unauthorized");
            checkSession();
          } else {
            setFailed((current) => (current[source] ? current : { ...current, [source]: true }));
          }
        }
      };
      // .finally runs as a later reaction, so the slot is always set before it is cleared.
      const request = load().finally(() => {
        inFlight.current[source] = null;
      });
      inFlight.current[source] = request;
      return request;
    },
    [checkSession, stop],
  );

  const startTimers = useCallback(() => {
    clearTimers();
    for (const source of SOURCES) {
      timers.current[source] = setInterval(() => void read(source), INTERVALS[source]);
    }
  }, [clearTimers, read]);

  useEffect(() => {
    mounted.current = true;
    // The first read goes out even in a background tab, so the screen has data when it's shown.
    void read("runs");
    void read("locations");
    if (!document.hidden) startTimers();

    function onVisibilityChange() {
      if (document.hidden) {
        clearTimers();
      } else if (!stopped.current) {
        void read("runs");
        void read("locations");
        startTimers();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimers();
    };
  }, [clearTimers, read, startTimers]);

  useEffect(() => {
    if (stopReason === "expired") routerRef.current.replace("/login?expired=1");
  }, [stopReason]);

  const retry = useCallback(() => {
    if (stopReason === "expired") return;
    stopped.current = false;
    setStopReason(null);
    void read("runs");
    void read("locations");
    if (!document.hidden) startTimers();
  }, [read, startTimers, stopReason]);

  const refreshRuns = useCallback((): Promise<void> => {
    const running = inFlight.current.runs;
    if (!running) return read("runs");
    // One follow-up, however many callers ask while that read is in flight.
    followUp.current.runs ??= running.then(() => {
      followUp.current.runs = null;
      return read("runs");
    });
    return followUp.current.runs;
  }, [read]);

  let error: LivePollingError | null = null;
  if (stopReason) {
    error = { kind: stopReason };
  } else if (failed.runs || failed.locations) {
    error = { kind: "failed", sources: SOURCES.filter((source) => failed[source]) };
  }

  return { runsDay, locations, runsUpdatedAt, locationsUpdatedAt, error, retry, refreshRuns };
}
