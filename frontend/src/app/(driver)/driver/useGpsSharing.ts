"use client";

// Turns the pure state machine in gpsState.ts into real browser calls (SCRUM-273):
// navigator.geolocation.watchPosition/clearWatch, navigator.permissions.query, and
// DriverGpsApi. Nothing is requested or sent until the driver calls optIn() — this is
// read at call time, not stored, so it's also the user gesture iOS Safari requires
// before it will prompt for location. With a null api (SCRUM-261 / PR #143 not yet
// merged) the state is always "unavailable" and nothing here touches the browser APIs at all.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { DriverGpsApi } from "@/lib/api/driverGps";
import { ApiError } from "@/lib/api/errors";
import type { Run } from "@/lib/api/runs";
import { reportIfNetwork, type Connectivity } from "@/lib/offline/connectivity";
import {
  initialGpsState,
  isAvailable,
  isGpsActive,
  nextGpsState,
  shouldSendFix,
  DEFAULT_MIN_SEND_DISTANCE_METERS,
  DEFAULT_MIN_SEND_GAP_MS,
  DEFAULT_MIN_SEND_INTERVAL_MS,
  type GpsFix,
  type GpsState,
} from "./gpsState";

export interface UseGpsSharingOptions {
  run: Run;
  api: DriverGpsApi | null;
  connectivity: Connectivity;
  // Called with the Run every successful setSharing() resolves with, so the page can
  // swap it into the day without a separate refetch (the response is already the
  // server's current truth for this run, including state and locationSharing).
  onRunChange: (run: Run) => void;
  // Called when the server refused sharing (a 409 or 404 on opt-in or on a send), so
  // the page refetches the day and learns the run's real state: a refusal comes
  // with no Run, so onRunChange never hears about it.
  onRefreshRequested: () => void;
}

export interface UseGpsSharingResult {
  state: GpsState;
  // Call only from a tap: this is the explicit opt-in, and on iOS it's also the user
  // gesture the browser requires before it will prompt for location.
  optIn: () => void;
  optOut: () => void;
  // From "denied" (after the driver changes the browser setting), "error", or a
  // "refused" pause.
  retry: () => void;
}

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 20_000,
};

const THROTTLE = {
  minIntervalMs: DEFAULT_MIN_SEND_INTERVAL_MS,
  minDistanceMeters: DEFAULT_MIN_SEND_DISTANCE_METERS,
  minGapMs: DEFAULT_MIN_SEND_GAP_MS,
};

// setSharing(true) failures in a row (network or 5xx) before the card shows an error
// instead of retrying on its own.
const MAX_OPT_IN_ATTEMPTS = 3;

// A fix cached during a soft pause (offline/hidden) that's already at least this old
// once sending resumes no longer says where the bus is now — the pause itself can
// last anywhere from seconds to a long while. It's dropped rather than sent, and the
// hook waits for a fresh fix instead, same as a brand new opt-in.
const MAX_RESUME_FIX_AGE_MS = 2 * 60 * 1000;

// The contract's accuracy range is 0-10000 (docs/contracts/runs.md); a fix outside
// that, or with a non-finite coordinate, is dropped here rather than sent and
// rejected as an ApiValidationError.
const MAX_ACCURACY_METERS = 10_000;

function isSendableFix(fix: GpsFix): boolean {
  return (
    Number.isFinite(fix.latitude) &&
    Number.isFinite(fix.longitude) &&
    Number.isFinite(fix.accuracyMeters) &&
    fix.accuracyMeters >= 0 &&
    fix.accuracyMeters <= MAX_ACCURACY_METERS
  );
}

// A 409 (not IN_PROGRESS, or sharing off for the run) or a 404: the server refuses
// sharing for this run right now. The detail text is never parsed to tell them apart.
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404);
}

function computeAvailable(api: DriverGpsApi | null): boolean {
  return isAvailable({
    hasApi: api !== null,
    hasGeolocation: typeof navigator !== "undefined" && navigator.geolocation !== undefined,
    secureContext: typeof window !== "undefined" && window.isSecureContext === true,
  });
}

export function useGpsSharing({
  run,
  api,
  connectivity,
  onRunChange,
  onRefreshRequested,
}: UseGpsSharingOptions): UseGpsSharingResult {
  const [state, dispatch] = useReducer(nextGpsState, undefined, () =>
    initialGpsState(computeAvailable(api)),
  );

  // Mirrors the latest state/run/api/callbacks into refs so long-lived callbacks
  // (watchPosition, permissions.query's onchange, the setSharing effect below) always
  // act on the current values instead of the ones captured when they were registered
  // — the callbacks in particular, since the caller passes fresh functions every
  // render and they must never be dependencies of the effect that opens/closes the watch.
  const stateRef = useRef(state);
  stateRef.current = state;
  const runRef = useRef(run);
  runRef.current = run;
  const apiRef = useRef(api);
  apiRef.current = api;
  const onRunChangeRef = useRef(onRunChange);
  onRunChangeRef.current = onRunChange;
  const onRefreshRequestedRef = useRef(onRefreshRequested);
  onRefreshRequestedRef.current = onRefreshRequested;
  // Set only by a sendPosition 409/404 (see sendFix below), and consumed once by the
  // very next teardown: that's the one case where the hook doesn't yet know whether
  // the refusal is "run not IN_PROGRESS" or "sharing withdrawn while still
  // IN_PROGRESS", and setSharing(false)'s own response settles it. Every other
  // teardown (opting out, the run naturally leaving IN_PROGRESS, switching runs,
  // unmounting, a permission/position error) leaves this false and skips the check —
  // their cause is already known, so there's nothing to infer from that response.
  const pendingWithdrawalCheckRef = useRef(false);

  // True once teardown has started, so a watchPosition callback already in flight
  // when sharing stops can't still dispatch or send — "never send a stale position
  // after stopping".
  const activeRef = useRef(false);
  // Bumped every time sharing becomes active, so a send that answers after a
  // teardown (and maybe a fresh opt-in) can tell it belongs to an older session.
  const sessionRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  // serverOnRef: setSharing(true) has been asked for and not answered with a failure,
  // so teardown owes the server a setSharing(false). serverConfirmedRef: it answered
  // with success — positions are only sent after that.
  const serverOnRef = useRef(false);
  const serverConfirmedRef = useRef(false);
  const optInFailuresRef = useRef(0);
  const sendingRef = useRef(false);
  // setSharing calls run one after another, never side by side, so a true can never
  // reach the server after a later false. The tail settles (never rejects) once the
  // last queued call has; null when nothing is queued, so the first call goes out at
  // once. The sequence number tells each answer whether a newer call replaced it.
  const sharingTailRef = useRef<Promise<void> | null>(null);
  const sharingSeqRef = useRef(0);
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
    optInFailuresRef.current = 0;
    dispatch({ type: "reset", available: availableRef.current });
  }

  const setSharingInOrder = useCallback((currentApi: DriverGpsApi, runId: string, enabled: boolean) => {
    const seq = ++sharingSeqRef.current;
    const send = () => currentApi.setSharing(runId, { enabled });
    const previous = sharingTailRef.current;
    const result = previous ? previous.then(send) : send();
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    sharingTailRef.current = tail;
    void tail.then(() => {
      if (sharingTailRef.current === tail) sharingTailRef.current = null;
    });
    return { result, isLatest: () => sharingSeqRef.current === seq };
  }, []);

  const sendFix = useCallback(
    async (fix: GpsFix, { force = false }: { force?: boolean } = {}) => {
      const currentApi = apiRef.current;
      if (!currentApi || !activeRef.current) return;
      if (!isSendableFix(fix)) return;
      // Not before the server has confirmed the opt-in: the fix stays in lastFixRef
      // and goes out once it has (see requestSharingOn).
      if (!serverConfirmedRef.current) return;
      // One send at a time; a fix arriving meanwhile is skipped, not queued.
      if (sendingRef.current) return;
      // force (resuming from a soft pause) skips the throttle, minimum gap included:
      // it's one cached fix sent on a state change, not a stream of them.
      if (!force && !shouldSendFix(lastSentRef.current, fix, THROTTLE)) return;
      const session = sessionRef.current;
      // Marked as sent before the call resolves, so a fix that arrives while this one
      // is in flight is throttled against it rather than queued behind it.
      lastSentRef.current = fix;
      sendingRef.current = true;
      try {
        await currentApi.sendPosition(runRef.current.id, {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyMeters: fix.accuracyMeters,
        });
        connectivity.reportSuccess();
      } catch (error) {
        // Any answer from the server (a 400, 403, 409, 5xx...) means it was reached;
        // only a network failure or a timeout counts against the connection.
        reportIfNetwork(connectivity, error);
        // Refused: stop now. The teardown this triggers finds out from
        // setSharing(false)'s own response whether the run is still IN_PROGRESS, and
        // never opts back in on its own either way. A late answer from an older
        // session says nothing about the current one.
        if (isRefusal(error) && activeRef.current && sessionRef.current === session) {
          pendingWithdrawalCheckRef.current = true;
          dispatch({ type: "sendConflict" });
          onRefreshRequestedRef.current();
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [connectivity],
  );

  const requestSharingOn = useCallback(
    (currentApi: DriverGpsApi, runId: string) => {
      serverOnRef.current = true;
      serverConfirmedRef.current = false;
      const { result, isLatest } = setSharingInOrder(currentApi, runId, true);
      result.then(
        (updatedRun) => {
          if (!isLatest()) return;
          serverConfirmedRef.current = true;
          optInFailuresRef.current = 0;
          connectivity.reportSuccess();
          onRunChangeRef.current(updatedRun);
          // A fix that arrived while waiting for this answer was held back, not
          // dropped: send it now.
          const fix = lastFixRef.current;
          if (fix && fix !== lastSentRef.current && stateRef.current.status === "sharing") {
            void sendFix(fix, { force: true });
          }
        },
        (error) => {
          // Replaced by a newer call (an opt-out, or a newer opt-in): whatever that
          // one set, this answer mustn't undo.
          if (!isLatest()) return;
          // Before clearing serverOnRef: reporting can wake the retry listener below
          // synchronously, and it must not fire another opt-in from in here.
          reportIfNetwork(connectivity, error);
          serverOnRef.current = false;
          if (isRefusal(error)) {
            // Never retried on its own: the driver taps to try again.
            dispatch({ type: "sendConflict" });
            onRefreshRequestedRef.current();
            return;
          }
          // Network or 5xx: still opted in, the watch stays up and fixes are held
          // back. The retry listener below asks again once the connection is back,
          // until this has failed MAX_OPT_IN_ATTEMPTS times in a row.
          optInFailuresRef.current += 1;
          if (optInFailuresRef.current >= MAX_OPT_IN_ATTEMPTS) dispatch({ type: "sharingFailed" });
        },
      );
    },
    [connectivity, sendFix, setSharingInOrder],
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
      sessionRef.current += 1;
      if (!serverOnRef.current && currentApi) requestSharingOn(currentApi, run.id);
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
      const checkWithdrawal = pendingWithdrawalCheckRef.current;
      pendingWithdrawalCheckRef.current = false;
      serverConfirmedRef.current = false;
      if (serverOnRef.current && currentApi) {
        serverOnRef.current = false;
        const { result, isLatest } = setSharingInOrder(currentApi, run.id, false);
        result.then(
          (updatedRun) => {
            if (!isLatest()) return;
            onRunChangeRef.current(updatedRun);
            // Still IN_PROGRESS but the server says sharing is off for it: consent
            // was withdrawn out from under this hook (by the driver elsewhere, by
            // another driver, or by a reassignment), not just paused — the driver
            // has to opt in again rather than being resumed automatically.
            if (checkWithdrawal && updatedRun.state === "IN_PROGRESS" && !updatedRun.locationSharing) {
              dispatch({ type: "sharingWithdrawn" });
            }
          },
          (error) => {
            if (isLatest()) reportIfNetwork(connectivity, error);
          },
        );
      }
    };
    // isGpsActive(state) is the real dependency (see above); state itself isn't
    // listed so a status change that doesn't flip it (requesting -> sharing, or
    // between the two soft-pause reasons) never re-runs this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGpsActive(state), api, run.id, connectivity, sendFix, requestSharingOn, setSharingInOrder]);

  // An opt-in that failed with a network error or a 5xx leaves sharing active but
  // unconfirmed (serverOnRef false): ask again whenever the connection may be back —
  // a connectivity change or its retry tick — but not while it's known offline.
  // A refusal isn't retried here: it leaves sharing inactive.
  useEffect(() => {
    function retryOptIn() {
      const currentApi = apiRef.current;
      if (!currentApi || !activeRef.current || serverOnRef.current) return;
      if (connectivity.getState() === "offline") return;
      requestSharingOn(currentApi, runRef.current.id);
    }
    const offRetry = connectivity.onRetry(retryOptIn);
    const unsubscribe = connectivity.subscribe(retryOptIn);
    return () => {
      offRetry();
      unsubscribe();
    };
  }, [connectivity, requestSharingOn]);

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
    if (state.status !== "requesting" || !fix || fix === lastSentRef.current) return;
    if (Date.now() - fix.at >= MAX_RESUME_FIX_AGE_MS) {
      // Too stale to send as "now": drop it and wait for a fresh fix, rather than
      // report a position from minutes ago as current.
      lastFixRef.current = null;
      return;
    }
    dispatch({ type: "positionReceived" });
    void sendFix(fix, { force: true });
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

  // A tap starts over: whatever failed before, this is the driver asking again.
  const optIn = useCallback(() => {
    optInFailuresRef.current = 0;
    dispatch({ type: "optIn" });
  }, []);
  const optOut = useCallback(() => dispatch({ type: "optOut" }), []);
  const retry = useCallback(() => {
    optInFailuresRef.current = 0;
    dispatch({ type: "retry" });
  }, []);

  return { state, optIn, optOut, retry };
}
