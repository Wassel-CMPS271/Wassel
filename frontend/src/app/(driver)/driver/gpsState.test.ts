import { describe, expect, it } from "vitest";
import {
  initialGpsState,
  isAvailable,
  isGpsActive,
  nextGpsState,
  shouldSendFix,
  type GpsFix,
  type GpsState,
} from "./gpsState";

const THROTTLE = { minIntervalMs: 15_000, minDistanceMeters: 25 };

function fix(overrides: Partial<GpsFix> = {}): GpsFix {
  return { latitude: 33.89, longitude: 35.5, accuracyMeters: 10, at: 1_000_000, ...overrides };
}

const OFF: GpsState = { status: "off", consent: false, blocked: false };
const SHARING: GpsState = { status: "sharing", consent: true, blocked: false };
const REQUESTING: GpsState = { status: "requesting", consent: true, blocked: false };
const DENIED: GpsState = { status: "denied", consent: true, blocked: false, errorCode: 1 };
const ERROR_TIMEOUT: GpsState = { status: "error", consent: true, blocked: false, errorCode: 3 };
const PAUSED_OFFLINE: GpsState = {
  status: "paused",
  consent: true,
  blocked: true,
  blockedReason: "offline",
};
const PAUSED_RUN: GpsState = {
  status: "paused",
  consent: true,
  blocked: true,
  blockedReason: "runNotInProgress",
};

describe("initialGpsState", () => {
  it("is off when available", () => {
    expect(initialGpsState(true)).toEqual(OFF);
  });

  it("is unavailable otherwise", () => {
    expect(initialGpsState(false)).toEqual({ status: "unavailable", consent: false, blocked: false });
  });
});

describe("isAvailable", () => {
  it("needs the api, navigator.geolocation and a secure context, all three", () => {
    const all = { hasApi: true, hasGeolocation: true, secureContext: true };
    expect(isAvailable(all)).toBe(true);
    expect(isAvailable({ ...all, hasApi: false })).toBe(false);
    expect(isAvailable({ ...all, hasGeolocation: false })).toBe(false);
    expect(isAvailable({ ...all, secureContext: false })).toBe(false);
  });
});

describe("isGpsActive", () => {
  it("is true while requesting or sharing", () => {
    expect(isGpsActive(REQUESTING)).toBe(true);
    expect(isGpsActive(SHARING)).toBe(true);
  });

  it("is true for a soft pause (offline/hidden), so the watch stays up", () => {
    expect(isGpsActive(PAUSED_OFFLINE)).toBe(true);
    expect(isGpsActive({ ...PAUSED_OFFLINE, blockedReason: "hidden" })).toBe(true);
  });

  it("is false for the one hard pause (the run isn't IN_PROGRESS)", () => {
    expect(isGpsActive(PAUSED_RUN)).toBe(false);
  });

  it("is false off/denied/error/unavailable", () => {
    expect(isGpsActive(OFF)).toBe(false);
    expect(isGpsActive(DENIED)).toBe(false);
    expect(isGpsActive(ERROR_TIMEOUT)).toBe(false);
    expect(isGpsActive({ status: "unavailable", consent: false, blocked: false })).toBe(false);
  });
});

describe("nextGpsState: unavailable is permanent except for reset", () => {
  const unavailable: GpsState = { status: "unavailable", consent: false, blocked: false };

  it("ignores every event except reset", () => {
    for (const event of [
      { type: "optIn" } as const,
      { type: "retry" } as const,
      { type: "positionReceived" } as const,
      { type: "permissionGranted" } as const,
      { type: "conditions", blocked: true, reason: "offline" } as const,
    ]) {
      expect(nextGpsState(unavailable, event)).toBe(unavailable);
    }
  });

  it("reset(true) goes to off, reset(false) stays unavailable", () => {
    expect(nextGpsState(unavailable, { type: "reset", available: true })).toEqual(OFF);
    expect(nextGpsState(unavailable, { type: "reset", available: false })).toEqual(unavailable);
  });
});

describe("nextGpsState: reset", () => {
  it("drops consent and any error/blocked, whatever the current state", () => {
    expect(nextGpsState(SHARING, { type: "reset", available: true })).toEqual(OFF);
    expect(nextGpsState(PAUSED_RUN, { type: "reset", available: false })).toEqual({
      status: "unavailable",
      consent: false,
      blocked: false,
    });
  });
});

describe("nextGpsState: optIn / retry", () => {
  it("goes to requesting from off, denied or error", () => {
    expect(nextGpsState(OFF, { type: "optIn" })).toEqual({
      status: "requesting",
      consent: true,
      blocked: false,
      blockedReason: undefined,
    });
    expect(nextGpsState(DENIED, { type: "retry" })).toMatchObject({ status: "requesting", consent: true });
    expect(nextGpsState(ERROR_TIMEOUT, { type: "retry" })).toMatchObject({ status: "requesting" });
  });

  it("goes straight to paused when a condition is already blocking it", () => {
    const offBlocked: GpsState = { status: "off", consent: false, blocked: true, blockedReason: "hidden" };

    expect(nextGpsState(offBlocked, { type: "optIn" })).toEqual({
      status: "paused",
      consent: true,
      blocked: true,
      blockedReason: "hidden",
    });
  });

  it("does nothing while already requesting, sharing or paused", () => {
    for (const state of [REQUESTING, SHARING, PAUSED_OFFLINE]) {
      expect(nextGpsState(state, { type: "optIn" })).toBe(state);
      expect(nextGpsState(state, { type: "retry" })).toBe(state);
    }
  });
});

describe("nextGpsState: optOut", () => {
  it("goes to off from any on state, dropping consent and the error code", () => {
    for (const state of [REQUESTING, SHARING, DENIED, ERROR_TIMEOUT, PAUSED_RUN]) {
      expect(nextGpsState(state, { type: "optOut" })).toEqual(
        offState(state.blocked, state.blockedReason),
      );
    }
  });

  it("is a no-op when already off", () => {
    expect(nextGpsState(OFF, { type: "optOut" })).toEqual(OFF);
  });
});

function offState(blocked: boolean, blockedReason?: GpsState["blockedReason"]): GpsState {
  return { status: "off", consent: false, blocked, blockedReason };
}

describe("nextGpsState: permissionGranted", () => {
  it("resumes from denied: requesting if clear, paused if still blocked", () => {
    expect(nextGpsState(DENIED, { type: "permissionGranted" })).toEqual({
      status: "requesting",
      consent: true,
      blocked: false,
      errorCode: undefined,
    });
    const deniedAndOffline: GpsState = { ...DENIED, blocked: true, blockedReason: "offline" };
    expect(nextGpsState(deniedAndOffline, { type: "permissionGranted" })).toEqual({
      status: "paused",
      consent: true,
      blocked: true,
      blockedReason: "offline",
      errorCode: undefined,
    });
  });

  it("does nothing anywhere else", () => {
    for (const state of [OFF, REQUESTING, SHARING, ERROR_TIMEOUT, PAUSED_OFFLINE]) {
      expect(nextGpsState(state, { type: "permissionGranted" })).toBe(state);
    }
  });
});

describe("nextGpsState: permissionDenied (GeolocationPositionError code 1)", () => {
  it("goes to denied from requesting or sharing", () => {
    expect(nextGpsState(REQUESTING, { type: "permissionDenied" })).toEqual({
      ...REQUESTING,
      status: "denied",
      errorCode: 1,
    });
    expect(nextGpsState(SHARING, { type: "permissionDenied" })).toEqual({
      ...SHARING,
      status: "denied",
      errorCode: 1,
    });
  });

  it("also fires mid-run, from an already-paused state", () => {
    expect(nextGpsState(PAUSED_OFFLINE, { type: "permissionDenied" })).toMatchObject({
      status: "denied",
      errorCode: 1,
    });
  });

  it("is ignored without consent (off/unavailable)", () => {
    expect(nextGpsState(OFF, { type: "permissionDenied" })).toBe(OFF);
  });
});

describe("nextGpsState: positionReceived", () => {
  it("moves requesting to sharing, clearing any error", () => {
    expect(nextGpsState({ ...REQUESTING, errorCode: undefined }, { type: "positionReceived" })).toEqual({
      ...REQUESTING,
      status: "sharing",
      errorCode: undefined,
    });
  });

  it("keeps sharing on a later fix", () => {
    expect(nextGpsState(SHARING, { type: "positionReceived" })).toEqual(SHARING);
  });

  it("is ignored off/denied/error/paused — a late callback after teardown", () => {
    for (const state of [OFF, DENIED, ERROR_TIMEOUT, PAUSED_RUN]) {
      expect(nextGpsState(state, { type: "positionReceived" })).toBe(state);
    }
  });
});

describe("nextGpsState: positionError (codes 2 and 3)", () => {
  it.each([2, 3] as const)("goes to error with code %s from requesting or sharing", (code) => {
    expect(nextGpsState(REQUESTING, { type: "positionError", code })).toEqual({
      ...REQUESTING,
      status: "error",
      errorCode: code,
    });
    expect(nextGpsState(SHARING, { type: "positionError", code })).toEqual({
      ...SHARING,
      status: "error",
      errorCode: code,
    });
  });

  it("is ignored elsewhere", () => {
    expect(nextGpsState(OFF, { type: "positionError", code: 2 })).toBe(OFF);
  });
});

describe("nextGpsState: conditions", () => {
  it("pauses requesting/sharing when blocked, with the given reason", () => {
    expect(nextGpsState(SHARING, { type: "conditions", blocked: true, reason: "offline" })).toEqual({
      ...SHARING,
      status: "paused",
      blocked: true,
      blockedReason: "offline",
    });
    expect(nextGpsState(REQUESTING, { type: "conditions", blocked: true, reason: "hidden" })).toEqual({
      ...REQUESTING,
      status: "paused",
      blocked: true,
      blockedReason: "hidden",
    });
  });

  it("resumes a paused state to requesting once unblocked", () => {
    expect(nextGpsState(PAUSED_OFFLINE, { type: "conditions", blocked: false })).toEqual({
      status: "requesting",
      consent: true,
      blocked: false,
      blockedReason: undefined,
    });
  });

  it("just updates the flag while already sharing/requesting and still clear", () => {
    expect(nextGpsState(SHARING, { type: "conditions", blocked: false })).toEqual({
      ...SHARING,
      blocked: false,
      blockedReason: undefined,
    });
  });

  it("remembers the condition through denied/error without changing status", () => {
    expect(nextGpsState(DENIED, { type: "conditions", blocked: true, reason: "offline" })).toEqual({
      ...DENIED,
      blocked: true,
      blockedReason: "offline",
    });
    expect(nextGpsState(ERROR_TIMEOUT, { type: "conditions", blocked: true, reason: "hidden" })).toEqual({
      ...ERROR_TIMEOUT,
      blocked: true,
      blockedReason: "hidden",
    });
  });

  it("is tracked even without consent (off), for the next optIn", () => {
    expect(nextGpsState(OFF, { type: "conditions", blocked: true, reason: "runNotInProgress" })).toEqual({
      ...OFF,
      blocked: true,
      blockedReason: "runNotInProgress",
    });
  });

  it("one clearing reason doesn't resume while another still blocks (the full picture each time)", () => {
    // The hook always sends the combined truth — "offline" clearing while hidden is
    // still true arrives as conditions({ blocked: true, reason: "hidden" }), not an
    // "unblocked" by itself, so there's no delta here to get wrong. This just checks
    // that staying blocked (for a different reason) doesn't resume.
    const pausedHidden = { ...PAUSED_OFFLINE, blockedReason: "hidden" as const };
    expect(nextGpsState(pausedHidden, { type: "conditions", blocked: true, reason: "hidden" })).toEqual(
      pausedHidden,
    );
  });
});

describe("nextGpsState: sendConflict (a 409 from sendPosition)", () => {
  it("pauses as runNotInProgress from sharing", () => {
    expect(nextGpsState(SHARING, { type: "sendConflict" })).toEqual({
      ...SHARING,
      status: "paused",
      blocked: true,
      blockedReason: "runNotInProgress",
    });
  });

  it("is ignored without consent", () => {
    expect(nextGpsState(OFF, { type: "sendConflict" })).toBe(OFF);
  });
});

describe("shouldSendFix", () => {
  it("always sends the first fix", () => {
    expect(shouldSendFix(null, fix(), THROTTLE)).toBe(true);
  });

  it("sends once minIntervalMs has passed, even with no movement", () => {
    const last = fix({ at: 0 });
    expect(shouldSendFix(last, fix({ at: 14_999 }), THROTTLE)).toBe(false);
    expect(shouldSendFix(last, fix({ at: 15_000 }), THROTTLE)).toBe(true);
  });

  it("sends once minDistanceMeters has been covered, even with no time passed", () => {
    const last = fix({ latitude: 33.89, longitude: 35.5, at: 0 });
    // ~22m north: below the threshold.
    expect(shouldSendFix(last, fix({ latitude: 33.89020, longitude: 35.5, at: 0 }), THROTTLE)).toBe(
      false,
    );
    // ~28m north: over it.
    expect(shouldSendFix(last, fix({ latitude: 33.89025, longitude: 35.5, at: 0 }), THROTTLE)).toBe(true);
  });

  it("sends on whichever threshold is reached first", () => {
    const last = fix({ at: 0 });
    // Neither time nor distance: not sent.
    expect(shouldSendFix(last, fix({ at: 1_000 }), THROTTLE)).toBe(false);
  });
});
