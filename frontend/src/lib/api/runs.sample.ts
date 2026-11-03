// TEMPORARY — SCRUM-243 built against sample data because SCRUM-233 (backend)
// isn't merged yet. Delete this file and switch the screen's import to
// getDriverToday() in runs.ts once it is. See docs/contracts/runs.md and
// frontend/CLAUDE.md.

import driverTodayJson from "../../../../docs/contracts/samples/runs/driver-today.json";
import { ApiError } from "./errors";
import type {
  ConfirmationStatus,
  DayType,
  DriverDay,
  Run,
  RunCounts,
  RunDirection,
  RunState,
} from "./runs";

// The JSON import widens dayType, direction, state and confirmation.status to
// plain `string`, so only those fields need narrowing to their literal-union
// types. Everything else stays as the JSON infers it, so a real mismatch
// (missing field, wrong nesting, a typo) still fails the `satisfies` check.
type JsonDay = typeof driverTodayJson;
type JsonRun = JsonDay["runs"][number];
type JsonStop = JsonRun["stops"][number];
type JsonConfirmation = NonNullable<JsonStop["confirmation"]>;

type NarrowedStop = Omit<JsonStop, "confirmation"> & {
  confirmation: (Omit<JsonConfirmation, "status"> & { status: ConfirmationStatus }) | null;
};

// startedAt/endedAt are narrowed too: every run in the sample is either
// NOT_STARTED or IN_PROGRESS, so the JSON infers endedAt as the literal `null`
// rather than `string | null`, which breaks once endRunSample sets a real one.
type NarrowedRun = Omit<JsonRun, "direction" | "state" | "stops" | "startedAt" | "endedAt"> & {
  direction: RunDirection;
  state: RunState;
  startedAt: string | null;
  endedAt: string | null;
  stops: NarrowedStop[];
};

type NarrowedDay = Omit<JsonDay, "dayType" | "runs"> & {
  dayType: DayType;
  runs: NarrowedRun[];
};

const driverToday = (driverTodayJson as NarrowedDay) satisfies DriverDay;

// The mutable copy of the sample day: cloned once on first use, then read and
// written by every function below, so start/end/confirm persist across calls
// and getDriverTodaySample() always reflects the latest state.
let mutableDay: NarrowedDay | null = null;

function getMutableDay(): NarrowedDay {
  if (!mutableDay) {
    mutableDay = structuredClone(driverToday);
  }
  return mutableDay;
}

function findRun(runId: string): NarrowedRun {
  const run = getMutableDay().runs.find((r) => r.id === runId);
  if (!run) {
    throw new ApiError(404, "Run not found");
  }
  return run;
}

// Counts are computed from the stops, never hand-adjusted (docs/contracts/runs.md#counts).
function recomputeCounts(run: NarrowedRun): void {
  const counts: RunCounts = {
    students: run.stops.length,
    absent: 0,
    pickedUp: 0,
    droppedOff: 0,
    notPresent: 0,
  };
  for (const stop of run.stops) {
    const status = stop.confirmation?.status;
    if (stop.absent && !stop.confirmation) counts.absent += 1;
    if (status === "PICKED_UP" || status === "DROPPED_OFF") counts.pickedUp += 1;
    if (status === "DROPPED_OFF") counts.droppedOff += 1;
    if (status === "NOT_PRESENT") counts.notPresent += 1;
  }
  run.counts = counts;
}

// The confirmation moves the contract allows, besides the same status again
// (handled separately as a no-op): docs/contracts/runs.md#confirmations.
function canTransitionConfirmation(from: ConfirmationStatus | null, to: ConfirmationStatus): boolean {
  if (from === null) return to === "PICKED_UP" || to === "NOT_PRESENT";
  if (from === "NOT_PRESENT") return to === "PICKED_UP";
  if (from === "PICKED_UP") return to === "DROPPED_OFF";
  return false;
}

export function getDriverTodaySample(): Promise<DriverDay> {
  return new Promise((resolve) => setTimeout(() => resolve(getMutableDay()), 300));
}

// TEMPORARY — SCRUM-244 built against sample data because SCRUM-234 (backend)
// isn't merged yet. Delete this and switch the screen's import to startRun()
// in runs.ts once it is. See docs/contracts/runs.md and frontend/CLAUDE.md.
export function startRunSample(runId: string): Promise<Run> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      let run: NarrowedRun;
      try {
        run = findRun(runId);
      } catch (err) {
        reject(err);
        return;
      }
      if (run.state === "IN_PROGRESS") {
        resolve(run);
        return;
      }
      if (run.state !== "NOT_STARTED") {
        reject(new ApiError(409, "This run can't be started"));
        return;
      }
      run.state = "IN_PROGRESS";
      run.startedAt = new Date().toISOString();
      resolve(run);
    }, 300);
  });
}

// TEMPORARY — SCRUM-244 built against sample data because SCRUM-234 (backend)
// isn't merged yet. Delete this and switch the screen's import to endRun() in
// runs.ts once it is. See docs/contracts/runs.md and frontend/CLAUDE.md.
export function endRunSample(runId: string): Promise<Run> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      let run: NarrowedRun;
      try {
        run = findRun(runId);
      } catch (err) {
        reject(err);
        return;
      }
      if (run.state === "FINISHED") {
        resolve(run);
        return;
      }
      if (run.state !== "IN_PROGRESS") {
        reject(new ApiError(409, "This run can't be ended"));
        return;
      }
      run.state = "FINISHED";
      run.endedAt = new Date().toISOString();
      resolve(run);
    }, 300);
  });
}

// TEMPORARY — SCRUM-244 built against sample data because SCRUM-235 (backend)
// isn't merged yet. Delete this and switch the screen's import to
// confirmStudent() in runs.ts once it is. See docs/contracts/runs.md and
// frontend/CLAUDE.md.
export function confirmStudentSample(
  runId: string,
  studentId: string,
  status: ConfirmationStatus,
): Promise<Run> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      let run: NarrowedRun;
      try {
        run = findRun(runId);
      } catch (err) {
        reject(err);
        return;
      }
      if (run.state !== "IN_PROGRESS") {
        reject(new ApiError(409, "Confirmations are only allowed while a run is in progress"));
        return;
      }
      const stop = run.stops.find((s) => s.studentId === studentId);
      if (!stop) {
        reject(new ApiError(404, "This student is not on this run"));
        return;
      }
      const current = stop.confirmation?.status ?? null;
      if (current === status) {
        resolve(run);
        return;
      }
      if (!canTransitionConfirmation(current, status)) {
        reject(new ApiError(409, "This confirmation can't be recorded"));
        return;
      }
      stop.confirmation = { status, at: new Date().toISOString() };
      recomputeCounts(run);
      resolve(run);
    }, 300);
  });
}
