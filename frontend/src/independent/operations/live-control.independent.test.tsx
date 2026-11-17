import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RunSummary } from "@/lib/api/runs";
import { candidate } from "@/test-support/operationsCandidate";

// Default HEAD is the delivery gate. A fetched, immutable SCRUM-274 head can
// be selected explicitly for early independent review, without feature overlays.
const ref = process.env.WASSEL_CONTROL_CANDIDATE || "HEAD";
const folder = "app/(head-of-transport)/head-of-transport/live/";
// The agreed SCRUM-274 DTO is not exported by accepted HEAD yet. Keep the
// contract shape in this test; do not fabricate a production adapter/export.
interface RunLocation {
 runId: string; status: "LIVE" | "STALE" | "UNAVAILABLE";
 position: { latitude: number; longitude: number; accuracyMeters: number; receivedAt: string; ageSeconds: number } | null;
 remainingStops: number;
 nextStop: { studentId: string; firstName: string; lastName: string; plannedTime: string | null; estimate: { arrivesAt: string; secondsAway: number } | null } | null;
}
interface View {
 run: RunSummary; freshness: "LIVE" | "STALE" | "UNAVAILABLE" | null;
 position: RunLocation["position"]; remainingStops: number | null;
 unavailableReason: "NOT_SHARING" | "NO_RECENT_POSITION" | null;
 nextStop: { studentId: string; firstName: string; lastName: string; plannedTime: string | null; liveEstimate: { arrivesAt: string; secondsAway: number } | null } | null;
}
const views = (runs: RunSummary[], locations: RunLocation[] | null) => candidate<{ activeRunViews(r: RunSummary[], l: RunLocation[] | null): View[] }>(folder + "liveRuns.ts", ref).activeRunViews(runs, locations);
const run: RunSummary = {
 id: "run-1", date: "2026-11-17", direction: "MORNING", state: "IN_PROGRESS", schoolTime: "08:00",
 startedAt: "2026-11-17T05:00:00Z", endedAt: null, route: { id: "route-1", name: "Hamra" },
 driver: { id: "driver-1", firstName: "Rami", lastName: "Haddad" }, vehicle: { id: "vehicle-1", plateNumber: "TEST", capacity: 4 },
 counts: { students: 4, absent: 1, pickedUp: 2, droppedOff: 0, notPresent: 0 }, locationSharing: true,
};
const location: RunLocation = { runId: run.id, status: "LIVE", position: { latitude: 33.88, longitude: 35.52, accuracyMeters: 12, receivedAt: "2026-11-17T05:01:00Z", ageSeconds: 2 }, remainingStops: 2,
 nextStop: { studentId: "child-1", firstName: "Lina", lastName: "Saleh", plannedTime: "07:10", estimate: { arrivesAt: "2026-11-17T05:12:00Z", secondsAway: 120 } },
};
const api = () => candidate<{ getRunLocations(): Promise<RunLocation[]>; reassignRun(id: string, body: unknown): Promise<RunSummary>; getRunReassignments(id: string): Promise<unknown[]> }>("lib/api/runs.ts", ref);
function answer(body: unknown, status = 200) { const fetcher = vi.fn().mockResolvedValue(Response.json(body, { status })); vi.stubGlobal("fetch", fetcher); return fetcher; }
afterEach(() => vi.unstubAllGlobals());

it("joins unordered locations by run id and excludes not-started/finished runs", () => {
 const other = { ...run, id: "other" }; const result = views([run, { ...run, id: "pending", state: "NOT_STARTED" }, other, { ...run, id: "done", state: "FINISHED" }], [{ ...location, runId: "other", remainingStops: 7 }, location]);
 expect(result.map(v => [v.run.id, v.remainingStops])).toEqual([[run.id, 2], ["other", 7]]);
});
it("has an honest empty result for no active runs or holiday", () => expect(views([], [])).toEqual([]));
it("keeps a missing location unknown rather than inventing a bus position or ETA", () => {
 expect(views([run], null)[0]).toMatchObject({ freshness: null, position: null, remainingStops: null, nextStop: null });
});
it("keeps the server's STALE fix but never a stale live estimate", () => {
 const result = views([run], [{ ...location, status: "STALE" }])[0];
 expect(result.freshness).toBe("STALE"); expect(result.position).toEqual(location.position); expect(result.nextStop?.liveEstimate).toBeNull();
});
it.each([[false, "NOT_SHARING"], [true, "NO_RECENT_POSITION"]] as const)("distinguishes head-visible unavailable reasons with sharing=%s", (sharing, reason) => {
 expect(views([{ ...run, locationSharing: sharing }], [{ ...location, status: "UNAVAILABLE", position: null, nextStop: null }])[0]).toMatchObject({ freshness: "UNAVAILABLE", unavailableReason: reason, position: null });
});
it("preserves zero remaining stops without creating an extra next stop", () => {
 expect(views([run], [{ ...location, remainingStops: 0, nextStop: null }])[0]).toMatchObject({ remainingStops: 0, nextStop: null });
});
function row(view: View, notRefreshing?: Date) {
 const Row = candidate<{ RunControlRow: ComponentType<{ view: View; onReassign(): void; positionsNotRefreshingSince?: Date }> }>(folder + "RunControlRow.tsx", ref).RunControlRow;
 const reassign = vi.fn(); render(<ul><Row view={view} onReassign={reassign} positionsNotRefreshingSince={notRefreshing} /></ul>); return reassign;
}
it("shows planned pickup and server live estimate separately, with a named actionable reassign button", () => {
 const click = row(views([run], [location])[0]); expect(screen.getByText("Planned")).toBeVisible(); expect(screen.getByText("Live estimate")).toBeVisible();
 expect(screen.getByText("Next stop: Lina Saleh")).toBeVisible(); expect(screen.getByText("2 stops left")).toBeVisible();
 const button = screen.getByRole("button", { name: "Reassign driver for Hamra (morning)" }); expect(button.style.minHeight).toBe("44px"); fireEvent.click(button); expect(click).toHaveBeenCalledOnce();
});
it("withdraws the live label and estimate when location polling fails", () => {
 row(views([run], [location])[0], new Date("2026-11-17T05:02:00Z"));
 expect(screen.queryByText("Live", { exact: true })).not.toBeInTheDocument(); expect(screen.queryByText("Live estimate", { exact: true })).not.toBeInTheDocument();
 expect(screen.getByText(/Position as of.*not refreshing/)).toBeVisible(); expect(screen.getByText(/No live estimate: positions not refreshing/)).toBeVisible();
});
it("shows directional confirmation progress without counting absent afternoon children as dropoffs", () => {
 row(views([{ ...run, direction: "AFTERNOON", counts: { ...run.counts, droppedOff: 1 } }], [location])[0]);
 expect(screen.getByRole("heading", { name: "Hamra (afternoon)" })).toBeVisible(); expect(screen.getByText(/Dropped off 1 of 3/)).toBeVisible();
});
it("reads actual school-scoped locations with session cookies and no supplied ownership", async () => {
 const f = answer([location]); expect(await api().getRunLocations()).toEqual([location]);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/api\/head-of-transport\/runs\/locations$/), expect.objectContaining({ method: "GET", credentials: "include" })); expect(f.mock.calls[0][1].body).toBeUndefined();
});
it("sends the seen-driver concurrency guard and preserves the authoritative reassignment/counts", async () => {
 const updated = { ...run, driver: { id: "driver-2", firstName: "Nour", lastName: "Ali" } }; const f = answer(updated, 201);
 expect(await api().reassignRun(run.id, { driverId: "driver-2", fromDriverId: run.driver.id, reason: "Vehicle issue" })).toEqual(updated);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/runs\/run-1\/reassignments$/), expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify({ driverId: "driver-2", fromDriverId: "driver-1", reason: "Vehicle issue" }) }));
 expect(updated.counts).toEqual(run.counts);
});
it("loads reassignment history without erasing audit records", async () => {
 const history = [{ id: "audit-1", reason: "Vehicle issue" }]; const f = answer(history); expect(await api().getRunReassignments(run.id)).toEqual(history);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/runs\/run-1\/reassignments$/), expect.objectContaining({ method: "GET", credentials: "include" }));
});
it.each([400, 401, 403, 404, 409, 500])("retains HTTP %s for field/auth/ownership/conflict/retry handling without a fake success", async status => {
 answer({ detail: "Reassignment refused" }, status); await expect(api().reassignRun(run.id, { driverId: "driver-2", fromDriverId: run.driver.id })).rejects.toMatchObject({ status });
});
