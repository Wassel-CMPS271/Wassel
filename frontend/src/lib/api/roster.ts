// Roster API — SCRUM-287, built against docs/contracts/roster.md (the source
// of truth for every type and path here). Pausing, archiving and placing a
// student on the best route.
//
//   PUT  /api/head-of-transport/students/{id}/status      { status } -> Student
//   GET  /api/head-of-transport/students/{id}/best-route  -> BestRoute
//   POST /api/head-of-transport/students/{id}/best-route  -> BestRoutePlacement (201)
//
// Pausing or archiving takes the student off their route; going back to
// active leaves them on no route. A refused change (409) changes nothing.
//
// Errors: a bad status is a 400 ApiValidationError on `status`. Best route
// for a student who is not active is a 409 ApiValidationError on `studentId`.
// Every other 409 (archived to paused, on a bus today, already on a route, no
// pin, no school arrival time, no feasible route, lost the seat) is an
// ApiError whose message is the backend's user-ready detail. The GET throws the
// same precondition 409s as the POST.

import { request } from "./client";
import type { Route } from "./routes";
import type { Student, StudentStatus } from "./students";

// A route that can take the student, and where.
export interface RouteOption {
  routeId: string;
  routeName: string;
  position: number; // the stop number the student would get, 1-based
  extraMinutes: number; // driving minutes the student adds to the route
  arrivalTime: string; // "HH:mm", school-local: the pickup time they would get
  seatsLeft: number; // before the student takes one
}

// More reasons may be added: show a generic text for one you don't know.
export interface SkippedRoute {
  routeId: string;
  routeName: string;
  reason: "FULL" | "STARTS_TOO_EARLY" | (string & {});
}

// Every route of the school is in options or in skipped, never both.
export interface BestRoute {
  studentId: string;
  recommended: RouteOption | null; // options[0]; null when no route can take the student
  options: RouteOption[]; // best first
  skipped: SkippedRoute[];
}

// Where the POST put the student, and the route as it is now.
export interface BestRoutePlacement {
  position: number;
  extraMinutes: number;
  arrivalTime: string; // "HH:mm"
  route: Route;
}

const STUDENTS_PATH = "/api/head-of-transport/students";

function studentPath(studentId: string): string {
  return `${STUDENTS_PATH}/${encodeURIComponent(studentId)}`;
}

// Asking for the status the student already has is a 200 that changes nothing.
export function setStudentStatus(studentId: string, status: StudentStatus): Promise<Student> {
  return request<Student>(`${studentPath(studentId)}/status`, { method: "PUT", body: { status } });
}

// Ranks the routes without changing anything. Can take a few seconds (one
// road-provider matrix per route with a seat).
export function getBestRoute(studentId: string): Promise<BestRoute> {
  return request<BestRoute>(`${studentPath(studentId)}/best-route`);
}

// Always places on the recommended route, at its position. No body.
export function placeStudentOnBestRoute(studentId: string): Promise<BestRoutePlacement> {
  return request<BestRoutePlacement>(`${studentPath(studentId)}/best-route`, { method: "POST" });
}
