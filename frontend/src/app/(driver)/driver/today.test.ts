import { expect, it } from "vitest";
import type {
  ConfirmationStatus,
  DriverDay,
  Run,
  RunDirection,
  RunState,
  RunStop,
} from "@/lib/api/runs";
import type { QueueItem, QueueItemState } from "@/lib/offline/queue";
import { currentRun, isDone, isSkippable, nextConfirmations, projectRun, stopStates } from "./today";

function stop(position: number, absent = false, status: ConfirmationStatus | null = null): RunStop {
  return {
    studentId: `s-${position}`,
    position,
    firstName: "Student",
    lastName: `${position}`,
    address: "Beirut",
    latitude: null,
    longitude: null,
    arrivalTime: null,
    guardianName: "Guardian",
    guardianPhone: "+961 3 000 000",
    absent,
    confirmation: status ? { status, at: "2026-10-21T04:00:00Z" } : null,
    removedFromRoute: false,
  } as RunStop;
}

function run(direction: RunDirection, stops: RunStop[], state: RunState = "IN_PROGRESS"): Run {
  return { id: `${direction}-${state}`, direction, state, stops } as Run;
}

it("takes the first run that is not finished as the current one", () => {
  const morning = run("MORNING", [], "FINISHED");
  const afternoon = run("AFTERNOON", [], "NOT_STARTED");
  const day = {
    date: "2026-10-21",
    dayType: "SCHOOL_DAY",
    runs: [morning, afternoon],
  } as DriverDay;

  expect(currentRun(day)).toBe(afternoon);
  expect(currentRun({ ...day, runs: [morning] })).toBeNull();
});

it("counts any confirmation as done on a morning run", () => {
  const morning = run("MORNING", []);
  expect(isDone(morning, stop(1, false, "PICKED_UP"))).toBe(true);
  expect(isDone(morning, stop(1, false, "NOT_PRESENT"))).toBe(true);
  expect(isDone(morning, stop(1))).toBe(false);
});

it("counts only DROPPED_OFF or NOT_PRESENT as done on an afternoon run", () => {
  const afternoon = run("AFTERNOON", []);
  expect(isDone(afternoon, stop(1, false, "PICKED_UP"))).toBe(false);
  expect(isDone(afternoon, stop(1, false, "DROPPED_OFF"))).toBe(true);
  expect(isDone(afternoon, stop(1, false, "NOT_PRESENT"))).toBe(true);
});

it("makes an absent stop skippable only without a confirmation", () => {
  expect(isSkippable(stop(1, true))).toBe(true);
  expect(isSkippable(stop(1, true, "PICKED_UP"))).toBe(false);
  expect(isSkippable(stop(1, false))).toBe(false);
});

it("marks the first stop neither done nor skippable as next, keeping position order", () => {
  const morning = run("MORNING", [
    stop(1, false, "PICKED_UP"),
    stop(2, true, "NOT_PRESENT"),
    stop(3, true),
    stop(4),
    stop(5),
  ]);
  expect(stopStates(morning)).toEqual(["done", "done", "skip", "next", "pending"]);
});

it("keeps an afternoon PICKED_UP stop as the next one, since the student is still on the bus", () => {
  const afternoon = run("AFTERNOON", [
    stop(1, false, "DROPPED_OFF"),
    stop(2, false, "PICKED_UP"),
    stop(3),
  ]);
  expect(stopStates(afternoon)).toEqual(["done", "next", "pending"]);
});

it("has no next stop when every stop is done or skippable", () => {
  expect(stopStates(run("MORNING", [stop(1, false, "PICKED_UP"), stop(2, true)]))).toEqual([
    "done",
    "skip",
  ]);
});

it("offers only the confirmations the contract allows from each status", () => {
  const inProgress = run("MORNING", []);
  expect(nextConfirmations(inProgress, stop(1))).toEqual(["PICKED_UP", "NOT_PRESENT"]);
  expect(nextConfirmations(inProgress, stop(1, true))).toEqual(["PICKED_UP", "NOT_PRESENT"]);
  expect(nextConfirmations(inProgress, stop(1, false, "NOT_PRESENT"))).toEqual(["PICKED_UP"]);
  expect(nextConfirmations(inProgress, stop(1, false, "PICKED_UP"))).toEqual(["DROPPED_OFF"]);
  expect(nextConfirmations(inProgress, stop(1, false, "DROPPED_OFF"))).toEqual([]);
});

it("offers no confirmations unless the run is in progress", () => {
  expect(nextConfirmations(run("MORNING", [], "NOT_STARTED"), stop(1))).toEqual([]);
  expect(nextConfirmations(run("MORNING", [], "FINISHED"), stop(1))).toEqual([]);
});

function queueItem(
  overrides: Partial<QueueItem> & { runId: string; studentId: string; status: ConfirmationStatus },
): QueueItem {
  return {
    id: `q-${overrides.studentId}-${overrides.status}`,
    clientRequestId: `k-${overrides.studentId}-${overrides.status}`,
    runDate: "2026-10-21",
    occurredAt: "2026-10-21T05:00:00Z",
    createdAt: 0,
    attempts: 0,
    state: "queued" as QueueItemState,
    ...overrides,
  };
}

it("projectRun leaves the run alone with no items for it", () => {
  const morning = run("MORNING", [stop(1)]);
  expect(projectRun(morning, [])).toBe(morning);
  const otherRun = queueItem({ runId: "some-other-run", studentId: "s-1", status: "PICKED_UP" });
  expect(projectRun(morning, [otherRun])).toBe(morning);
});

it("projectRun overlays a queued tap as that student's confirmation", () => {
  const morning = run("MORNING", [stop(1), stop(2)]);
  const item = queueItem({ runId: morning.id, studentId: "s-1", status: "PICKED_UP" });

  const projected = projectRun(morning, [item]);

  expect(projected.stops[0].confirmation).toEqual({ status: "PICKED_UP", at: item.occurredAt });
  expect(projected.stops[1]).toBe(morning.stops[1]); // untouched
  // So the derived screens see it too: PICKED_UP marks a morning stop done at once.
  expect(stopStates(projected)).toEqual(["done", "next"]);
  expect(nextConfirmations(projected, projected.stops[0])).toEqual(["DROPPED_OFF"]);
});

it.each(["sending", "error", "blocked"] as const)(
  "projectRun also overlays a %s item, not only queued",
  (state) => {
    const morning = run("MORNING", [stop(1)]);
    const item = queueItem({ runId: morning.id, studentId: "s-1", status: "NOT_PRESENT", state });

    expect(projectRun(morning, [item]).stops[0].confirmation).toEqual({
      status: "NOT_PRESENT",
      at: item.occurredAt,
    });
  },
);

it("projectRun keeps the most advanced tap when the same student has two unsent items", () => {
  const morning = run("MORNING", [stop(1)]);
  const pickedUp = queueItem({ runId: morning.id, studentId: "s-1", status: "PICKED_UP", state: "error" });
  const droppedOff = queueItem({
    runId: morning.id,
    studentId: "s-1",
    status: "DROPPED_OFF",
    state: "blocked",
  });

  const projected = projectRun(morning, [pickedUp, droppedOff]);

  expect(projected.stops[0].confirmation?.status).toBe("DROPPED_OFF");
  // DROPPED_OFF already offers nothing further, even though it hasn't synced yet.
  expect(nextConfirmations(projected, projected.stops[0])).toEqual([]);
});

it("projectRun ignores a conflict (the server disagrees) and trusts the server's own stop instead", () => {
  const morning = run("MORNING", [stop(1, false, "PICKED_UP")]);
  const item = queueItem({ runId: morning.id, studentId: "s-1", status: "DROPPED_OFF", state: "conflict" });

  expect(projectRun(morning, [item])).toBe(morning);
});

it("projectRun ignores a synced item, already reflected in the run itself", () => {
  const morning = run("MORNING", [stop(1, false, "PICKED_UP")]);
  const item = queueItem({ runId: morning.id, studentId: "s-1", status: "PICKED_UP", state: "synced" });

  expect(projectRun(morning, [item])).toBe(morning);
});

it("projectRun never shows a status below the one the server already has", () => {
  const morning = run("MORNING", [stop(1, false, "DROPPED_OFF"), stop(2, false, "PICKED_UP")]);
  const behind = queueItem({ runId: morning.id, studentId: "s-1", status: "PICKED_UP" });
  const same = queueItem({ runId: morning.id, studentId: "s-2", status: "PICKED_UP" });

  expect(projectRun(morning, [behind, same]).stops).toEqual(morning.stops);
});
