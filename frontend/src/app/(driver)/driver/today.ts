import type { DriverDay, Run, RunStop } from "@/lib/api/runs";

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
