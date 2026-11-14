import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Child } from "@/lib/api/myChildren";
import type { BusLocation } from "@/lib/api/parentTracking";
import { ApiError } from "@/lib/api/errors";
import { TrackingPanel } from "./TrackingPanel";
vi.mock("@/components/map/MapView", () => ({ MapView: () => <div role="region" aria-label="Bus map" /> }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const child: Child = { studentId: "a", firstName: "Lina", lastName: "Test", route: null, driver: null, vehicle: null, expectedPickupTime: "07:20", todayRun: { state: "IN_PROGRESS", direction: "MORNING", stopsLeft: 2 } };
const live: BusLocation = { status: "LIVE", position: { latitude: 33.8961, longitude: 35.4823, accuracyMeters: 12.5, receivedAt: "2026-10-21T04:15:50Z", ageSeconds: 10 }, stopsLeft: 2, plannedTime: "07:18", estimate: { arrivesAt: "2026-10-21T04:21:50Z", secondsAway: 350 } };
it("keeps ETA disabled by default even if a future backend returns it", async () => {
  render(<TrackingPanel child={child} api={vi.fn().mockResolvedValue(live)} />);
  await screen.findByRole("region"); expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});
it("anchors countdown to server seconds and monotonic elapsed time despite device clock skew", async () => {
  vi.useFakeTimers(); vi.spyOn(Date, "now").mockReturnValue(new Date("2036-01-01").getTime());
  const api = vi.fn().mockResolvedValueOnce(live).mockReturnValue(new Promise(() => {}));
  render(<TrackingPanel child={child} api={api} etaEnabled />); await act(async () => {});
  expect(screen.getByRole("timer")).toHaveTextContent("5m 50s");
  await act(async () => vi.advanceTimersByTimeAsync(5000)); expect(screen.getByRole("timer")).toHaveTextContent("5m 45s");
  expect(screen.getByText("Stops remaining: 2")).toBeVisible();
  await act(async () => vi.advanceTimersByTimeAsync(46000)); expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(screen.getByText(/position is stale/)).toBeVisible();
});
it("never interprets zero seconds as confirmed arrival", async () => {
  render(<TrackingPanel child={child} api={vi.fn().mockResolvedValue({ ...live, stopsLeft: 0, estimate: { ...live.estimate!, secondsAway: 0 } })} etaEnabled />);
  expect(await screen.findByRole("timer")).toHaveTextContent("Bus is due. Waiting for confirmation");
  expect(screen.queryByText(/bus has arrived/i)).not.toBeInTheDocument();
});
it.each(["STALE", "UNAVAILABLE"])("keeps progress but hides countdown when GPS is %s", async status => {
  render(<TrackingPanel child={child} api={vi.fn().mockResolvedValue({ ...live, status, position: status === "STALE" ? { ...live.position!, ageSeconds: 140 } : null, estimate: null })} etaEnabled />);
  await screen.findByText("Stops remaining: 2"); expect(screen.queryByRole("timer")).not.toBeInTheDocument(); expect(screen.getByText(/Planned pickup: 07:18/)).toBeVisible();
});
it("does not replace a missing afternoon plan with the morning pickup", async () => {
  render(<TrackingPanel child={{ ...child, todayRun: { ...child.todayRun!, direction: "AFTERNOON" } }} api={vi.fn().mockResolvedValue({ ...live, plannedTime: null, estimate: null })} etaEnabled />);
  expect(await screen.findByText(/Planned drop-off: Not available/)).toBeVisible(); expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(screen.queryByText(/Planned morning pickup/)).not.toBeInTheDocument();
});
it("clears an estimate during child switching and ignores the old response", async () => {
  let resolve!: (value: BusLocation) => void;
  const api = vi.fn().mockResolvedValueOnce(live).mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const view = render(<TrackingPanel child={child} api={api} etaEnabled />); await screen.findByRole("timer");
  view.rerender(<TrackingPanel child={{ ...child, studentId: "b" }} api={api} etaEnabled />);
  expect(screen.queryByRole("timer")).not.toBeInTheDocument(); expect(screen.queryByRole("region")).not.toBeInTheDocument();
  await act(async () => resolve({ status: "UNAVAILABLE", position: null, stopsLeft: 1, plannedTime: null, estimate: null }));
  expect(screen.getByText("Stops remaining: 1")).toBeVisible(); expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});
it.each([401, 403, 404, 500])("clears ETA on HTTP %s and supports the appropriate recovery", async status => {
  vi.useFakeTimers(); const api = vi.fn().mockResolvedValueOnce(live).mockRejectedValueOnce(new ApiError(status)).mockResolvedValue(live);
  render(<TrackingPanel child={child} api={api} etaEnabled />); await act(async () => {}); expect(screen.getByRole("timer")).toBeVisible();
  await act(async () => vi.advanceTimersByTimeAsync(15000)); expect(screen.queryByRole("timer")).not.toBeInTheDocument(); expect(screen.queryByRole("region")).not.toBeInTheDocument();
  if (status === 401) expect(screen.getByRole("link", { name: "Sign in" })).toBeVisible();
  else { fireEvent.click(screen.getByRole("button", { name: "Retry tracking" })); await act(async () => {}); expect(screen.getByRole("timer")).toBeVisible(); }
});
