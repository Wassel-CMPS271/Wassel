import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { BusLocation } from "@/lib/api/parentTracking";
import { family, deferred } from "@/test-support/parentNavigation";
import { ParentTrackingHome } from "./ParentTrackingHome";
vi.mock("@/components/map/MapView", () => ({ MapView: ({ label }: { label: string }) => <div role="region" aria-label={label} /> }));
const fetcher = vi.fn();
const fix: BusLocation = { status: "LIVE", position: { latitude: 33.9, longitude: 35.5, accuracyMeters: 10, ageSeconds: 4, receivedAt: "2026-11-10T07:00:00Z" } };
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false"); fetcher.mockReset().mockResolvedValue(Response.json(family)); vi.stubGlobal("fetch", fetcher); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function open() { await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: "Bus tracking" })); }
it("composes the selected child with real tracking components and discards a late previous-child reply", async () => {
  const late = deferred<BusLocation>(); const api = vi.fn().mockReturnValueOnce(late.promise).mockResolvedValue(fix);
  render(<ParentTrackingHome api={api} />); await open();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: family[1].studentId } });
  await screen.findByRole("region", { name: "Bus location for Omar Navigation" });
  await act(async () => late.resolve({ status: "UNAVAILABLE", position: null }));
  expect(screen.getByText("Live bus location")).toBeVisible(); expect(screen.queryByRole("region", { name: "Bus location for Lina Navigation" })).not.toBeInTheDocument();
  expect(api.mock.calls.map(call => call[0])).toEqual(family.map(child => child.studentId));
});
it("resets tracking selection on an account change even with the same client singleton", async () => {
  const api = vi.fn().mockResolvedValue(fix); const view = render(<ParentTrackingHome accountKey="first" api={api} />); await open(); await screen.findByRole("region");
  fetcher.mockResolvedValue(Response.json([])); view.rerender(<ParentTrackingHome accountKey="second" api={api} />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument(); await screen.findByText("No children linked yet");
  expect(api).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Bus tracking" })).toBeDisabled();
});
it("never draws a live marker for a stale or unavailable server result", async () => {
  const api = vi.fn().mockResolvedValueOnce({ status: "STALE", position: { ...fix.position, ageSeconds: 140 } }).mockResolvedValue({ status: "UNAVAILABLE", position: null });
  render(<ParentTrackingHome api={api} />); await open(); await screen.findByText(/Last seen 140 seconds/);
  expect(screen.queryByText("Live bus location")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: family[1].studentId } });
  await screen.findByText("Bus location is unavailable."); expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});
it("keeps the normal entry unavailable without an integrated client", async () => {
  render(<ParentTrackingHome />); await screen.findByText("Lina Navigation");
  expect(screen.queryByRole("button", { name: "Bus tracking" })).not.toBeInTheDocument(); expect(fetcher).toHaveBeenCalledTimes(1);
});
