import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Child } from "@/lib/api/myChildren";
import type { BusLocation } from "@/lib/api/parentTracking";
import { ApiError } from "@/lib/api/errors";
import { TrackingPanel } from "./TrackingPanel";
vi.mock("@/components/map/MapView", () => ({ MapView: (p: { label: string }) => <div role="region" aria-label={p.label} /> }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const child: Child = { studentId: "a", firstName: "Lina", lastName: "Test", route: null, driver: null, vehicle: null, expectedPickupTime: "07:20", todayRun: { state: "IN_PROGRESS", direction: "MORNING", stopsLeft: 2 } };
const fix: BusLocation = { status: "LIVE", position: { latitude: 33.9, longitude: 35.5, accuracyMeters: 12, receivedAt: "2026-11-09T07:00:00Z", ageSeconds: 10 } };
it("has no production fallback when the API is not integrated", () => { render(<TrackingPanel child={child} />); expect(screen.getByText("Live tracking is not available yet.")).toBeVisible(); expect(screen.queryByRole("region")).not.toBeInTheDocument(); });
it("shows no run and never requests a location", () => { const api = vi.fn(); render(<TrackingPanel child={{ ...child, todayRun: null }} api={api} />); expect(screen.getByText("No run today.")).toBeVisible(); expect(api).not.toHaveBeenCalled(); });
it("keeps planned time separate and renders only the selected child's authorized response", async () => {
  const api = vi.fn().mockResolvedValue(fix); render(<TrackingPanel child={child} api={api} />);
  expect(await screen.findByText("Live bus location")).toBeVisible();
  expect(api).toHaveBeenCalledWith("a"); expect(screen.getByRole("region", { name: "Bus location for Lina Test" })).toBeVisible();
  expect(screen.getByText(/Planned morning pickup: 07:20/)).toHaveTextContent("not a live estimate"); expect(screen.getByText(/Live arrival estimate is not available/)).toBeVisible();
});
it("labels stale coordinates as last seen without calling the bus late", async () => { render(<TrackingPanel child={child} api={vi.fn().mockResolvedValue({ ...fix, status: "STALE", position: { ...fix.position, ageSeconds: 140 } })} />); expect(await screen.findByText(/Last seen 140 seconds/)).toBeVisible(); expect(screen.queryByText(/late bus/i)).not.toBeInTheDocument(); });
it("hides the map on an error and supports retry", async () => {
  const api = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(fix); render(<TrackingPanel child={child} api={api} />);
  await screen.findByRole("alert"); expect(screen.queryByRole("region")).not.toBeInTheDocument(); fireEvent.click(screen.getByText("Retry tracking")); await screen.findByText("Live bus location");
});
it("clears the previous child's location immediately on selection change", async () => {
  const api = vi.fn().mockResolvedValueOnce(fix).mockReturnValue(new Promise(() => {}));
  const view = render(<TrackingPanel child={child} api={api} />); await screen.findByRole("region");
  view.rerender(<TrackingPanel child={{ ...child, studentId: "b", firstName: "Omar" }} api={api} />); expect(screen.queryByRole("region")).not.toBeInTheDocument(); expect(screen.getByText("Loading bus location…")).toBeVisible();
});
it("offers sign-in after session expiry and reveals no old coordinates", async () => { render(<TrackingPanel child={child} api={vi.fn().mockRejectedValue(new ApiError(401))} />); expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login"); expect(screen.queryByRole("region")).not.toBeInTheDocument(); });
it("ages a fix out even when its next poll never resolves", async () => {
  vi.useFakeTimers(); const api = vi.fn().mockResolvedValueOnce(fix).mockReturnValue(new Promise(() => {}));
  render(<TrackingPanel child={child} api={api} />); await act(async () => {}); await act(async () => vi.advanceTimersByTimeAsync(51_000)); expect(screen.getByText(/position is stale/)).toBeVisible();
  await act(async () => vi.advanceTimersByTimeAsync(250_000)); expect(screen.queryByRole("region")).not.toBeInTheDocument(); expect(screen.getByText("Bus location is unavailable.")).toBeVisible();
});

it.each([403, 404])("keeps a denied child location private for HTTP %s", async status => {
  render(<TrackingPanel child={child} api={vi.fn().mockRejectedValue(new ApiError(status))} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("not available for this child");
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
it("does not keep polling or expose a map after the child stops waiting", async () => {
  const api = vi.fn().mockResolvedValue(fix); const view = render(<TrackingPanel child={child} api={api} />); await screen.findByRole("region");
  view.rerender(<TrackingPanel child={{ ...child, todayRun: { ...child.todayRun!, stopsLeft: null } }} api={api} />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument(); expect(api).toHaveBeenCalledTimes(1);
});
it("drops the previous route/driver fix before an authorized assignment changes", async () => {
  const api = vi.fn().mockResolvedValueOnce(fix).mockReturnValue(new Promise(() => {}));
  const view = render(<TrackingPanel child={child} api={api} />); await screen.findByRole("region");
  view.rerender(<TrackingPanel child={{ ...child, route: { id: "changed", name: "New route" } }} api={api} />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument(); expect(api).toHaveBeenCalledTimes(2);
});

it.each([401, 403, 404])("stops background tracking after terminal access HTTP %s", async status => {
  vi.useFakeTimers(); const api = vi.fn().mockResolvedValueOnce(fix).mockRejectedValue(new ApiError(status));
  render(<TrackingPanel child={child} api={api} />); await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(15_000)); expect(api).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("alert")).toBeVisible(); expect(screen.queryByRole("region")).not.toBeInTheDocument();
  await act(async () => vi.advanceTimersByTimeAsync(60_000)); expect(api).toHaveBeenCalledTimes(2);
  if (status !== 401) { fireEvent.click(screen.getByText("Retry tracking")); await act(async () => {}); expect(api).toHaveBeenCalledTimes(3); }
});
it.each(["loading", "error"])("does not reuse a morning pickup time for afternoon %s", async phase => {
  const api = vi.fn().mockImplementation(() => phase === "loading" ? new Promise(() => {}) : Promise.reject(new Error("offline")));
  render(<TrackingPanel child={{ ...child, todayRun: { ...child.todayRun!, direction: "AFTERNOON" } }} api={api} />);
  await act(async () => {}); expect(screen.queryByText(/morning/i)).not.toBeInTheDocument(); expect(screen.queryByText(/07:20/)).not.toBeInTheDocument();
  expect(screen.getByText(phase === "loading" ? "Loading bus location…" : "Could not load bus location. Please try again.")).toBeVisible();
});

it("backs off consecutive transient failures and resets the delay after recovery", async () => {
 vi.useFakeTimers(); const api = vi.fn().mockRejectedValueOnce(new ApiError(503)).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(fix);
 render(<TrackingPanel child={child} api={api} />); await act(async () => {}); expect(api).toHaveBeenCalledTimes(1);
 await act(async () => vi.advanceTimersByTimeAsync(15_000)); expect(api).toHaveBeenCalledTimes(2);
 await act(async () => vi.advanceTimersByTimeAsync(29_999)); expect(api).toHaveBeenCalledTimes(2);
 await act(async () => vi.advanceTimersByTimeAsync(1)); expect(api).toHaveBeenCalledTimes(3); expect(screen.getByText("Live bus location")).toBeVisible();
 await act(async () => vi.advanceTimersByTimeAsync(15_000)); expect(api).toHaveBeenCalledTimes(4);
});
it("pauses hidden-tab telemetry and refreshes immediately when visible again", async () => {
 vi.useFakeTimers(); const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false); const api = vi.fn().mockResolvedValue(fix);
 render(<TrackingPanel child={child} api={api} />); await act(async () => {}); expect(api).toHaveBeenCalledTimes(1);
 hidden.mockReturnValue(true); act(() => document.dispatchEvent(new Event("visibilitychange"))); await act(async () => vi.advanceTimersByTimeAsync(120_000)); expect(api).toHaveBeenCalledTimes(1);
 hidden.mockReturnValue(false); await act(async () => document.dispatchEvent(new Event("visibilitychange"))); expect(api).toHaveBeenCalledTimes(2); expect(screen.getByText("Live bus location")).toBeVisible();
});
it("keeps ticking position ages outside the status live region", async () => {
 vi.useFakeTimers(); const api = vi.fn().mockResolvedValueOnce({ ...fix, status: "STALE", position: { ...fix.position, ageSeconds: 140 } }).mockReturnValue(new Promise(() => {}));
 render(<TrackingPanel child={child} api={api} />); await act(async () => {}); expect(screen.getByRole("status")).toHaveTextContent("This position is stale.");
 expect(screen.getByText("Last seen 140 seconds ago.")).toHaveAttribute("aria-live", "off"); await act(async () => vi.advanceTimersByTimeAsync(1000));
 expect(screen.getByRole("status")).toHaveTextContent("This position is stale."); expect(screen.getByText("Last seen 141 seconds ago.")).toHaveAttribute("aria-live", "off");
});
