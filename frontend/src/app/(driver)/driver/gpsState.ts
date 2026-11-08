// The driver GPS consent state machine (SCRUM-273), kept pure and framework-free so
// every transition can be tested without a browser. useGpsSharing.ts wires it to
// navigator.geolocation, navigator.permissions and the run prop.
//
// States:
//   unavailable  no DriverGpsApi (SCRUM-261 not merged), no navigator.geolocation, or
//                not a secure context. Permanent for the hook's lifetime.
//   off          available, but the driver hasn't opted in (or opted back out).
//   requesting   opted in, waiting for the browser's permission prompt and first fix.
//   sharing      a fix has arrived and positions are being sent.
//   denied       the browser (or the driver, in its settings) refused location.
//   error        watchPosition failed for a reason that isn't permission
//                (POSITION_UNAVAILABLE = 2, TIMEOUT = 3).
//   paused       consent is on, but blocked right now: offline, the tab is hidden, or
//                the run isn't IN_PROGRESS. See isGpsActive for what each reason means
//                for the hook (soft pause vs. a real stop).
//
// "paused" with blockedReason "runNotInProgress" is a real stop: the contract only
// allows turning sharing on for an IN_PROGRESS run, so the hook clears the watch and
// tells the server. "offline" and "hidden" are soft: the watch stays up (so there's a
// fresh fix ready) but nothing is sent until they clear, and only that one latest fix
// is sent then — never a backlog.

export type GpsStatus = "unavailable" | "off" | "requesting" | "sharing" | "denied" | "error" | "paused";

export type GpsBlockReason = "offline" | "hidden" | "runNotInProgress";

// GeolocationPositionError's codes: PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT.
export type GpsErrorCode = 1 | 2 | 3;

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
  // A 409 from sendPosition: the server disagrees that this run is shareable right
  // now (docs/contracts/driver-gps-offline.md), so this is treated the same as the run
  // having left IN_PROGRESS.
  | { type: "sendConflict" };

function offState(blocked = false, blockedReason?: GpsBlockReason): GpsState {
  return { status: "off", consent: false, blocked, blockedReason };
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
    case "retry":
      // Already on (or on its way): nothing to do. From off/denied/error, start the
      // flow — straight to "paused" if a condition is already blocking it.
      if (state.status === "requesting" || state.status === "sharing" || state.status === "paused") {
        return state;
      }
      return {
        status: state.blocked ? "paused" : "requesting",
        consent: true,
        blocked: state.blocked,
        blockedReason: state.blockedReason,
      };

    case "optOut":
      return offState(state.blocked, state.blockedReason);

    case "permissionGranted":
      // Only meaningful recovering from "denied" (e.g. the driver changed the
      // browser's site setting back to allow). Anywhere else there's nothing to do.
      if (state.status !== "denied") return state;
      return { ...state, status: state.blocked ? "paused" : "requesting", errorCode: undefined };

    case "permissionDenied":
      if (!state.consent) return state;
      return { ...state, status: "denied", errorCode: 1 };

    case "positionReceived":
      if (state.status !== "requesting" && state.status !== "sharing") return state;
      return { ...state, status: "sharing", errorCode: undefined };

    case "positionError":
      if (state.status !== "requesting" && state.status !== "sharing") return state;
      return { ...state, status: "error", errorCode: event.code };

    case "conditions": {
      const { blocked, reason } = event;
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
      if (!state.consent) return state;
      return { ...state, status: "paused", blocked: true, blockedReason: "runNotInProgress" };
  }
}

// Whether the hook should have an active watchPosition and, if there's an API, have
// told the server sharing is on. True for "sharing"/"requesting", and for "paused"
// with a *soft* reason (offline/hidden) — the watch stays up so a fresh fix is ready
// the moment the pause clears. False for "paused" with "runNotInProgress" (the only
// hard pause) and for off/denied/error/unavailable.
export function isGpsActive(state: GpsState): boolean {
  if (state.status === "requesting" || state.status === "sharing") return true;
  return state.status === "paused" && state.blockedReason !== "runNotInProgress";
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  // Epoch ms (GeolocationPosition.timestamp): when the fix was taken, not read.
  at: number;
}

export const DEFAULT_MIN_SEND_INTERVAL_MS = 15_000;
export const DEFAULT_MIN_SEND_DISTANCE_METERS = 25;

export interface ThrottleOptions {
  minIntervalMs: number;
  minDistanceMeters: number;
}

// A fix is sent when enough time has passed since the last one sent, or it's moved
// far enough — whichever comes first — so a stationary bus still updates every
// minIntervalMs and a fast-moving one isn't limited to that alone. The very first fix
// (last is null) is always sent.
export function shouldSendFix(last: GpsFix | null, next: GpsFix, options: ThrottleOptions): boolean {
  if (!last) return true;
  if (next.at - last.at >= options.minIntervalMs) return true;
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
