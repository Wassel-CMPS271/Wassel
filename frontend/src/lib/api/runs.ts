// Runs API types — SCRUM-232, written from docs/contracts/runs.md (the source of
// truth for every type and path here). Types only: the calls are added with the
// screens that use them (SCRUM-243/244 for the driver, SCRUM-255 for the head of
// transportation), through request() in client.ts.
//
//   GET  /api/driver/runs/today                                  -> DriverDay (creates today's runs)
//   POST /api/driver/runs/{runId}/start                          -> Run
//   POST /api/driver/runs/{runId}/end                            -> Run
//   PUT  /api/driver/runs/{runId}/students/{studentId}/confirmation  { status } -> Run
//   GET  /api/head-of-transport/runs?date=                       -> RunsDay (today when date is omitted)
//   GET  /api/head-of-transport/absences?date=                   -> AbsentStudent[] (today when date is omitted)
//
// Dates are "YYYY-MM-DD" and times of day "HH:mm", both school-local (Asia/Beirut).
// Moments (startedAt, endedAt, confirmation.at) are ISO-8601 UTC with a "Z".

import type { RouteDriver, RouteVehicle, Stop } from "./routes";

export type RunDirection = "MORNING" | "AFTERNOON";
export type RunState = "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";
// A holiday is a 200 with runs: [], not an error.
export type DayType = "SCHOOL_DAY" | "HALF_DAY" | "HOLIDAY";
export type ConfirmationStatus = "PICKED_UP" | "DROPPED_OFF" | "NOT_PRESENT";

// The body of the confirmation PUT.
export interface ConfirmationInput {
  status: ConfirmationStatus;
}

export interface Confirmation {
  status: ConfirmationStatus;
  at: string; // moment
}

// One student on one run. Afternoon runs: arrivalTime is null and the stops are
// the morning order reversed (position renumbered 1..n).
export interface RunStop extends Stop {
  guardianName: string;
  guardianPhone: string;
  // A parent reported this student absent for the run's date. A confirmation
  // always wins over this in what the screen shows.
  absent: boolean;
  // The latest confirmation, or null when there is none yet.
  confirmation: Confirmation | null;
}

export interface RunCounts {
  students: number; // stops on the run, absent ones included
  absent: number;
  pickedUp: number; // PICKED_UP or DROPPED_OFF
  droppedOff: number;
  notPresent: number;
}

export interface RunRoute {
  id: string;
  name: string;
}

// A run without its stops: what the head of transportation's list returns.
export interface RunSummary {
  id: string;
  date: string;
  direction: RunDirection;
  state: RunState;
  // The school's arrival time (morning) or dismissal time (afternoon). Null when
  // the school has not set it, and always null for an afternoon run on a half-day.
  schoolTime: string | null;
  startedAt: string | null;
  endedAt: string | null;
  route: RunRoute;
  vehicle: RouteVehicle;
  driver: RouteDriver;
  counts: RunCounts;
}

export interface Run extends RunSummary {
  stops: RunStop[]; // in position order
}

// HOLIDAY means the school is closed; SCHOOL_DAY or HALF_DAY with no runs means
// this driver has no route. The current run is the first one not FINISHED.
// A stop is skippable when absent with no confirmation. It is done on a morning
// run at any confirmation, on an afternoon run at DROPPED_OFF or NOT_PRESENT.
// The next stop is the first one neither done nor skippable.
export interface DriverDay {
  date: string;
  dayType: DayType;
  runs: Run[];
}

// Grouped by route in GET /routes order, each route's morning before its afternoon.
// Empty runs on a SCHOOL_DAY or HALF_DAY only means no runs were made for that date.
export interface RunsDay {
  date: string;
  dayType: DayType;
  runs: RunSummary[];
}

// An absence seen from the school's side. A student with no route has both route and position null.
export interface AbsentStudent {
  absenceId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  fromDate: string;
  toDate: string;
  route: RunRoute | null;
  position: number | null;
}
