import { describe, expect, it } from "vitest";
import type { RunLocation, RunSummary } from "@/lib/api/runs";
import { activeRunViews } from "./liveRuns";

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    date: "2026-11-16",
    direction: "MORNING",
    state: "IN_PROGRESS",
    schoolTime: "08:00",
    startedAt: "2026-11-16T05:00:00Z",
    endedAt: null,
    route: { id: "route-1", name: "Hamra" },
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 14 },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    counts: { students: 5, absent: 0, pickedUp: 2, droppedOff: 0, notPresent: 0 },
    locationSharing: true,
    ...overrides,
  };
}

const position = {
  latitude: 33.89,
  longitude: 35.5,
  accuracyMeters: 12,
  receivedAt: "2026-11-16T05:20:00Z",
  ageSeconds: 8,
};

const estimate = { arrivesAt: "2026-11-16T05:24:00Z", secondsAway: 240 };

function location(overrides: Partial<RunLocation> = {}): RunLocation {
  return {
    runId: "run-1",
    status: "LIVE",
    position,
    remainingStops: 3,
    nextStop: { studentId: "s-3", firstName: "Hadi", lastName: "Rizk", plannedTime: "07:25", estimate },
    ...overrides,
  };
}

describe("activeRunViews", () => {
  it("keeps only IN_PROGRESS runs, in /runs order, matched to locations by runId whatever their order", () => {
    const runs = [
      run({ id: "a", state: "NOT_STARTED" }),
      run({ id: "b" }),
      run({ id: "c", state: "FINISHED" }),
      run({ id: "d" }),
    ];
    const views = activeRunViews(runs, [location({ runId: "d", remainingStops: 1 }), location({ runId: "b" })]);
    expect(views.map((view) => view.run.id)).toEqual(["b", "d"]);
    expect(views[0].remainingStops).toBe(3);
    expect(views[1].remainingStops).toBe(1);
  });

  it("ignores a location whose run is not IN_PROGRESS in /runs (the two reads raced)", () => {
    const views = activeRunViews([run({ id: "a", state: "NOT_STARTED" })], [location({ runId: "a" })]);
    expect(views).toEqual([]);
  });

  it("ignores a location for a run missing from /runs", () => {
    expect(activeRunViews([run()], [location({ runId: "elsewhere" })])).toEqual([
      expect.objectContaining({ freshness: null }),
    ]);
  });

  it("an IN_PROGRESS run without a location row (or before /locations answers) has no freshness, not UNAVAILABLE", () => {
    for (const locations of [null, []]) {
      const [view] = activeRunViews([run()], locations);
      expect(view).toEqual({
        run: run(),
        freshness: null,
        unavailableReason: null,
        position: null,
        remainingStops: null,
        nextStop: null,
        serverLateFlag: null,
      });
    }
  });

  it("LIVE: the server's status, position and estimate as sent, planned and live estimate in separate fields", () => {
    const [view] = activeRunViews([run()], [location()]);
    expect(view.freshness).toBe("LIVE");
    expect(view.unavailableReason).toBeNull();
    expect(view.position).toBe(position);
    expect(view.nextStop).toEqual({
      studentId: "s-3",
      firstName: "Hadi",
      lastName: "Rizk",
      plannedTime: "07:25",
      liveEstimate: estimate,
    });
  });

  it("never decides lateness: an estimate after the planned time still has no late flag", () => {
    const lateLooking = location({
      nextStop: {
        studentId: "s-3",
        firstName: "Hadi",
        lastName: "Rizk",
        plannedTime: "07:00",
        estimate: { arrivesAt: "2026-11-16T06:30:00Z", secondsAway: 4000 },
      },
    });
    const [view] = activeRunViews([run()], [lateLooking]);
    expect(view.serverLateFlag).toBeNull();
    expect(Object.keys(view)).not.toContain("late");
    expect(Object.keys(view.nextStop ?? {})).not.toContain("late");
  });

  it("keeps the server's freshness as sent, never re-classified from ageSeconds", () => {
    const old = { ...position, ageSeconds: 200 };
    const [view] = activeRunViews([run()], [location({ status: "LIVE", position: old })]);
    expect(view.freshness).toBe("LIVE");
    expect(view.position?.ageSeconds).toBe(200);
  });

  it("STALE: position and age kept, no live estimate even if one was sent", () => {
    const stale = { ...position, ageSeconds: 140 };
    const [view] = activeRunViews([run()], [location({ status: "STALE", position: stale })]);
    expect(view.freshness).toBe("STALE");
    expect(view.position).toBe(stale);
    expect(view.unavailableReason).toBeNull();
    expect(view.nextStop?.plannedTime).toBe("07:25");
    expect(view.nextStop?.liveEstimate).toBeNull();
  });

  it("UNAVAILABLE with locationSharing false is NOT_SHARING", () => {
    const [view] = activeRunViews(
      [run({ locationSharing: false })],
      [location({ status: "UNAVAILABLE", position: null })],
    );
    expect(view.freshness).toBe("UNAVAILABLE");
    expect(view.unavailableReason).toBe("NOT_SHARING");
    expect(view.position).toBeNull();
    expect(view.nextStop?.liveEstimate).toBeNull();
  });

  it("UNAVAILABLE with locationSharing true is NO_RECENT_POSITION", () => {
    const [view] = activeRunViews([run()], [location({ status: "UNAVAILABLE", position: null })]);
    expect(view.unavailableReason).toBe("NO_RECENT_POSITION");
  });

  it("an afternoon run's next stop has no planned time; the live estimate stays separate", () => {
    const [view] = activeRunViews(
      [run({ direction: "AFTERNOON" })],
      [location({ nextStop: { studentId: "s-1", firstName: "Sara", lastName: "Khoury", plannedTime: null, estimate } })],
    );
    expect(view.nextStop?.plannedTime).toBeNull();
    expect(view.nextStop?.liveEstimate).toBe(estimate);
  });

  it("a LIVE stop with no pin has no estimate", () => {
    const [view] = activeRunViews(
      [run()],
      [location({ nextStop: { studentId: "s-3", firstName: "Hadi", lastName: "Rizk", plannedTime: "07:25", estimate: null } })],
    );
    expect(view.nextStop?.liveEstimate).toBeNull();
  });

  it("all stops done: remainingStops 0 and no next stop", () => {
    const [view] = activeRunViews([run()], [location({ remainingStops: 0, nextStop: null })]);
    expect(view.remainingStops).toBe(0);
    expect(view.nextStop).toBeNull();
  });

  it("keeps the run object as the server sent it", () => {
    const summary = run();
    const [view] = activeRunViews([summary], [location()]);
    expect(view.run).toBe(summary);
  });
});
