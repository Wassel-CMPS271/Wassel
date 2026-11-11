// useGpsSharing (SCRUM-273) with a fake navigator.geolocation/permissions (installed
// with Object.defineProperty, since neither exists in jsdom), a fake DriverGpsApi and
// a hand-rolled Connectivity. Throttling is driven entirely by each fix's own
// `timestamp`/coordinates (what the real hook reads), not by wall-clock time, so
// these don't need fake timers the way the offline queue's backoff does. Calls the
// tests need to hold open use deferred() below.

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverGpsApi } from "@/lib/api/driverGps";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
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
    locationSharing: false,
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
    setSharing: vi.fn().mockResolvedValue(run()),
    sendPosition: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeConnectivity(initial: ConnectivityState = "online"): Connectivity & {
  setState: (state: ConnectivityState) => void;
  retry: () => void;
} {
  let state = initial;
  const listeners = new Set<() => void>();
  const retryListeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onRetry: (listener) => {
      retryListeners.add(listener);
      return () => retryListeners.delete(listener);
    },
    retry() {
      for (const listener of [...retryListeners]) listener();
    },
    reportSuccess: vi.fn(),
    reportFailure: vi.fn(),
    dispose: () => {},
    setState(next) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function enabledArgs(api: ReturnType<typeof fakeApi>): boolean[] {
  return api.setSharing.mock.calls.map((call) => (call[1] as { enabled: boolean }).enabled);
}

function hide(hidden: boolean) {
  setHidden(hidden);
  document.dispatchEvent(new Event("visibilitychange"));
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
  const onRunChange = vi.fn();
  const onRefreshRequested = vi.fn();
  const rendered = renderHook(
    (props: { run: Run }) =>
      useGpsSharing({ run: props.run, api, connectivity, onRunChange, onRefreshRequested }),
    { initialProps: { run: overrides.run ?? run() } },
  );
  return { ...rendered, api, connectivity, onRunChange, onRefreshRequested };
}

describe("availability", () => {
  it("is unavailable with no api", () => {
    installGeolocation();
    const { result } = renderHook(() =>
      useGpsSharing({ run: run(), api: null, connectivity: fakeConnectivity(), onRunChange: vi.fn(), onRefreshRequested: vi.fn() }),
    );

    expect(result.current.state.status).toBe("unavailable");
  });

  it("is unavailable with no navigator.geolocation", () => {
    installPermissions(undefined);
    const { result } = renderHook(() =>
      useGpsSharing({ run: run(), api: fakeApi(), connectivity: fakeConnectivity(), onRunChange: vi.fn(), onRefreshRequested: vi.fn() }),
    );

    expect(result.current.state.status).toBe("unavailable");
  });

  it("is unavailable outside a secure context", () => {
    installGeolocation();
    setSecureContext(false);

    const { result } = renderHook(() =>
      useGpsSharing({ run: run(), api: fakeApi(), connectivity: fakeConnectivity(), onRunChange: vi.fn(), onRefreshRequested: vi.fn() }),
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
      useGpsSharing({ run: run(), api: null, connectivity: fakeConnectivity(), onRunChange: vi.fn(), onRefreshRequested: vi.fn() }),
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
    });
  });

  it("doesn't send a fix with an out-of-range accuracy", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());

    act(() =>
      geolocation!.watchers[0].success(position({ accuracy: 10_001, timestamp: 1_000 })),
    );
    await act(async () => {});

    expect(api.sendPosition).not.toHaveBeenCalled();
  });

  it("doesn't resend a fix less than 10s and 25m after the last one sent", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    act(() => geolocation!.watchers[0].success(position({ timestamp: 1_000 })));
    await act(async () => {});

    expect(api.sendPosition).toHaveBeenCalledTimes(1);
  });

  it("resends once 10s have passed, even with no movement", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    act(() => geolocation!.watchers[0].success(position({ timestamp: 10_000 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(2));
  });

  it("resends once 25m have been covered, before 10s have passed", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ latitude: 33.89, longitude: 35.5, timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    // ~28m north of the last sent fix, 5s later.
    act(() =>
      geolocation!.watchers[0].success(position({ latitude: 33.89025, longitude: 35.5, timestamp: 5_000 })),
    );
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(2));
  });

  it("doesn't resend within 5s of the last send, even past 25m", async () => {
    const { result, api } = setUp();
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ latitude: 33.89, longitude: 35.5, timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    // ~55m north, under 5s later.
    act(() =>
      geolocation!.watchers[0].success(position({ latitude: 33.8905, longitude: 35.5, timestamp: 4_999 })),
    );
    await act(async () => {});

    expect(api.sendPosition).toHaveBeenCalledTimes(1);
  });

  it("skips a fix while the previous send is still in flight", async () => {
    const api = fakeApi();
    const pending = deferred<void>();
    api.sendPosition.mockReturnValueOnce(pending.promise);
    const { result } = setUp({ api });
    act(() => result.current.optIn());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));

    // Past the 10s interval, but the first send hasn't answered yet.
    act(() => geolocation!.watchers[0].success(position({ timestamp: 10_000 })));
    await act(async () => {});
    expect(api.sendPosition).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve());
    act(() => geolocation!.watchers[0].success(position({ timestamp: 20_000 })));
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

  it.each([
    ["ApiError(400)", new ApiError(400, "Bad request")],
    ["ApiError(403)", new ApiError(403, "Forbidden")],
    ["ApiError(500)", new ApiError(500, "Internal error")],
  ])("doesn't report a network failure for %s (the server was reached)", async (_label, error) => {
    const api = fakeApi();
    api.sendPosition.mockRejectedValueOnce(error);
    const { result, connectivity } = setUp({ api });
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(connectivity.reportFailure).not.toHaveBeenCalled();
    expect(connectivity.reportSuccess).toHaveBeenCalled();
    expect(result.current.state.status).toBe("sharing");
  });

  it("doesn't report a network failure for a 400 (the server was reached, the fix was rejected)", async () => {
    const api = fakeApi();
    api.sendPosition.mockRejectedValueOnce(new ApiValidationError({ latitude: "must be between -90 and 90" }));
    const { result, connectivity } = setUp({ api });
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].success(position()));
    await act(async () => {});

    expect(connectivity.reportFailure).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("sharing");
  });
});

describe("onRunChange", () => {
  it("is called with the Run setSharing(true) resolves with, on opt-in", async () => {
    const api = fakeApi();
    const updated = run({ locationSharing: true });
    api.setSharing.mockResolvedValueOnce(updated);
    const { result, onRunChange } = setUp({ api });

    act(() => result.current.optIn());

    await waitFor(() => expect(onRunChange).toHaveBeenCalledWith(updated));
  });

  it("is called with the Run setSharing(false) resolves with, on opt-out", async () => {
    const api = fakeApi();
    const onOff = run({ locationSharing: false });
    api.setSharing.mockResolvedValueOnce(run({ locationSharing: true })); // the opt-in call
    api.setSharing.mockResolvedValueOnce(onOff); // the opt-out call
    const { result, onRunChange } = setUp({ api });
    act(() => result.current.optIn());
    await waitFor(() => expect(api.setSharing).toHaveBeenCalledTimes(1));

    act(() => result.current.optOut());

    await waitFor(() => expect(onRunChange).toHaveBeenLastCalledWith(onOff));
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

  it("a 409 from sendPosition pauses as refused, asks for a refetch, and stays paused when the run is no longer IN_PROGRESS", async () => {
    const api = fakeApi();
    api.sendPosition.mockRejectedValueOnce(new ApiError(409, "Not in progress"));
    const { result, onRefreshRequested } = setUp({ api });
    act(() => result.current.optIn());
    await waitFor(() => expect(api.setSharing).toHaveBeenCalledTimes(1));
    // The teardown's own setSharing(false) call is what tells the hook which of the
    // two outcomes this is — here, the run genuinely isn't IN_PROGRESS any more.
    api.setSharing.mockResolvedValueOnce(run({ state: "FINISHED" }));

    act(() => geolocation!.watchers[0].success(position()));

    await waitFor(() => expect(geolocation!.clearWatch).toHaveBeenCalled());
    await waitFor(() => expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false }));
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" }),
    );
    expect(onRefreshRequested).toHaveBeenCalledTimes(1);
    // Consent is retained for a plain pause: still stuck at "paused" well after the
    // refetch resolved, not bounced to "off".
    await act(async () => {});
    expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" });
    expect(enabledArgs(api)).toEqual([true, false]);
  });

  it("a 409 from sendPosition drops to off when the refetched run is still IN_PROGRESS with sharing off, and never re-opts-in on its own", async () => {
    const api = fakeApi(); // setSharing's default already resolves { state: "IN_PROGRESS", locationSharing: false }
    api.sendPosition.mockRejectedValueOnce(new ApiError(409, "Location sharing is off for this run"));
    const { result, onRunChange } = setUp({ api });
    act(() => result.current.optIn());
    await waitFor(() => expect(api.setSharing).toHaveBeenCalledTimes(1));

    act(() => geolocation!.watchers[0].success(position()));

    await waitFor(() => expect(api.setSharing).toHaveBeenLastCalledWith("run-1", { enabled: false }));
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "off",
        consent: false,
        blocked: false,
        blockedReason: undefined,
      }),
    );
    expect(onRunChange).toHaveBeenLastCalledWith(run());
    // Settles at "off" — no further setSharing(true) call follows on its own.
    expect(api.setSharing).toHaveBeenCalledTimes(2);
    await act(async () => {});
    expect(api.setSharing).toHaveBeenCalledTimes(2);

    // Off and unblocked: the Share button works again.
    act(() => result.current.optIn());
    expect(result.current.state.status).toBe("requesting");
    expect(enabledArgs(api)).toEqual([true, false, true]);
  });

  it("a send 409 whose setSharing(false) rejects never calls setSharing(true) again", async () => {
    const api = fakeApi();
    api.sendPosition.mockRejectedValueOnce(new ApiError(409, "x"));
    const { result, connectivity } = setUp({ api });
    act(() => result.current.optIn());
    await waitFor(() => expect(api.setSharing).toHaveBeenCalledTimes(1));
    api.setSharing.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    act(() => geolocation!.watchers[0].success(position()));
    await waitFor(() => expect(api.setSharing).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" });

    act(() => connectivity.setState("offline"));
    act(() => connectivity.setState("online"));
    act(() => connectivity.retry());
    act(() => hide(true));
    act(() => hide(false));
    await act(async () => {});

    expect(enabledArgs(api)).toEqual([true, false]);
    expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" });
  });

  it.each([409, 404])(
    "a %i on opt-in pauses as refused and asks for a refetch, instead of retrying setSharing(true) on its own",
    async (status) => {
      const api = fakeApi();
      api.setSharing.mockRejectedValueOnce(new ApiError(status, "Refused"));
      const { result, onRefreshRequested } = setUp({ api });

      act(() => result.current.optIn());

      await waitFor(() =>
        expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" }),
      );
      expect(onRefreshRequested).toHaveBeenCalledTimes(1);
      expect(api.setSharing).toHaveBeenCalledTimes(1);
      expect(geolocation!.clearWatch).toHaveBeenCalled();

      // Nothing retries it on its own while nothing has changed.
      await act(async () => {});
      expect(api.setSharing).toHaveBeenCalledTimes(1);
    },
  );

  it("a 409 on opt-in stays refused through offline -> online and visibilitychange", async () => {
    const api = fakeApi();
    api.setSharing.mockRejectedValueOnce(new ApiError(409, "Run is not in progress"));
    const { result, connectivity } = setUp({ api });
    act(() => result.current.optIn());
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" }),
    );

    act(() => connectivity.setState("offline"));
    act(() => connectivity.setState("online"));
    act(() => connectivity.retry());
    act(() => hide(true));
    act(() => hide(false));
    await act(async () => {});

    expect(api.setSharing).toHaveBeenCalledTimes(1);
    expect(api.sendPosition).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" });
  });

  it("a refused pause is cleared by the driver tapping Try again", async () => {
    const api = fakeApi();
    api.setSharing.mockRejectedValueOnce(new ApiError(409, "Run is not in progress"));
    const { result } = setUp({ api });
    act(() => result.current.optIn());
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" }),
    );

    act(() => result.current.retry());

    expect(result.current.state.status).toBe("requesting");
    expect(enabledArgs(api)).toEqual([true, true]);
  });

  it("a refused pause is cleared by a run change", async () => {
    const api = fakeApi();
    api.setSharing.mockRejectedValueOnce(new ApiError(409, "Run is not in progress"));
    const { result, rerender } = setUp({ api });
    act(() => result.current.optIn());
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "paused", blockedReason: "refused" }),
    );

    rerender({ run: run({ id: "run-2" }) });

    expect(result.current.state).toEqual({ status: "off", consent: false, blocked: false });
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

describe("setSharing ordering", () => {
  it("never sends a false and a true side by side: a later call waits for the earlier one", async () => {
    const api = fakeApi();
    const optInCall = deferred<Run>();
    api.setSharing.mockReturnValueOnce(optInCall.promise);
    const { result } = setUp({ api });
    act(() => result.current.optIn());

    act(() => result.current.optOut());
    await act(async () => {});
    // The opt-out is queued behind the unanswered opt-in, not sent alongside it.
    expect(enabledArgs(api)).toEqual([true]);

    await act(async () => optInCall.resolve(run({ locationSharing: true })));
    await waitFor(() => expect(enabledArgs(api)).toEqual([true, false]));
  });

  it("ignores the answer of a call a newer one replaced", async () => {
    const api = fakeApi();
    const optInCall = deferred<Run>();
    api.setSharing.mockReturnValueOnce(optInCall.promise);
    const offRun = run({ locationSharing: false });
    api.setSharing.mockResolvedValueOnce(offRun);
    const { result, onRunChange } = setUp({ api });
    act(() => result.current.optIn());
    act(() => result.current.optOut());

    await act(async () => optInCall.resolve(run({ locationSharing: true })));
    await waitFor(() => expect(api.setSharing).toHaveBeenCalledTimes(2));
    await act(async () => {});

    // Only the opt-out's answer reaches the page.
    expect(onRunChange).toHaveBeenCalledTimes(1);
    expect(onRunChange).toHaveBeenCalledWith(offRun);
  });

  it("a rejected opt-in that a newer opt-in replaced doesn't undo it", async () => {
    const api = fakeApi();
    const firstOptIn = deferred<Run>();
    api.setSharing.mockReturnValueOnce(firstOptIn.promise);
    const { result } = setUp({ api });
    act(() => result.current.optIn());
    act(() => result.current.optOut());
    act(() => result.current.optIn());

    await act(async () => firstOptIn.reject(new ApiError(500, "x")));
    await waitFor(() => expect(enabledArgs(api)).toEqual([true, false, true]));
    await act(async () => {});

    // The newer opt-in was answered: sharing is on and positions go out.
    act(() => geolocation!.watchers.at(-1)!.success(position()));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));
    expect(result.current.state.status).toBe("sharing");
    // And the stale rejection didn't make the hook ask again.
    expect(enabledArgs(api)).toEqual([true, false, true]);
  });
});

describe("an opt-in that fails with a network error or a 5xx", () => {
  it("sends no positions until the server confirms sharing is on", async () => {
    const api = fakeApi();
    const optInCall = deferred<Run>();
    api.setSharing.mockReturnValueOnce(optInCall.promise);
    const { result } = setUp({ api });
    act(() => result.current.optIn());

    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await act(async () => {});
    expect(api.sendPosition).not.toHaveBeenCalled();

    // Confirmed: the fix held back meanwhile goes out at once.
    await act(async () => optInCall.resolve(run({ locationSharing: true })));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));
  });

  it("retries the opt-in once the connection is back, and only then sends", async () => {
    const api = fakeApi();
    api.setSharing.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result, connectivity } = setUp({ api });
    act(() => result.current.optIn());
    await waitFor(() => expect(connectivity.reportFailure).toHaveBeenCalled());
    act(() => connectivity.setState("offline")); // what reportFailure does for real
    act(() => geolocation!.watchers[0].success(position({ timestamp: 0 })));
    await act(async () => {});
    expect(api.sendPosition).not.toHaveBeenCalled();

    // A retry tick while still offline doesn't try again.
    act(() => connectivity.retry());
    expect(api.setSharing).toHaveBeenCalledTimes(1);

    act(() => connectivity.setState("online"));
    await waitFor(() => expect(enabledArgs(api)).toEqual([true, true]));
    await waitFor(() => expect(api.sendPosition).toHaveBeenCalledTimes(1));
  });

  it("retries a 5xx on the connectivity retry tick, without reporting a network failure", async () => {
    const api = fakeApi();
    api.setSharing.mockRejectedValueOnce(new ApiError(503, "Unavailable"));
    const { result, connectivity } = setUp({ api });
    act(() => result.current.optIn());
    await act(async () => {});
    expect(connectivity.reportFailure).not.toHaveBeenCalled();

    act(() => connectivity.retry());

    await waitFor(() => expect(enabledArgs(api)).toEqual([true, true]));
    expect(result.current.state.status).toBe("requesting");
  });

  it("shows an error after 3 failures in a row, and a tap tries again", async () => {
    const api = fakeApi();
    api.setSharing.mockRejectedValue(new ApiError(500, "x"));
    const { result, connectivity } = setUp({ api });
    act(() => result.current.optIn());
    await act(async () => {});
    act(() => connectivity.retry());
    await act(async () => {});
    act(() => connectivity.retry());

    await waitFor(() => expect(result.current.state).toMatchObject({ status: "error", errorCode: "server" }));
    expect(api.setSharing).toHaveBeenCalledTimes(3);
    expect(geolocation!.clearWatch).toHaveBeenCalled();
    // In the error state the retry tick doesn't ask any more...
    act(() => connectivity.retry());
    await act(async () => {});
    expect(api.setSharing).toHaveBeenCalledTimes(3);
    expect(api.setSharing).not.toHaveBeenCalledWith("run-1", { enabled: false });

    // ...the driver's tap does.
    api.setSharing.mockResolvedValue(run({ locationSharing: true }));
    act(() => result.current.retry());
    expect(result.current.state.status).toBe("requesting");
    expect(api.setSharing).toHaveBeenCalledTimes(4);
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
