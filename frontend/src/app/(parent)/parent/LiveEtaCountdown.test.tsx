import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveEtaCountdown } from "./LiveEtaCountdown";
import { TrackingPanel } from "./TrackingPanel";
import { family } from "@/test-support/parentNavigation";
vi.mock("@/components/map/MapView", () => ({ MapView: () => <div role="region" aria-label="Bus map" /> }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const estimate = { arrivesAt: "2026-11-09T07:01:05Z", secondsAway: 65 };
// These four cases preserve the retired countdown's safety coverage on the
// actual server-duration presentation. No device Date subtraction is retained.
it("never derives a countdown from a missing or unverified estimate", () => {
 const view = render(<LiveEtaCountdown estimate={null} elapsedSeconds={0} />); expect(screen.queryByRole("timer")).not.toBeInTheDocument();
 view.rerender(<LiveEtaCountdown estimate={{ ...estimate, secondsAway: -1 }} elapsedSeconds={0} />); expect(screen.getByText("Live arrival estimate is unavailable.")).toBeVisible();
});
it("updates a valid server estimate every second despite device wall-clock skew", async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date("2036-01-01T00:00:00Z"));
 const api = vi.fn().mockResolvedValue({ status: "LIVE", position: { latitude: 33.9, longitude: 35.5, accuracyMeters: 12, receivedAt: "2026-11-09T07:00:00Z", ageSeconds: 0 }, stopsLeft: 2, plannedTime: "09:00", estimate });
 render(<TrackingPanel child={family[0]} api={api} etaEnabled />); await act(async () => {}); expect(screen.getByRole("timer")).toHaveTextContent("1m 5s");
 await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(screen.getByRole("timer")).toHaveTextContent("1m 4s");
});
it("does not claim the bus arrived after an estimate expires", () => {
 render(<LiveEtaCountdown estimate={{ ...estimate, secondsAway: 1 }} elapsedSeconds={2} />); expect(screen.getByRole("timer")).toHaveTextContent("Bus is due. Waiting for confirmation or an updated estimate.");
 expect(screen.queryByText(/bus has arrived/i)).not.toBeInTheDocument();
});
it("does not display an invalid date as an estimate", () => {
 render(<LiveEtaCountdown estimate={{ ...estimate, arrivesAt: "bad" }} elapsedSeconds={0} />); expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});
