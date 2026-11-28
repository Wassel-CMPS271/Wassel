import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGpsSharing } from "@/app/(driver)/driver/useGpsSharing";
import { driverGpsApi } from "@/lib/api/driverGps";
import { createConnectivity, type Connectivity } from "@/lib/offline/connectivity";
import { driverRun, pathOf, response } from "@/test-support/operationsContract";

const originalSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
let denied!: PositionErrorCallback; let fix!: PositionCallback;
const watch = vi.fn((success: PositionCallback, error: PositionErrorCallback) => { fix = success; denied = error; return 7; });
const clear = vi.fn();
let connectivity: Connectivity;
let fetcher: ReturnType<typeof vi.fn>;
const run = driverRun({ locationSharing: false });
const onRunChange = vi.fn(); const onRefreshRequested = vi.fn();
const sharingPath = `/api/driver/runs/${run.id}/location-sharing`;
const positionPath = `/api/driver/runs/${run.id}/location`;
const sharingCalls = () => fetcher.mock.calls.filter(([input]) => pathOf(input) === sharingPath);
const positionCalls = () => fetcher.mock.calls.filter(([input]) => pathOf(input) === positionPath);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  vi.stubGlobal("navigator", { geolocation: { watchPosition: watch, clearWatch: clear }, onLine: true });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  connectivity = createConnectivity(); connectivity.reportSuccess();
  fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init).toMatchObject({ method: "PUT", credentials: "include" });
    if (pathOf(input) === sharingPath) return response({ ...run, locationSharing: JSON.parse(String(init?.body)).enabled });
    if (pathOf(input) === positionPath) return response(undefined, 204);
    throw new Error(`Unexpected GPS request: ${input}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  cleanup(); await act(async () => {}); connectivity.dispose();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (originalSecure) Object.defineProperty(window, "isSecureContext", originalSecure);
  else Reflect.deleteProperty(window, "isSecureContext");
});

it("does not touch browser GPS or the server before a deliberate opt-in", () => {
  renderHook(() => useGpsSharing({ run, api: driverGpsApi, connectivity, onRunChange, onRefreshRequested }));
  expect(watch).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
it("starts only on opt-in and stops both watch and sharing on opt-out", async () => {
  const { result } = renderHook(() => useGpsSharing({ run, api: driverGpsApi, connectivity, onRunChange, onRefreshRequested }));
  act(() => result.current.optIn()); await waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
  expect(JSON.parse(sharingCalls()[0][1].body)).toEqual({ enabled: true });
  expect(onRunChange).toHaveBeenCalledWith({ ...run, locationSharing: true });
  act(() => result.current.optOut()); await waitFor(() => expect(clear).toHaveBeenCalledWith(7));
  await waitFor(() => expect(sharingCalls()).toHaveLength(2));
  expect(JSON.parse(sharingCalls()[1][1].body)).toEqual({ enabled: false });
});
it("handles actual browser permission denial and ceases sending", async () => {
  const { result } = renderHook(() => useGpsSharing({ run, api: driverGpsApi, connectivity, onRunChange, onRefreshRequested }));
  act(() => result.current.optIn()); await waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
  act(() => denied({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));
  await waitFor(() => expect(result.current.state.status).toBe("denied"));
  expect(clear).toHaveBeenCalledWith(7); expect(positionCalls()).toHaveLength(0);
});
it("withdraws when the active run finishes", async () => {
  const { result, rerender } = renderHook(({ activeRun }) => useGpsSharing({ run: activeRun, api: driverGpsApi, connectivity, onRunChange, onRefreshRequested }), { initialProps: { activeRun: run } });
  act(() => result.current.optIn()); await waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
  rerender({ activeRun: { ...run, state: "FINISHED" } });
  await waitFor(() => expect(clear).toHaveBeenCalledWith(7));
  await waitFor(() => expect(sharingCalls()).toHaveLength(2));
  expect(JSON.parse(sharingCalls()[1][1].body)).toEqual({ enabled: false });
});
it("sends a real authenticated position only after opt-in, with no client identity or timestamp", async () => {
  const { result } = renderHook(() => useGpsSharing({ run, api: driverGpsApi, connectivity, onRunChange, onRefreshRequested }));
  expect(positionCalls()).toHaveLength(0);
  act(() => result.current.optIn()); await waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
  const coords = { latitude: 33.88, longitude: 35.52, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null };
  const timestamp = Date.now();
  act(() => fix({ coords: { ...coords, toJSON: () => coords }, timestamp, toJSON: () => ({ coords, timestamp }) }));
  await waitFor(() => expect(positionCalls()).toHaveLength(1));
  expect(JSON.parse(positionCalls()[0][1].body)).toEqual({ latitude: 33.88, longitude: 35.52, accuracyMeters: 12 });
});
