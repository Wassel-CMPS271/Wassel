// Runs API types — SCRUM-232, written from docs/contracts/runs.md (the source of
// truth for every type and path here). The calls sit beside the types and go through
// request() in client.ts: the driver's (SCRUM-243/244), the head of transportation's
// reads (SCRUM-255) and the reassignment (SCRUM-264).
//
//   GET  /api/driver/runs/today                                  -> DriverDay (creates today's runs)
//   POST /api/driver/runs/{runId}/start                          -> Run
//   POST /api/driver/runs/{runId}/end                            -> Run
//   PUT  /api/driver/runs/{runId}/students/{studentId}/confirmation  { status } -> Run
//   GET  /api/head-of-transport/runs?date=                       -> RunsDay (today when date is omitted)
//   GET  /api/head-of-transport/absences?date=                   -> AbsentStudent[] (today when date is omitted)
//   POST /api/head-of-transport/runs/{runId}/reassignments  ReassignInput -> RunSummary (SCRUM-264; 201 changed, 200 already that driver)
//   GET  /api/head-of-transport/runs/{runId}/reassignments       -> Reassignment[] (newest first)
//   GET  /api/head-of-transport/runs/locations                   -> RunLocation[] (SCRUM-261/262, today's runs IN_PROGRESS)
//
// Dates are "YYYY-MM-DD" and times of day "HH:mm", both school-local (Asia/Beirut).
// Moments (startedAt, endedAt, confirmation.at) are ISO-8601 UTC with a "Z".

import { request } from "./client";
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
  // true while the driver is sharing this run's position. Only the driver and the head of
  // transportation get this; a parent never learns why a position is missing.
  locationSharing: boolean;
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

// The body of the reassignment POST. fromDriverId is the driver the head saw on the run (run.driver.id): the
// server answers 409 when the route's driver is someone else by then. reason is at most 200 characters.
export interface ReassignInput {
  driverId: string;
  fromDriverId: string;
  reason?: string | null;
}

// One change of a route's driver, made through a run. The list for a run holds every change of that run's route
// on that run's date, so the afternoon run lists a change made through the morning run.
export interface Reassignment {
  id: string;
  runId: string;
  direction: RunDirection;
  runState: "NOT_STARTED" | "IN_PROGRESS";
  fromDriver: RouteDriver;
  toDriver: RouteDriver;
  changedBy: { id: string; email: string | null };
  changedAt: string; // moment
  reason: string | null;
}

// LIVE: a fix up to 60s old. STALE: 60s to 5 minutes old, position kept. UNAVAILABLE: no row, sharing off,
// no fix yet, or older than 5 minutes (position null). Decide what to draw from this, never from position alone.
export type LocationStatus = "LIVE" | "STALE" | "UNAVAILABLE";

// Present exactly when status is LIVE or STALE. receivedAt is the server's moment; ageSeconds is the whole
// seconds between it and the server's clock when the answer was made, so a client never needs its own clock.
export interface BusPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  receivedAt: string; // moment
  ageSeconds: number;
}

// arrivesAt is a moment (UTC, "Z"); secondsAway is never negative, so a countdown never needs the client's clock.
// Null unless status is LIVE, and null when the target stop has no pin.
export interface Estimate {
  arrivesAt: string; // moment
  secondsAway: number;
}

// The first stop still to do in the run's order; null exactly when remainingStops is 0.
export interface NextStop {
  studentId: string;
  firstName: string;
  lastName: string;
  plannedTime: string | null; // "HH:mm", school-local. Null on an afternoon run or with no planned time.
  estimate: Estimate | null;
}

// The head of transportation's live view of today's runs IN_PROGRESS (SCRUM-261/262). No order: match by
// runId. [] on a holiday. UNAVAILABLE + RunSummary.locationSharing === false means "not sharing"; with it
// true, "no fresh position".
export interface RunLocation {
  runId: string;
  status: LocationStatus;
  position: BusPosition | null;
  remainingStops: number; // stops still to do (neither done nor skippable)
  nextStop: NextStop | null;
}

export function getDriverToday(): Promise<DriverDay> {
  return request<DriverDay>("/api/driver/runs/today");
}

export function startRun(runId: string): Promise<Run> {
  return request<Run>(`/api/driver/runs/${runId}/start`, { method: "POST" });
}

export function endRun(runId: string): Promise<Run> {
  return request<Run>(`/api/driver/runs/${runId}/end`, { method: "POST" });
}

export function confirmStudent(
  runId: string,
  studentId: string,
  status: ConfirmationStatus,
): Promise<Run> {
  return request<Run>(`/api/driver/runs/${runId}/students/${studentId}/confirmation`, {
    method: "PUT",
    body: { status },
  });
}

// The head of transportation's Today screen (SCRUM-255). Today when `date` is omitted; asking for another
// date only reads runs that already exist. Until SCRUM-233 and SCRUM-239 are merged the screen uses
// runsSample.ts instead; the PR that switches to these deletes it.
export function getRunsDay(date?: string): Promise<RunsDay> {
  return request<RunsDay>(`/api/head-of-transport/runs${dateQuery(date)}`);
}

export function getAbsentStudents(date?: string): Promise<AbsentStudent[]> {
  return request<AbsentStudent[]>(`/api/head-of-transport/absences${dateQuery(date)}`);
}

// Gives the run's route to another driver from now on (both of today's runs and every later day). A 409 with an
// `errors.driverId` is a refused replacement (ApiValidationError); a 409 with only a `detail` (stale driver, finished
// run, not today's) is an ApiError to show as a banner with a reload.
export function reassignRun(runId: string, input: ReassignInput): Promise<RunSummary> {
  return request<RunSummary>(`/api/head-of-transport/runs/${runId}/reassignments`, {
    method: "POST",
    body: input,
  });
}

export function getRunReassignments(runId: string): Promise<Reassignment[]> {
  return request<Reassignment[]>(`/api/head-of-transport/runs/${runId}/reassignments`);
}

// The live control screen (SCRUM-274): position, progress and ETA for every run of the school that is
// IN_PROGRESS today, in no particular order. [] on a holiday. Join with getRunsDay() on run.id === runId.
export function getRunLocations(): Promise<RunLocation[]> {
  return request<RunLocation[]>("/api/head-of-transport/runs/locations");
}

function dateQuery(date?: string): string {
  return date === undefined ? "" : `?date=${encodeURIComponent(date)}`;
}
