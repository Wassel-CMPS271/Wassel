// useGpsSharing (SCRUM-273) with a fake navigator.geolocation/permissions (installed
// with Object.defineProperty, since neither exists in jsdom), a fake DriverGpsApi and
// a hand-rolled Connectivity. Throttling is driven entirely by each fix's own
// `timestamp`/coordinates (what the real hook reads), not by wall-clock time, so
// these don't need fake timers the way the offline queue's backoff does.

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverGpsApi } from "@/lib/api/driverGps";
import { ApiError } from "@/lib/api/errors";
import type { Run } from "@/lib/api/runs";
import type { Connectivity, ConnectivityState } from "@/lib/offline/connectivity";
import { useGpsSharing } from "./useGpsSharing";

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    date: "2026-11-09",
    direction: "MORNING",
    state: "IN_PROGRESS",
    schoolTime: "08:00",
    startedAt: "2026-11-09T05:00:00Z",
    endedAt: null,
    route: { id: "route-1", name: "Hamra morning run" },
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 14 },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    counts: { students: 0, absent: 0, pickedUp: 0, droppedOff: 0, notPresent: 0 },
    stops: [],
    ...overrides,
  };
}

function position(overrides: Partial<GeolocationCoordinates> & { timestamp?: number } = {}): GeolocationPosition {
  const { timestamp = 1_000_000, ...coordOverrides } = overrides;
  return {
    coords: {
      latitude: 33.89,
      longitude: 35.5,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return this;
      },
      ...coordOverrides,
    },
    timestamp,
    toJSON() {
      return this;
    },
  } as GeolocationPosition;
}

function positionError(code: 1 | 2 | 3): GeolocationPositionError {
  return { code, message: "x", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

type Watcher = { success: PositionCallback; error?: PositionErrorCallback | null };

function fakeGeolocation() {
  const watchers: Watcher[] = [];
  let nextId = 1;
  const watchPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
    watchers.push({ success, error });
    return nextId++;
  });
  const clearWatch = vi.fn();
  return { watchPosition, clearWatch, watchers };
}

type FakeGeolocation = ReturnType<typeof fakeGeolocation>;

function fakePermissionStatus(initial: PermissionState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get state() {
      return state;
    },
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    change(next: PermissionState) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

type FakePermissionStatus = ReturnType<typeof fakePermissionStatus>;

function fakeApi(): DriverGpsApi & {
  setSharing: ReturnType<typeof vi.fn>;
  sendPosition: ReturnType<typeof vi.fn>;
} {
  return {
    getSharing: vi.fn().mockResolvedValue({ enabled: false, since: null }),
    setSharing: vi.fn().mockResolvedValue({ enabled: true, since: "2026-11-09T05:00:00Z" }),
    sendPosition: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeConnectivity(initial: ConnectivityState = "online"): Connectivity & {
  setState: (state: ConnectivityState) => void;
} {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onRetry: () => () => {},
    reportSuccess: vi.fn(),
    reportFailure: vi.fn(),
    dispose: () => {},
    setState(next) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

let geolocation: FakeGeolocation | undefined;

function installGeolocation() {
  geolocation = fakeGeolocation();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
  return geolocation;
}

function installPermissions(status: FakePermissionStatus | undefined) {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: status ? { query: vi.fn().mockResolvedValue(status) } : undefined,
  });
}

function setSecureContext(secure: boolean) {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: secure });
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: hidden ? "hidden" : "visible",
  });
}

beforeEach(() => {
  setSecureContext(true);
  setHidden(false);
  installPermissions(undefined);
});

afterEach(() => {
  geolocation = undefined;
  delete (navigator as { geolocation?: unknown }).geolocation;
  delete (navigator as { permissions?: unknown }).permissions;
  delete (window as { isSecureContext?: unknown }).isSecureContext;
  delete (document as { visibilityState?: unknown }).visibilityState;
});

// Renders with geolocation installed, no permissions.query (the common case: most
// browsers that matter here don't implement it), online and visible, unless a test
// overrides one of those first.
function setUp(overrides: { run?: Run; api?: ReturnType<typeof fakeApi> } = {}) {
  installGeolocation();
  const api = overrides.api ?? fakeApi();
  const connectivity = fakeConnectivity();
  const rendered = renderHook((props: { run: Run }) => useGpsSharing({ run: props.run, api, connectivity }), {
    initialProps: { run: overrides.run ?? run() },
  });
  return { ...rendered, api, connectivity };
}

describe("availability", () => {
  it("is unavailable with no api", () => {
    installGeolocation();
    const { result } = renderHook(() =>
      useGpsSharing({ run: run(), api: null, connectivity: fakeConnectivity() }),
    );

    expect(result.current.state.status).toBe("unavailable");
  });

  it("is unavailable with no navigator.geolocation", () => {
    installPermissions(undefined);
    const { result } = renderHook(() =>
      useGpsSharing({ run: run(), api: fakeApi(), connectivity: fakeConnectivity() }),
    );

    expect(result.current.state.status).toBe("unavailable");
  });

  it("is unavailable outside a secure context", () => {
    installGeolocation();
    setSecureContext(false);

    const { result } = renderHook(() =>
      useGpsSharing({ run: run(), api: fakeApi(), connectivity: fakeConnectivity() }),
    );

    expect(result.current.state.status).toBe("unavailable");
  });

  it("is off, with nothing touched yet, when api, geolocation and a secure context all hold", () => {
    const { result, api } = setUp();

    expect(result.current.state).toEqual({ status: "off", consent: false, blocked: false });
    expect(geolocation!.watchPosition).not.toHaveBeenCalled();
    expect(api.setSharing).not.toHaveBeenCalled();
  });

  it("requests and sends nothing at all with a null api, even if the driver calls optIn", () => {
    installGeolocation();
    const { result } = renderHook(() =>
      useGpsSharing({ run: run(), api: null, connectivity: fakeConnectivity() }),
    );

    act(() => result.current.optIn());

    expect(result.current.state.status).toBe("unavailable");
    expect(geolocation!.watchPosition).not.toHaveBeenCalled();
  });
});

describe("explicit opt-in", () => {
  it("requests nothing until optIn is called", () => {
    setUp();

    expect(geolocation!.watchPosition).not.toHaveBeenCalled();
  });

  it("starts watching and tells the server once optIn is called, for an IN_PROGRESS run", () => {
    const { result, api } = setUp();

    act(() => result.current.optIn());

    expect(result.current.state.status).toBe("requesting");
    expect(geolocation!.watchPosition).toHaveBeenCalledTimes(1);
    expect(api.setSharing).toHaveBeenCalledWith("run-1", { enabled: true });
  });

  it("goes straight to paused, without touching geolocation or the server, when the run isn't IN_PROGRESS yet", () => {
    const { result, api } = setUp({ run: run({ state: "NOT_STARTED" }) });

    act(() => result.current.optIn());

    expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "runNotInProgress" });
    expect(geolocation!.watchPosition).not.toHaveBeenCalled();
    expect(api.setSharing).not.toHaveBeenCalled();
  });
});

describe("the sharing flow and throttling", () => {
  it("moves to sharing and sends the first fix as soon as one arrives", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].success(position({ timestamp: 1_000 })));
    await waitFor(() => expect(result.current.state.status).toBe("sharing"));

    expect(api.sendPosition).toHaveBeenCalledWith("run-1", {
      latitude: 33.89,
      longitude: 35.5,
      accuracyMeters: 10,
      recordedAt: new Date(1_000).toISOString(),
    });
  });

  it("doesn't resend a fix less than 15s and 25m after the last one sent", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    act(() => geolocation!.watchers[0].success(position({ timestamp: 1_000 })));
    await act(async () => {});

    expect(api.sendPosition).toHaveBeenCalledTimes(1);
  });

  it("resends once 15s have passed, even with no movement", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    act(() => geolocation!.watchers[0].success(position({ timestamp: 15_000 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(2));
  });

  it("resends once 25m have been covered, even with no time passed", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ latitude: 33.89, longitude: 35.5, timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    // ~28m north of the last sent fix.
    act(() =>
      geolocation!.watchers[0].success(position({ latitude: 33.89025, longitude: 35.5, timestamp: 0 })),
    );
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(2));
  });

  it("reports the connection back up once a send succeeds", async () => {
    const { result, connectivity } = setUp();
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(connectivity.reportSuccess).toHaveBeenCalled());
  });

  it("reports a failure when sendPosition rejects with anything but a 409", async () => {
    const api = fakeApi();
    api.sendPosition.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result, connectivity } = setUp({ api });
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(connectivity.reportFailure).toHaveBeenCalled());
    expect(result.current.state.status).toBe("sharing"); // a send failure isn't a GPS error
  });
});

describe("GeolocationPositionError codes", () => {
  it("code 1 (PERMISSION_DENIED) goes to denied, stops the watch and tells the server", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].error?.(positionError(1)));

    expect(result.current.state).toMatchObject({ status: "denied", errorCode: 1 });
    await waitFor(() => expect(geolocation!.clearWatch).toHaveBeenCalled());
    await waitFor(() => expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false }));
  });

  it("code 2 (POSITION_UNAVAILABLE) goes to error and stops the watch", async () => {
    const { result } = setUp();
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].error?.(positionError(2)));

    expect(result.current.state).toMatchObject({ status: "error", errorCode: 2 });
    await waitFor(() => expect(geolocation!.clearWatch).toHaveBeenCalled());
  });

  it("code 3 (TIMEOUT) goes to error and stops the watch", async () => {
    const { result } = setUp();
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].error?.(positionError(3)));

    expect(result.current.state).toMatchObject({ status: "error", errorCode: 3 });
    await waitFor(() => expect(geolocation!.clearWatch).toHaveBeenCalled());
  });

  it("retry() after an error starts a fresh watch with the same consent", async () => {
    const { result } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].error?.(positionError(3)));
    await waitFor(() => expect(geolocation!.clearWatch).toHaveBeenCalledTimes(1));

    act(() => result.current.retry());

    expect(result.current.state.status).toBe("requesting");
    expect(geolocation!.watchPosition).toHaveBeenCalledTimes(2);
  });
});

describe("stopping", () => {
  it("opting out clears the watch and turns server sharing off", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(result.current.state.status).toBe("sharing"));

    act(() => result.current.optOut());

    expect(result.current.state.status).toBe("off");
    await waitFor(() => expect(geolocation!.clearWatch).toHaveBeenCalled());
    await waitFor(() => expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false }));
  });

  it("the run leaving IN_PROGRESS clears the watch and turns server sharing off", async () => {
    const { result, rerender, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(result.current.state.status).toBe("sharing"));

    rerender({ run: run({ state: "FINISHED" }) });

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "runNotInProgress" }),
    );
    expect(geolocation!.clearWatch).toHaveBeenCalled();
    expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false });
  });

  it("a 409 from sendPosition is treated the same as the run leaving IN_PROGRESS", async () => {
    const api = fakeApi();
    api.sendPosition.mockRejectedValueOnce(new ApiError(409, "Not in progress"));
    const { result } = setUp({ api });
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].success(position()));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "runNotInProgress" }),
    );
    await waitFor(() => expect(geolocation!.clearWatch).toHaveBeenCalled());
    await waitFor(() => expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false }));
  });

  it("unmounting while sharing clears the watch and turns server sharing off", async () => {
    const { result, unmount, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(result.current.state.status).toBe("sharing"));

    unmount();

    expect(geolocation!.clearWatch).toHaveBeenCalled();
    expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false });
  });

  it("switching to a different run resets to off and tears down the old one", async () => {
    const { result, rerender, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(result.current.state.status).toBe("sharing"));

    rerender({ run: run({ id: "run-2" }) });

    expect(result.current.state).toEqual({ status: "off", consent: false, blocked: false });
    expect(geolocation!.clearWatch).toHaveBeenCalled();
    expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false });
  });

  it("never sends a fix from a callback that arrives after opting out", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    const { success } = geolocation!.watchers[0];
    act(() => success(position({ timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    act(() => result.current.optOut());
    api.sendPosition.mockClear();
    // The browser's own callback, already captured, fires once more before the real
    // watch is actually torn down (the race the activeRef guard is for).
    act(() => success(position({ timestamp: 60_000 })));

    expect(api.sendPosition).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("off");
  });
});

describe("soft pause: offline and hidden", () => {
  it("pauses without clearing the watch or telling the server, while offline", async () => {
    const { result, connectivity, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await waitFor(() => expect(result.current.state.status).toBe("sharing"));
    api.setSharing.mockClear();

    act(() => connectivity.setState("offline"));

    expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "offline" });
    expect(geolocation!.clearWatch).not.toHaveBeenCalled();
    expect(api.setSharing).not.toHaveBeenCalled();
  });

  it("caches a fix while paused instead of sending it, then sends only that one on reconnect", async () => {
    const { result, connectivity, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));
    act(() => connectivity.setState("offline"));

    act(() => geolocation!.watchers[0].success(position({ latitude: 33.95, timestamp: 1_000 })));
    expect(api.sendPosition).toHaveBeenCalledTimes(1); // still just the one from before

    act(() => connectivity.setState("online"));

    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(2));
    expect(api.sendPosition).toHaveBeenLastCalledWith(
      "run-1",
      expect.objectContaining({ latitude: 33.95 }),
    );
    expect(result.current.state.status).toBe("sharing");
  });

  it("sends nothing on reconnect when no fix arrived while paused", async () => {
    const { result, connectivity, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    act(() => connectivity.setState("offline"));
    act(() => connectivity.setState("online"));
    await act(async () => {});

    expect(api.sendPosition).toHaveBeenCalledTimes(1);
  });

  it("pauses when the page is hidden, and resumes (sending the cached fix) when visible again", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "hidden" }),
    );
    expect(geolocation!.clearWatch).not.toHaveBeenCalled();

    act(() => geolocation!.watchers[0].success(position({ latitude: 33.95, timestamp: 1_000 })));
    expect(api.sendPosition).toHaveBeenCalledTimes(1);

    act(() => setHidden(false));
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(2));
    expect(result.current.state.status).toBe("sharing");
  });

  it("doesn't resume from a soft pause while the run still isn't IN_PROGRESS either", async () => {
    const { result, connectivity } = setUp({ run: run({ state: "NOT_STARTED" }) });
    act(() => result.current.optIn());
    expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "runNotInProgress" });

    act(() => connectivity.setState("offline"));
    act(() => connectivity.setState("online"));

    // Still blocked by the run, whatever connectivity says.
    expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "runNotInProgress" });
  });
});

describe("navigator.permissions.query, where it exists", () => {
  it("falls back gracefully where it doesn't exist (no crash, no subscription)", () => {
    installPermissions(undefined);
    expect(() => setUp()).not.toThrow();
  });

  it("detects a permission revoked mid-run and stops the watch", async () => {
    const status = fakePermissionStatus("granted");
    installPermissions(status);
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(result.current.state.status).toBe("sharing"));
    await waitFor(() => expect(status.addEventListener).toHaveBeenCalled());

    act(() => status.change("denied"));

    expect(result.current.state).toMatchObject({ status: "denied", errorCode: 1 });
    await waitFor(() => expect(geolocation!.clearWatch).toHaveBeenCalled());
    await waitFor(() => expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false }));
  });

  it("resumes on its own once permission is granted again after being denied", async () => {
    const status = fakePermissionStatus("denied");
    installPermissions(status);
    const { result } = setUp();
    act(() => result.current.optIn());
    await waitFor(() => expect(status.addEventListener).toHaveBeenCalled());
    expect(result.current.state.status).toBe("denied");

    act(() => status.change("granted"));

    expect(result.current.state.status).toBe("requesting");
    expect(geolocation!.watchPosition).toHaveBeenCalledTimes(2); // the original call, then this resume
  });

  it("checks the already-denied case once, without waiting for a change event", async () => {
    const status = fakePermissionStatus("denied");
    installPermissions(status);
    const { result } = setUp();

    act(() => result.current.optIn());
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "denied", errorCode: 1 }));
  });

  it("stops listening on unmount", async () => {
    const status = fakePermissionStatus("granted");
    installPermissions(status);
    const { unmount } = setUp();
    await waitFor(() => expect(status.addEventListener).toHaveBeenCalled());

    unmount();

    expect(status.removeEventListener).toHaveBeenCalled();
  });
});
