// The live control screen's view of today's active runs (SCRUM-274): GET /runs joined with
// GET /runs/locations on run.id === location.runId. Pure, so the screen and its tests share it.
//
// Every field is the server's, as it came. The client never re-classifies freshness (status is the
// server's LIVE / STALE / UNAVAILABLE until the next poll) and never decides lateness: the contract
// forbids comparing plannedTime with the live estimate (docs/contracts/runs.md, "Planned and live are
// different things"), so the two stay in separate fields.

import type {
  BusPosition,
  Estimate,
  LocationStatus,
  RunLocation,
  RunSummary,
} from "@/lib/api/runs";

// Why an UNAVAILABLE run has no position, from RunSummary.locationSharing (head-only nuance in the
// contract): false is "driver not sharing", true is "no recent position" (no fix yet, or older than 5 min).
export type UnavailableReason = "NOT_SHARING" | "NO_RECENT_POSITION";

export interface NextStopView {
  studentId: string;
  firstName: string;
  lastName: string;
  // The schedule, "HH:mm" school-local. Null on an afternoon run or when the stop has no planned time.
  plannedTime: string | null;
  // The server's live estimate (arrivesAt moment + secondsAway). Null unless freshness is LIVE, and null
  // when the stop has no pin. Never combined with plannedTime: `secondsAway: 0` is not "arrived" either.
  liveEstimate: Estimate | null;
}

export interface ActiveRunView {
  run: RunSummary;
  // Null when the run is IN_PROGRESS in /runs but has no row in /locations yet (the two reads race, or
  // /locations hasn't answered). The screen says "position unknown"; it is not UNAVAILABLE.
  freshness: LocationStatus | null;
  // Set only when freshness is UNAVAILABLE.
  unavailableReason: UnavailableReason | null;
  // Present exactly when freshness is LIVE or STALE (the server's rule). ageSeconds is the server's.
  position: BusPosition | null;
  // Stops still to do; null without a location row.
  remainingStops: number | null;
  // Null when remainingStops is 0 or there is no location row.
  nextStop: NextStopView | null;
  // Reserved for a lateness flag the server does not send yet (SCRUM-274 plan, gap G1). Always null until a
  // head-of-transport endpoint provides one; map that field here. Never fill it from plannedTime and
  // liveEstimate.
  serverLateFlag: null;
}

// The runs IN_PROGRESS in /runs, in its order (GET /routes order), each with its location row if any.
// A location whose run isn't IN_PROGRESS in /runs (a run started or ended between the two reads) is
// ignored until the next poll brings both in line. `locations` is null before /locations first answers.
export function activeRunViews(
  runs: readonly RunSummary[],
  locations: readonly RunLocation[] | null,
): ActiveRunView[] {
  const byRunId = new Map((locations ?? []).map((location) => [location.runId, location]));
  return runs
    .filter((run) => run.state === "IN_PROGRESS")
    .map((run) => toView(run, byRunId.get(run.id) ?? null));
}

function toView(run: RunSummary, location: RunLocation | null): ActiveRunView {
  if (!location) {
    return {
      run,
      freshness: null,
      unavailableReason: null,
      position: null,
      remainingStops: null,
      nextStop: null,
      serverLateFlag: null,
    };
  }
  const { status, nextStop } = location;
  return {
    run,
    freshness: status,
    unavailableReason:
      status === "UNAVAILABLE" ? (run.locationSharing ? "NO_RECENT_POSITION" : "NOT_SHARING") : null,
    position: location.position,
    remainingStops: location.remainingStops,
    nextStop: nextStop && {
      studentId: nextStop.studentId,
      firstName: nextStop.firstName,
      lastName: nextStop.lastName,
      plannedTime: nextStop.plannedTime,
      // The server already sends null unless LIVE; this keeps a stray one from showing next to "Last seen".
      liveEstimate: status === "LIVE" ? nextStop.estimate : null,
    },
    serverLateFlag: null,
  };
}
