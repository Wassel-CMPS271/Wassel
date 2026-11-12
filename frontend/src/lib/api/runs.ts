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

function dateQuery(date?: string): string {
  return date === undefined ? "" : `?date=${encodeURIComponent(date)}`;
}
