import { expect, it } from "vitest";
import type {
  ConfirmationStatus,
  DriverDay,
  Run,
  RunDirection,
  RunState,
  RunStop,
} from "@/lib/api/runs";
import { currentRun, isDone, isSkippable, stopStates } from "./today";

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
