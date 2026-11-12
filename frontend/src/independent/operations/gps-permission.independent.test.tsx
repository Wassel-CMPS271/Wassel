import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { candidate } from "@/test-support/operationsCandidate";
interface Result { state: { status: string; consent: boolean }; optIn(): void; optOut(): void; }
const originalSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
let denied!: PositionErrorCallback;
const watch = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => { denied = error; return 7; });
const clear = vi.fn();
const api = { setSharing: vi.fn().mockImplementation(async (_id: string, v: { enabled: boolean }) => ({ id: "run-a", state: "IN_PROGRESS", locationSharing: v.enabled })), sendPosition: vi.fn().mockResolvedValue(undefined) };
const connectivity = { getState: () => "online", subscribe: () => () => {}, reportSuccess: vi.fn(), reportFailure: vi.fn(), onRetry: () => () => {} };
function hook() { return candidate<{ useGpsSharing(opts: object): Result }>("app/(driver)/driver/useGpsSharing.ts").useGpsSharing; }
beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(window, "isSecureContext", { configurable: true, value: true }); vi.stubGlobal("navigator", { geolocation: { watchPosition: watch, clearWatch: clear } }); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); if (originalSecure) Object.defineProperty(window, "isSecureContext", originalSecure); else Reflect.deleteProperty(window, "isSecureContext"); });
const run = { id: "run-a", state: "IN_PROGRESS", locationSharing: false };
const onRunChange = vi.fn();
const onRefreshRequested = vi.fn();
it("does not touch browser GPS or the server before a deliberate opt-in", () => { const useGpsSharing = hook(); renderHook(() => useGpsSharing({ run, api, connectivity, onRunChange, onRefreshRequested })); expect(watch).not.toHaveBeenCalled(); expect(api.setSharing).not.toHaveBeenCalled(); expect(api.sendPosition).not.toHaveBeenCalled(); });
it("starts only on opt-in and stops both watch and sharing on opt-out", async () => { const useGpsSharing = hook(); const { result } = renderHook(() => useGpsSharing({ run, api, connectivity, onRunChange, onRefreshRequested })); act(() => result.current.optIn()); await waitFor(() => expect(watch).toHaveBeenCalledTimes(1)); expect(api.setSharing).toHaveBeenCalledWith("run-a", { enabled: true }); act(() => result.current.optOut()); await waitFor(() => expect(clear).toHaveBeenCalledWith(7)); expect(api.setSharing).toHaveBeenCalledWith("run-a", { enabled: false }); });
it("handles actual browser permission denial and ceases sending", async () => { const useGpsSharing = hook(); const { result } = renderHook(() => useGpsSharing({ run, api, connectivity, onRunChange, onRefreshRequested })); act(() => result.current.optIn()); await waitFor(() => expect(watch).toHaveBeenCalled()); act(() => denied({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })); await waitFor(() => expect(result.current.state.status).toBe("denied")); expect(clear).toHaveBeenCalledWith(7); expect(api.sendPosition).not.toHaveBeenCalled(); });
it("withdraws when the active run finishes", async () => { const useGpsSharing = hook(); const { result, rerender } = renderHook(({ state }) => useGpsSharing({ run: { ...run, state }, api, connectivity, onRunChange, onRefreshRequested }), { initialProps: { state: "IN_PROGRESS" } }); act(() => result.current.optIn()); await waitFor(() => expect(watch).toHaveBeenCalled()); rerender({ state: "FINISHED" }); await waitFor(() => expect(clear).toHaveBeenCalledWith(7)); expect(api.setSharing).toHaveBeenCalledWith("run-a", { enabled: false }); });
