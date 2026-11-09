import type { ConfirmationStatus, DriverDay, Run, RunStop } from "@/lib/api/runs";

// The rules from the comments on DriverDay and RunStop in lib/api/runs.ts.

export type StopState = "done" | "skip" | "next" | "pending";

// The current run is the first one not FINISHED; null when every run is.
export function currentRun(day: DriverDay): Run | null {
  return day.runs.find((run) => run.state !== "FINISHED") ?? null;
}

// Morning: any confirmation. Afternoon: only DROPPED_OFF or NOT_PRESENT, since
// a PICKED_UP student is still on the bus.
export function isDone(run: Run, stop: RunStop): boolean {
  const { confirmation } = stop;
  if (!confirmation) return false;
  if (run.direction === "MORNING") return true;
  return confirmation.status === "DROPPED_OFF" || confirmation.status === "NOT_PRESENT";
}

// A confirmation always wins over the absence.
export function isSkippable(stop: RunStop): boolean {
  return stop.absent && stop.confirmation === null;
}

// One state per stop, in the run's order. The next stop is the first one
// neither done nor skippable.
export function stopStates(run: Run): StopState[] {
  let nextFound = false;
  return run.stops.map((stop) => {
    if (isDone(run, stop)) return "done";
    if (isSkippable(stop)) return "skip";
    if (nextFound) return "pending";
    nextFound = true;
    return "next";
  });
}

// The confirmations the driver can still record for a stop, in button order:
// the moves docs/contracts/runs.md#confirmations allows, and nothing while the
// run isn't in progress (the server refuses every one with a 409). The same
// status again is a no-op, so it isn't offered either; there is no undo.
export function nextConfirmations(run: Run, stop: RunStop): ConfirmationStatus[] {
  if (run.state !== "IN_PROGRESS") return [];
  switch (stop.confirmation?.status ?? null) {
    case null:
      return ["PICKED_UP", "NOT_PRESENT"];
    case "NOT_PRESENT":
      return ["PICKED_UP"];
    case "PICKED_UP":
      return ["DROPPED_OFF"];
    case "DROPPED_OFF":
      return [];
  }
}
