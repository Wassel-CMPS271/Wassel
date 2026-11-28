import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getRunLocations, reassignRun, getRunReassignments, type Reassignment } from "@/lib/api/runs";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { activeRunViews, type ActiveRunView } from "@/app/(head-of-transport)/head-of-transport/live/liveRuns";
import { RunControlRow } from "@/app/(head-of-transport)/head-of-transport/live/RunControlRow";
import { controlRun as run, location } from "@/test-support/operationsContract";
const views = activeRunViews;
function answer(body: unknown, status = 200) { const fetcher = vi.fn().mockResolvedValue(Response.json(body, { status })); vi.stubGlobal("fetch", fetcher); return fetcher; }
afterEach(() => vi.unstubAllGlobals());

it("joins unordered active locations by run id and excludes finished runs", () => {
 const other = { ...run, id: "other" }; const result = views([run, other, { ...run, id: "done", state: "FINISHED" }], [{ ...location, runId: "other", remainingStops: 7 }, location]);
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
function row(view: ActiveRunView, notRefreshing?: Date) {
 const reassign = vi.fn(); render(<ul><RunControlRow view={view} onReassign={reassign} positionsNotRefreshingSince={notRefreshing} /></ul>); return reassign;
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
 const f = answer([location]); expect(await getRunLocations()).toEqual([location]);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/api\/head-of-transport\/runs\/locations$/), expect.objectContaining({ method: "GET", credentials: "include" })); expect(f.mock.calls[0][1].body).toBeUndefined();
});
it("sends the seen-driver guard and returns the server receipt including its confirmation counts", async () => {
 const updated = { ...run, driver: { id: "driver-2", firstName: "Nour", lastName: "Ali" } }; const f = answer(updated, 201);
 const receipt = await reassignRun(run.id, { driverId: "driver-2", fromDriverId: run.driver.id, reason: "Vehicle issue" });
 expect(receipt).toEqual(updated);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/runs\/run-1\/reassignments$/), expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify({ driverId: "driver-2", fromDriverId: "driver-1", reason: "Vehicle issue" }) }));
 expect(receipt.counts).toEqual(run.counts);
 expect(receipt.driver).toEqual(updated.driver);
 expect(run.driver.id).toBe("driver-1");
});
it("returns the full reassignment history response without filtering audit records", async () => {
 const history: Reassignment[] = [{ id: "audit-1", runId: run.id, direction: "MORNING", runState: "IN_PROGRESS", fromDriver: run.driver, toDriver: { id: "driver-2", firstName: "Nour", lastName: "Ali" }, changedBy: { id: "head-1", email: "head@example.invalid" }, changedAt: "2026-11-17T05:00:00Z", reason: "Vehicle issue" }]; const f = answer(history); expect(await getRunReassignments(run.id)).toEqual(history);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/runs\/run-1\/reassignments$/), expect.objectContaining({ method: "GET", credentials: "include" }));
});
it.each([400, 401, 403, 404, 409, 500])("propagates HTTP %s to the reassignment caller without retrying or fabricating a receipt", async status => {
 const f = answer({ detail: "Reassignment refused" }, status);
 const pending = reassignRun(run.id, { driverId: "driver-2", fromDriverId: run.driver.id });
 await expect(pending).rejects.toBeInstanceOf(ApiError);
 await expect(pending).rejects.toMatchObject({ status, message: "Reassignment refused" });
 expect(f).toHaveBeenCalledTimes(1);
});

it("preserves a reassignment field-error map for the caller's form", async () => {
 const f = answer({ errors: { driverId: "Select a driver" } }, 400);
 const pending = reassignRun(run.id, { driverId: "", fromDriverId: run.driver.id });
 await expect(pending).rejects.toBeInstanceOf(ApiValidationError);
 await expect(pending).rejects.toMatchObject({ errors: { driverId: "Select a driver" } });
 expect(f).toHaveBeenCalledTimes(1);
});
