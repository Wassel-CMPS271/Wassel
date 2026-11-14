// The driver GPS consent state machine (SCRUM-273), kept pure and framework-free so
// every transition can be tested without a browser. useGpsSharing.ts wires it to
// navigator.geolocation, navigator.permissions and the run prop.
//
// States:
//   unavailable  no DriverGpsApi (SCRUM-261 / PR #143 not yet merged), no navigator.geolocation, or
//                not a secure context. Permanent for the hook's lifetime.
//   off          available, but the driver hasn't opted in (or opted back out).
//   requesting   opted in, waiting for the browser's permission prompt and first fix.
//   sharing      a fix has arrived and positions are being sent.
//   denied       the browser (or the driver, in its settings) refused location.
//   error        watchPosition failed for a reason that isn't permission
//                (POSITION_UNAVAILABLE = 2, TIMEOUT = 3), or the server never confirmed
//                the opt-in after several tries (errorCode "server").
//   paused       consent is on, but blocked right now: offline, the tab is hidden, the
//                run isn't IN_PROGRESS, or the server refused sharing (a 409 or 404).
//                See isGpsActive for what each reason means for the hook (soft pause
//                vs. a real stop).
//
// "paused" with blockedReason "runNotInProgress" or "refused" is a real stop: the hook
// clears the watch and tells the server. "refused" is also sticky: no "conditions"
// event clears it, only a run change (reset) or the driver tapping (optIn/retry),
// because the server, not this phone, said no. "offline" and "hidden" are soft: the
// watch stays up (so there's a fresh fix ready) but nothing is sent until they clear,
// and only that one latest fix is sent then — never a backlog.

export type GpsStatus = "unavailable" | "off" | "requesting" | "sharing" | "denied" | "error" | "paused";

export type GpsBlockReason = "offline" | "hidden" | "runNotInProgress" | "refused";

// GeolocationPositionError's codes: PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT,
// plus "server": setSharing(true) kept failing (network or 5xx), so sharing never
// actually turned on.
export type GpsErrorCode = 1 | 2 | 3 | "server";

// The offline/hidden/run-state picture from the last "conditions" event.
export interface GpsCondition {
  blocked: boolean;
  reason?: GpsBlockReason;
}

export interface GpsState {
  status: GpsStatus;
  // Whether the driver has tapped to turn sharing on. Kept distinct from `status` so
  // a pause or an error doesn't lose it: "paused" and "denied" both mean the driver
  // still wants sharing on, once whatever is stopping it clears.
  consent: boolean;
  // Tracked even while off/denied/error/unavailable, so opting in (or retrying) can
  // land straight on "paused" without waiting for a fresh condition check.
  blocked: boolean;
  blockedReason?: GpsBlockReason;
  errorCode?: GpsErrorCode;
  // Only while paused as "refused": the conditions that blocked/blockedReason would
  // otherwise hold, kept up to date so a tap can land on the right state.
  heldCondition?: GpsCondition;
}

export type GpsEvent =
  // available reflects the current environment (api, geolocation, secure context):
  // true goes to "off", false to "unavailable". Used for the very first state and
  // whenever the run changes (SCRUM-273: sharing never carries over between runs).
  | { type: "reset"; available: boolean }
  | { type: "optIn" }
  | { type: "optOut" }
  | { type: "retry" }
  | { type: "permissionGranted" }
  | { type: "permissionDenied" }
  | { type: "positionReceived" }
  | { type: "positionError"; code: 2 | 3 }
  // The current combined truth of offline/hidden/run-state, recomputed by the hook
  // whenever any of the three changes (not a delta: always the full picture, so two
  // reasons being true at once can't make one clearing look like full unblocking).
  | { type: "conditions"; blocked: boolean; reason?: GpsBlockReason }
  // A 409 or 404 from setSharing(true) or sendPosition: the server disagrees that this
  // run is shareable right now (docs/contracts/driver-gps-offline.md). Pauses as
  // "refused", which nothing but a reset or a driver tap clears.
  | { type: "sendConflict" }
  // After a refused send, setSharing(false)'s answer says the run is still
  // IN_PROGRESS: sharing itself was withdrawn — by the driver elsewhere, by another
  // driver's consent, or by a reassignment. This drops consent: the driver gave it,
  // so only the driver taps "Share my location" again.
  | { type: "sharingWithdrawn" }
  // setSharing(true) failed (network or 5xx) too many times in a row.
  | { type: "sharingFailed" };

function offState(blocked = false, blockedReason?: GpsBlockReason): GpsState {
  return { status: "off", consent: false, blocked, blockedReason };
}

function isRefused(state: GpsState): boolean {
  return state.status === "paused" && state.blockedReason === "refused";
}

// The real offline/hidden/run-state picture, wherever the state keeps it.
function conditionOf(state: GpsState): GpsCondition {
  if (isRefused(state)) return state.heldCondition ?? { blocked: false };
  return { blocked: state.blocked, reason: state.blockedReason };
}

export function initialGpsState(available: boolean): GpsState {
  return available ? offState() : { status: "unavailable", consent: false, blocked: false };
}

export function nextGpsState(state: GpsState, event: GpsEvent): GpsState {
  if (state.status === "unavailable") {
    return event.type === "reset" ? initialGpsState(event.available) : state;
  }

  switch (event.type) {
    case "reset":
      return initialGpsState(event.available);

    case "optIn":
    case "retry": {
      // Already on (or on its way): nothing to do. From off/denied/error, or a
      // "refused" pause (the driver tapping is what clears it), start the flow —
      // straight to "paused" if a condition is already blocking it.
      if (
        state.status === "requesting" ||
        state.status === "sharing" ||
        (state.status === "paused" && !isRefused(state))
      ) {
        return state;
      }
      const { blocked, reason } = conditionOf(state);
      return { status: blocked ? "paused" : "requesting", consent: true, blocked, blockedReason: reason };
    }

    case "optOut": {
      const { blocked, reason } = conditionOf(state);
      return offState(blocked, reason);
    }

    case "permissionGranted":
      // Only meaningful recovering from "denied" (e.g. the driver changed the
      // browser's site setting back to allow). Anywhere else there's nothing to do.
      if (state.status !== "denied") return state;
      return { ...state, status: state.blocked ? "paused" : "requesting", errorCode: undefined };

    case "permissionDenied":
      // A refused pause has no watch up, and a denial will surface again on the
      // driver's next tap; turning it into "denied" here would lose the refusal.
      if (!state.consent || isRefused(state)) return state;
      return { ...state, status: "denied", errorCode: 1 };

    case "positionReceived":
      if (state.status !== "requesting" && state.status !== "sharing") return state;
      return { ...state, status: "sharing", errorCode: undefined };

    case "positionError":
      if (state.status !== "requesting" && state.status !== "sharing") return state;
      return { ...state, status: "error", errorCode: event.code };

    case "conditions": {
      const { blocked, reason } = event;
      // Sticky: the server said no, so a connectivity or visibility change can't
      // undo it. Only the condition is remembered, for the driver's next tap.
      if (isRefused(state)) return { ...state, heldCondition: { blocked, reason } };
      if (!state.consent) return { ...state, blocked, blockedReason: reason };
      // denied/error are more specific than a pause; stay there, just remember the
      // condition for when the driver retries.
      if (state.status === "denied" || state.status === "error") {
        return { ...state, blocked, blockedReason: reason };
      }
      if (blocked) return { ...state, status: "paused", blocked: true, blockedReason: reason };
      return state.status === "paused"
        ? { ...state, status: "requesting", blocked: false, blockedReason: undefined }
        : { ...state, blocked: false, blockedReason: undefined };
    }

    case "sendConflict":
      if (!state.consent || isRefused(state)) return state;
      return {
        status: "paused",
        consent: true,
        blocked: true,
        blockedReason: "refused",
        heldCondition: conditionOf(state),
      };

    case "sharingWithdrawn": {
      if (!isRefused(state)) return state;
      // The server's answer says the run is IN_PROGRESS, so whatever this phone last
      // thought about the run doesn't block a new opt-in; only being offline or
      // hidden still does.
      const { blocked, reason } = conditionOf(state);
      return reason === "offline" || reason === "hidden" ? offState(blocked, reason) : offState();
    }

    case "sharingFailed":
      if (!isGpsActive(state)) return state;
      return { ...state, status: "error", errorCode: "server" };
  }
}

// Whether the hook should have an active watchPosition and, if there's an API, have
// told the server sharing is on. True for "sharing"/"requesting", and for "paused"
// with a *soft* reason (offline/hidden) — the watch stays up so a fresh fix is ready
// the moment the pause clears. False for "paused" with "runNotInProgress" or
// "refused" (the hard pauses) and for off/denied/error/unavailable.
export function isGpsActive(state: GpsState): boolean {
  if (state.status === "requesting" || state.status === "sharing") return true;
  return state.status === "paused" && (state.blockedReason === "offline" || state.blockedReason === "hidden");
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  // Epoch ms (GeolocationPosition.timestamp): when the fix was taken, not read.
  at: number;
}

export const DEFAULT_MIN_SEND_INTERVAL_MS = 10_000;
export const DEFAULT_MIN_SEND_DISTANCE_METERS = 25;
// The floor under the distance trigger: a fast bus (or a jumpy fix) still sends at
// most once every 5s.
export const DEFAULT_MIN_SEND_GAP_MS = 5_000;

export interface ThrottleOptions {
  minIntervalMs: number;
  minDistanceMeters: number;
  minGapMs: number;
}

// A fix is sent when enough time has passed since the last one sent, or it's moved
// far enough — whichever comes first — so a stationary bus still updates every
// minIntervalMs and a fast-moving one isn't limited to that alone, though never
// sooner than minGapMs after the last. The very first fix (last is null) is always
// sent.
export function shouldSendFix(last: GpsFix | null, next: GpsFix, options: ThrottleOptions): boolean {
  if (!last) return true;
  const elapsed = next.at - last.at;
  if (elapsed >= options.minIntervalMs) return true;
  if (elapsed < options.minGapMs) return false;
  return distanceMeters(last, next) >= options.minDistanceMeters;
}

// Haversine distance in meters.
function distanceMeters(
  a: Pick<GpsFix, "latitude" | "longitude">,
  b: Pick<GpsFix, "latitude" | "longitude">,
): number {
  const earthRadiusMeters = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLon = Math.sin(dLon / 2);
  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinHalfDLon * sinHalfDLon;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface AvailabilityInput {
  hasApi: boolean;
  hasGeolocation: boolean;
  secureContext: boolean;
}

export function isAvailable({ hasApi, hasGeolocation, secureContext }: AvailabilityInput): boolean {
  return hasApi && hasGeolocation && secureContext;
}
