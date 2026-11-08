"use client";

// Turns the pure state machine in gpsState.ts into real browser calls (SCRUM-273):
// navigator.geolocation.watchPosition/clearWatch, navigator.permissions.query, and
// DriverGpsApi. Nothing is requested or sent until the driver calls optIn() — this is
// read at call time, not stored, so it's also the user gesture iOS Safari requires
// before it will prompt for location. With a null api (SCRUM-261 not merged) the
// state is always "unavailable" and nothing here touches the browser APIs at all.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { DriverGpsApi } from "@/lib/api/driverGps";
import { ApiError } from "@/lib/api/errors";
import type { Run } from "@/lib/api/runs";
import type { Connectivity } from "@/lib/offline/connectivity";
import {
  initialGpsState,
  isAvailable,
  isGpsActive,
  nextGpsState,
  shouldSendFix,
  DEFAULT_MIN_SEND_DISTANCE_METERS,
  DEFAULT_MIN_SEND_INTERVAL_MS,
  type GpsFix,
  type GpsState,
} from "./gpsState";

export interface UseGpsSharingOptions {
  run: Run;
  api: DriverGpsApi | null;
  connectivity: Connectivity;
}

export interface UseGpsSharingResult {
  state: GpsState;
  // Call only from a tap: this is the explicit opt-in, and on iOS it's also the user
  // gesture the browser requires before it will prompt for location.
  optIn: () => void;
  optOut: () => void;
  // From "denied" (after the driver changes the browser setting) or "error".
  retry: () => void;
}

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 20_000,
};

function computeAvailable(api: DriverGpsApi | null): boolean {
  return isAvailable({
    hasApi: api !== null,
    hasGeolocation: typeof navigator !== "undefined" && navigator.geolocation !== undefined,
    secureContext: typeof window !== "undefined" && window.isSecureContext === true,
  });
}

export function useGpsSharing({ run, api, connectivity }: UseGpsSharingOptions): UseGpsSharingResult {
  const [state, dispatch] = useReducer(nextGpsState, undefined, () =>
    initialGpsState(computeAvailable(api)),
  );

  // Mirrors the latest state/run/api into refs so long-lived callbacks (watchPosition,
  // permissions.query's onchange) always act on the current values instead of the
  // ones captured when they were registered.
  const stateRef = useRef(state);
  stateRef.current = state;
  const runRef = useRef(run);
  runRef.current = run;
  const apiRef = useRef(api);
  apiRef.current = api;

  // True once teardown has started, so a watchPosition callback already in flight
  // when sharing stops can't still dispatch or send — "never send a stale position
  // after stopping".
  const activeRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const serverOnRef = useRef(false);
  // The latest fix seen and the latest one actually sent, so a soft pause (offline or
  // hidden) can cache one fix and send only that, once, on resuming — never a backlog.
  const lastFixRef = useRef<GpsFix | null>(null);
  const lastSentRef = useRef<GpsFix | null>(null);

  const availableRef = useRef(computeAvailable(api));

  // Sharing never carries over between runs (docs/contracts/driver-gps-offline.md,
  // "consent scope"), and SCRUM-261 landing can turn `api` from null into a real
  // client while the page is open — both reset to "off"/"unavailable". This adjusts
  // state *during* render rather than in an effect (React's own pattern for
  // resetting state when a prop changes): dispatching here discards this render and
  // starts over with `state` already reset, so the watch/sharing effect below never
  // sees the new run.id (or new availability) paired with the *old* status. It did
  // when this was a useEffect: switching runs while sharing briefly turned sharing on
  // for the new run (with the old "sharing" status still in scope) before the reset
  // took effect and immediately turned it off again.
  const [trackedRunId, setTrackedRunId] = useState(run.id);
  const [trackedApi, setTrackedApi] = useState(api);
  if (run.id !== trackedRunId || api !== trackedApi) {
    setTrackedRunId(run.id);
    setTrackedApi(api);
    availableRef.current = computeAvailable(api);
    dispatch({ type: "reset", available: availableRef.current });
  }

  const sendFix = useCallback(
    async (fix: GpsFix, { force = false }: { force?: boolean } = {}) => {
      const currentApi = apiRef.current;
      if (!currentApi) return;
      if (!force && !shouldSendFix(lastSentRef.current, fix, {
        minIntervalMs: DEFAULT_MIN_SEND_INTERVAL_MS,
        minDistanceMeters: DEFAULT_MIN_SEND_DISTANCE_METERS,
      })) {
        return;
      }
      if (!activeRef.current) return;
      // Marked as sent before the call resolves, so a fix that arrives while this one
      // is in flight is throttled against it rather than queued behind it.
      lastSentRef.current = fix;
      try {
        await currentApi.sendPosition(runRef.current.id, {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyMeters: fix.accuracyMeters,
          recordedAt: new Date(fix.at).toISOString(),
        });
        connectivity.reportSuccess();
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          dispatch({ type: "sendConflict" });
          return;
        }
        connectivity.reportFailure();
      }
    },
    [connectivity],
  );

  // Starts/stops watchPosition and tells the server, based only on isGpsActive — not
  // on the raw status — so moving between "requesting" -> "sharing" or "sharing" ->
  // a soft "paused" (both still active) doesn't tear anything down. run.id and api
  // changing does tear down (for the run/api that was active) and set up again.
  useEffect(() => {
    const active = isGpsActive(state);
    activeRef.current = active;
    const currentApi = apiRef.current;

    if (active) {
      if (!serverOnRef.current && currentApi) {
        serverOnRef.current = true;
        currentApi.setSharing(run.id, { enabled: true }).catch(() => {
          serverOnRef.current = false; // Retried next time this effect runs.
        });
      }
      if (watchIdRef.current === null && navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            if (!activeRef.current) return;
            const fix: GpsFix = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyMeters: position.coords.accuracy,
              at: position.timestamp,
            };
            lastFixRef.current = fix;
            // Read before dispatching, not after: dispatch() doesn't update this
            // synchronously, so checking stateRef.current afterwards would still see
            // the pre-dispatch value and this fix would never be sent.
            const status = stateRef.current.status;
            if (status === "requesting") {
              dispatch({ type: "positionReceived" });
              void sendFix(fix); // The first fix of this session: always sent.
            } else if (status === "sharing") {
              void sendFix(fix);
            }
            // status === "paused" (a soft pause): cached above, not sent — the
            // "resume" effect below sends it once the pause clears.
          },
          (error) => {
            if (!activeRef.current) return;
            dispatch(
              error.code === 1 ? { type: "permissionDenied" } : { type: "positionError", code: error.code as 2 | 3 },
            );
          },
          POSITION_OPTIONS,
        );
      }
    }

    return () => {
      activeRef.current = false;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      lastFixRef.current = null;
      if (serverOnRef.current && currentApi) {
        serverOnRef.current = false;
        void currentApi.setSharing(run.id, { enabled: false }).catch(() => {});
      }
    };
    // isGpsActive(state) is the real dependency (see above); state itself isn't
    // listed so a status change that doesn't flip it (requesting -> sharing, or
    // between the two soft-pause reasons) never re-runs this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGpsActive(state), api, run.id, sendFix]);

  // Resuming from a soft pause (status goes back to "requesting") doesn't wait for
  // the next natural fix, which might be a while coming since the watch never
  // stopped: if one was cached while paused, it's treated as having just arrived —
  // sent at once, bypassing the throttle, and only that one, never a backlog
  // (SCRUM-273's "positions are not queued offline" decision). A fresh opt-in also
  // reaches "requesting", but with nothing cached yet, so this does nothing then and
  // the first real fix is awaited normally.
  useEffect(() => {
    const fix = lastFixRef.current;
    // lastFixRef isn't cleared on a soft pause (there's nothing wrong with the fix
    // sent just before it), so this also guards against resending that same one
    // again on resuming when nothing new arrived while paused.
    if (state.status === "requesting" && fix && fix !== lastSentRef.current) {
      dispatch({ type: "positionReceived" });
      void sendFix(fix, { force: true });
    }
  }, [state.status, sendFix]);

  // navigator.permissions is optional (missing on Safari as of this writing): without
  // it, a revoked permission only surfaces through watchPosition's own error.
  useEffect(() => {
    if (!availableRef.current || typeof navigator.permissions?.query !== "function") return;
    let cancelled = false;
    let status: PermissionStatus | undefined;

    function onChange() {
      if (!status) return;
      if (status.state === "denied") dispatch({ type: "permissionDenied" });
      else if (status.state === "granted") dispatch({ type: "permissionGranted" });
    }

    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return;
        status = result;
        status.addEventListener("change", onChange);
        onChange(); // Catches a permission already revoked before the driver retries.
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  }, [api]);

  // Recomputes the combined offline/hidden/run-state condition whenever any of the
  // three can change, and always sends the full current truth (see gpsState.ts's
  // "conditions" event) rather than a delta.
  useEffect(() => {
    if (!availableRef.current) return;

    function recompute() {
      const notInProgress = runRef.current.state !== "IN_PROGRESS";
      const offline = connectivity.getState() === "offline";
      const hidden = document.visibilityState === "hidden";
      dispatch({
        type: "conditions",
        blocked: notInProgress || offline || hidden,
        reason: notInProgress ? "runNotInProgress" : offline ? "offline" : hidden ? "hidden" : undefined,
      });
    }

    recompute();
    const unsubscribe = connectivity.subscribe(recompute);
    document.addEventListener("visibilitychange", recompute);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", recompute);
    };
  }, [connectivity, run.state]);

  const optIn = useCallback(() => dispatch({ type: "optIn" }), []);
  const optOut = useCallback(() => dispatch({ type: "optOut" }), []);
  const retry = useCallback(() => dispatch({ type: "retry" }), []);

  return { state, optIn, optOut, retry };
}
