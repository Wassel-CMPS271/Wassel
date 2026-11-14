import type { ConfirmationStatus, DriverDay, Run, RunStop } from "@/lib/api/runs";
import type { QueueItem } from "@/lib/offline/queue";

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

// Overlays the offline queue's unsent taps onto the run the server last answered
// with, so nextConfirmations/stopStates (and so the stop cards and the "N of M
// stops done" line) show what the driver tapped even before it's reached the
// server (SCRUM-273) — the same way the server's own answer is applied the moment
// it arrives, just locally and sooner.
//
// Only "queued"/"sending"/"error"/"blocked" items count: a "conflict" means the
// server disagrees with what's shown, so it must not be trusted for this, and a
// "synced" one is already reflected in `run` itself (the server's answer replaced
// the stop already). Items are in the order they were tapped, so the last one
// kept per student is the most advanced status the driver tapped — matching what
// a driver who tapped Picked up then Dropped off, with neither sent yet, expects
// to see.
export function projectRun(run: Run, items: readonly QueueItem[]): Run {
  const pending = new Map<string, QueueItem>();
  for (const item of items) {
    if (item.runId !== run.id) continue;
    if (item.state === "conflict" || item.state === "synced") continue;
    pending.set(item.studentId, item);
  }
  if (pending.size === 0) return run;
  return {
    ...run,
    stops: run.stops.map((stop) => {
      const item = pending.get(stop.studentId);
      // Never below what the server already has: a student's latest status is
      // the highest one (runs.md), so a queued PICKED_UP behind a DROPPED_OFF
      // another tab already sent mustn't roll the stop back.
      if (!item || STATUS_RANK[item.status] <= rankOf(stop)) return stop;
      return { ...stop, confirmation: { status: item.status, at: item.occurredAt } };
    }),
  };
}

const STATUS_RANK: Record<ConfirmationStatus, number> = {
  NOT_PRESENT: 1,
  PICKED_UP: 2,
  DROPPED_OFF: 3,
};

function rankOf(stop: RunStop): number {
  return stop.confirmation ? STATUS_RANK[stop.confirmation.status] : 0;
}
