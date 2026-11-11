import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverGpsApi } from "@/lib/api/driverGps";
import { ApiError } from "@/lib/api/errors";
import type { Run } from "@/lib/api/runs";
import type { Connectivity } from "@/lib/offline/connectivity";
import { GpsSharingCard } from "./GpsSharingCard";

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

function fakeApi(): DriverGpsApi {
  return {
    setSharing: vi.fn().mockResolvedValue(run()),
    sendPosition: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeConnectivity(): Connectivity & { retry: () => void } {
  const retryListeners = new Set<() => void>();
  return {
    getState: () => "online",
    subscribe: () => () => {},
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
  };
}

function positionError(code: 1 | 2 | 3): GeolocationPositionError {
  return { code, message: "x", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

let geolocation: ReturnType<typeof fakeGeolocation> | undefined;

function setSecureContext(secure: boolean) {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: secure });
}

beforeEach(() => {
  setSecureContext(true);
});

afterEach(() => {
  cleanup();
  geolocation = undefined;
  delete (navigator as { geolocation?: unknown }).geolocation;
  delete (navigator as { permissions?: unknown }).permissions;
  delete (window as { isSecureContext?: unknown }).isSecureContext;
});

function setUp(overrides: { run?: Run; api?: DriverGpsApi | null } = {}) {
  geolocation = fakeGeolocation();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
  const api = overrides.api === undefined ? fakeApi() : overrides.api;
  const connectivity = fakeConnectivity();
  const onRunChange = vi.fn();
  const onRefreshRequested = vi.fn();
  render(
    <GpsSharingCard
      run={overrides.run ?? run()}
      api={api}
      connectivity={connectivity}
      onRunChange={onRunChange}
      onRefreshRequested={onRefreshRequested}
    />,
  );
  return { api, connectivity, onRunChange, onRefreshRequested };
}

describe("GpsSharingCard", () => {
  it("shows the non-interactive Soon pattern while the GPS API is null", () => {
    setUp({ api: null });

    expect(screen.getByText("Soon")).toBeInTheDocument();
    const label = screen.getByText("Share your live location");
    expect(label).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says location isn't available on this device/browser when the API exists but geolocation doesn't", () => {
    const api = fakeApi();
    render(
      <GpsSharingCard
        run={run()}
        api={api}
        connectivity={fakeConnectivity()}
        onRunChange={vi.fn()}
        onRefreshRequested={vi.fn()}
      />,
    );

    expect(screen.getByText(/isn't available on this device or browser/)).toBeInTheDocument();
    expect(screen.queryByText("Soon")).not.toBeInTheDocument();
  });

  it("shows the opt-in button and an explanation, and requests nothing until it's tapped", () => {
    setUp();

    expect(
      screen.getByText(/Share your live location with the head of transportation/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share my location" })).toBeInTheDocument();
    expect(geolocation!.watchPosition).not.toHaveBeenCalled();
  });

  it("shows Requesting… right after the driver opts in", () => {
    setUp();

    act(() => screen.getByRole("button", { name: "Share my location" }).click());

    expect(screen.getByText("Requesting your location…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Requesting…" })).toBeDisabled();
  });

  it("calls onRunChange with the Run setSharing resolves with", async () => {
    const { onRunChange } = setUp();

    act(() => screen.getByRole("button", { name: "Share my location" }).click());

    await waitFor(() => expect(onRunChange).toHaveBeenCalledWith(run()));
  });

  it("shows sharing with a dot and Stop sharing once a fix arrives, and opting out returns to off", () => {
    setUp();
    act(() => screen.getByRole("button", { name: "Share my location" }).click());

    act(() =>
      geolocation!.watchers[0].success({
        coords: { latitude: 33.9, longitude: 35.5, accuracy: 10 },
        timestamp: 0,
      } as GeolocationPosition),
    );

    expect(screen.getByText(/Sharing your location/)).toBeInTheDocument();
    const stop = screen.getByRole("button", { name: "Stop sharing" });

    act(() => stop.click());

    expect(screen.getByRole("button", { name: "Share my location" })).toBeInTheDocument();
  });

  it("explains the run isn't in progress yet, and lets the driver still opt in early", () => {
    setUp({ run: run({ state: "NOT_STARTED" }) });

    act(() => screen.getByRole("button", { name: "Share my location" }).click());

    expect(
      screen.getByText("Location sharing is only active while this run is in progress."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeInTheDocument();
  });

  it("explains that sharing only works while the screen is open, when paused for that reason", () => {
    setUp();
    act(() => screen.getByRole("button", { name: "Share my location" }).click());
    act(() =>
      geolocation!.watchers[0].success({
        coords: { latitude: 33.9, longitude: 35.5, accuracy: 10 },
        timestamp: 0,
      } as GeolocationPosition),
    );

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(screen.getByText(/only works while this screen is open/)).toBeInTheDocument();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("shows the denied message with Try again and Stop sharing", () => {
    setUp();
    act(() => screen.getByRole("button", { name: "Share my location" }).click());

    act(() => geolocation!.watchers[0].error?.(positionError(1)));

    expect(screen.getByRole("alert")).toHaveTextContent("Location access is blocked");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeInTheDocument();
  });

  it("shows a timeout message for error code 3, and a generic one for code 2", () => {
    setUp();
    act(() => screen.getByRole("button", { name: "Share my location" }).click());
    act(() => geolocation!.watchers[0].error?.(positionError(3)));
    expect(screen.getByRole("alert")).toHaveTextContent("taking too long");

    cleanup();
    setUp();
    act(() => screen.getByRole("button", { name: "Share my location" }).click());
    act(() => geolocation!.watchers[0].error?.(positionError(2)));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't get your location");
  });

  it("retry after an error requests again", () => {
    setUp();
    act(() => screen.getByRole("button", { name: "Share my location" }).click());
    act(() => geolocation!.watchers[0].error?.(positionError(2)));

    act(() => screen.getByRole("button", { name: "Try again" }).click());

    expect(screen.getByText("Requesting your location…")).toBeInTheDocument();
    expect(geolocation!.watchPosition).toHaveBeenCalledTimes(2);
  });

  it("says sharing was stopped when the server refuses it, asks the page to refetch, and Try again asks again", async () => {
    const api = fakeApi();
    vi.mocked(api.setSharing).mockRejectedValueOnce(new ApiError(409, "Run is not in progress"));
    const { onRefreshRequested } = setUp({ api });

    act(() => screen.getByRole("button", { name: "Share my location" }).click());

    expect(await screen.findByText("Location sharing was stopped for this run.")).toBeInTheDocument();
    expect(onRefreshRequested).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeInTheDocument();

    act(() => screen.getByRole("button", { name: "Try again" }).click());

    expect(screen.getByText("Requesting your location…")).toBeInTheDocument();
    expect(api.setSharing).toHaveBeenCalledTimes(2);
  });

  it("shows a connection error once turning sharing on keeps failing", async () => {
    const api = fakeApi();
    vi.mocked(api.setSharing).mockRejectedValue(new ApiError(503, "Unavailable"));
    const { connectivity } = setUp({ api });
    act(() => screen.getByRole("button", { name: "Share my location" }).click());
    await act(async () => {});
    act(() => connectivity.retry());
    await act(async () => {});
    act(() => connectivity.retry());

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't turn on location sharing");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
