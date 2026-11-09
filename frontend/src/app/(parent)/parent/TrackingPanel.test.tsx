import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Child } from "@/lib/api/myChildren";
import type { BusLocation } from "@/lib/api/parentTracking";
import { ApiError } from "@/lib/api/errors";
import { TrackingPanel } from "./TrackingPanel";
vi.mock("@/components/map/MapView", () => ({ MapView: (p: { label: string }) => <div role="region" aria-label={p.label} /> }));
afterEach(() => vi.useRealTimers());
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
  view.rerender(<TrackingPanel child={{ ...child, studentId: "b", firstName: "Omar" }} api={api} />); expect(screen.queryByRole("region")).not.toBeInTheDocument(); expect(screen.getByText("Loading bus locationâ€¦")).toBeVisible();
});
it("offers sign-in after session expiry and reveals no old coordinates", async () => { render(<TrackingPanel child={child} api={vi.fn().mockRejectedValue(new ApiError(401))} />); expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login"); expect(screen.queryByRole("region")).not.toBeInTheDocument(); });
it("ages a fix out even when its next poll never resolves", async () => {
  vi.useFakeTimers(); const api = vi.fn().mockResolvedValueOnce(fix).mockReturnValue(new Promise(() => {}));
  render(<TrackingPanel child={child} api={api} />); await act(async () => {}); await act(async () => vi.advanceTimersByTimeAsync(51_000)); expect(screen.getByText(/position is stale/)).toBeVisible();
  await act(async () => vi.advanceTimersByTimeAsync(250_000)); expect(screen.queryByRole("region")).not.toBeInTheDocument(); expect(screen.getByText("Bus location is unavailable.")).toBeVisible();
});
