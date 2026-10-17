// Routes API — SCRUM-218/219, built against docs/contracts/routing.md (the
// source of truth for every type and path here). Morning pickup, one school.
//
//   GET    /api/head-of-transport/routes            -> RouteSummary[]
//   POST   /api/head-of-transport/routes            { name, vehicleId, driverId } -> Route (201)
//   GET    /api/head-of-transport/routes/{routeId}  -> Route
//   PUT    /api/head-of-transport/routes/{routeId}  { name, vehicleId, driverId } -> Route
//   DELETE /api/head-of-transport/routes/{routeId}  -> 204
//   POST   /api/head-of-transport/routes/{routeId}/students  { studentId } -> Route (SCRUM-209)
//   DELETE /api/head-of-transport/routes/{routeId}/students/{studentId} -> Route (SCRUM-209)
//   PUT    /api/head-of-transport/routes/{routeId}/stops  { studentIds } -> Route (SCRUM-210)
//
// Adding a student who is already on another route moves them; it is not an
// error.
//
// WORKAROUND: the contract has no endpoint for the students who are on no
// route, so listUnassignedStudents() works it out on the client.

import { request } from "./client";
import { getStudents, type Student } from "./students";

// One student on one route. The student is the stop's only identity.
export interface Stop {
  studentId: string;
  position: number; // 1-based
  firstName: string;
  lastName: string;
  address: string | null;
  // Both null (no pin yet) or both set.
  latitude: number | null;
  longitude: number | null;
  // "HH:mm", school-local. Null when the stop has no pin.
  arrivalTime: string | null;
}

export interface RouteVehicle {
  id: string;
  plateNumber: string;
  capacity: number;
}

export interface RouteDriver {
  id: string;
  firstName: string;
  lastName: string;
}

export interface RouteSummary {
  id: string;
  name: string;
  vehicle: RouteVehicle;
  driver: RouteDriver;
  studentCount: number;
  // capacity - studentCount. Negative when the route is over capacity.
  seatsLeft: number;
}

export interface RouteSchool {
  latitude: number;
  longitude: number;
  // Null until an admin sets it; every stop's arrivalTime is null meanwhile.
  arrivalTime: string | null;
}

export interface Route extends RouteSummary {
  school: RouteSchool;
  stops: Stop[]; // in position order
}

export interface StopSequence {
  drivingMinutes: number;
  stops: Stop[];
}

// More codes may be added: show `message` for a code you don't know.
export interface ProposalReason {
  code: "CAPACITY_EXCEEDED" | "ARRIVAL_TIME_UNREACHABLE" | (string & {});
  message: string;
}

export interface Proposal {
  id: string | null; // null when not feasible: nothing is saved
  feasible: boolean;
  current: StopSequence;
  proposed: StopSequence | null; // null when not feasible
  reasons: ProposalReason[]; // empty when feasible
}

// The create and edit body.
export interface RouteInput {
  name: string;
  vehicleId: string;
  driverId: string;
}

interface RoutesApi {
  list(): Promise<RouteSummary[]>;
  get(routeId: string): Promise<Route>;
  create(input: RouteInput): Promise<Route>;
  update(routeId: string, input: RouteInput): Promise<Route>;
  remove(routeId: string): Promise<void>;
  addStudent(routeId: string, studentId: string): Promise<Route>;
  removeStudent(routeId: string, studentId: string): Promise<Route>;
  reorderStops(routeId: string, studentIds: string[]): Promise<Route>;
  unassignedStudents(): Promise<Student[]>;
}

const ROUTES_PATH = "/api/head-of-transport/routes";

function routePath(routeId: string): string {
  return `${ROUTES_PATH}/${encodeURIComponent(routeId)}`;
}

function studentPath(routeId: string, studentId?: string): string {
  const base = `${routePath(routeId)}/students`;
  return studentId === undefined ? base : `${base}/${encodeURIComponent(studentId)}`;
}

// The active students who are not a stop on any of `routes`. An inactive
// student can't ride, so they're never offered for a route.
function subtractAssigned(students: Student[], routes: Route[]): Student[] {
  const assigned = new Set(routes.flatMap((route) => route.stops.map((stop) => stop.studentId)));
  return students.filter((student) => student.status === "active" && !assigned.has(student.id));
}

export const httpRoutes: RoutesApi = {
  list: () => request<RouteSummary[]>(ROUTES_PATH),
  get: (routeId) => request<Route>(routePath(routeId)),
  create: (input) => request<Route>(ROUTES_PATH, { method: "POST", body: input }),
  update: (routeId, input) => request<Route>(routePath(routeId), { method: "PUT", body: input }),
  remove: (routeId) => request(routePath(routeId), { method: "DELETE" }),
  addStudent: (routeId, studentId) =>
    request<Route>(studentPath(routeId), { method: "POST", body: { studentId } }),
  removeStudent: (routeId, studentId) =>
    request<Route>(studentPath(routeId, studentId), { method: "DELETE" }),
  // The full new order: exactly the route's current stops, each once.
  reorderStops: (routeId, studentIds) =>
    request<Route>(`${routePath(routeId)}/stops`, { method: "PUT", body: { studentIds } }),

  // WORKAROUND: the backend has no endpoint for this. The real students minus
  // every route's stops. The list has no stops, so this gets every route: one
  // request per route, fine at MVP size. A student's `route` field is the old
  // text column, not the assignment, so it can't be used instead. Replace this
  // with the endpoint if one is added.
  async unassignedStudents() {
    const [students, summaries] = await Promise.all([getStudents(), httpRoutes.list()]);
    const routes = await Promise.all(summaries.map((summary) => httpRoutes.get(summary.id)));
    return subtractAssigned(students, routes);
  },
};

const api: RoutesApi = httpRoutes;

export function listRoutes(): Promise<RouteSummary[]> {
  return api.list();
}

export function getRoute(routeId: string): Promise<Route> {
  return api.get(routeId);
}

export function createRoute(input: RouteInput): Promise<Route> {
  return api.create(input);
}

export function updateRoute(routeId: string, input: RouteInput): Promise<Route> {
  return api.update(routeId, input);
}

export function deleteRoute(routeId: string): Promise<void> {
  return api.remove(routeId);
}

export function addStudentToRoute(routeId: string, studentId: string): Promise<Route> {
  return api.addStudent(routeId, studentId);
}

export function removeStudentFromRoute(routeId: string, studentId: string): Promise<Route> {
  return api.removeStudent(routeId, studentId);
}

export function reorderStops(routeId: string, studentIds: string[]): Promise<Route> {
  return api.reorderStops(routeId, studentIds);
}

// WORKAROUND: see unassignedStudents above; the backend has no endpoint.
export function listUnassignedStudents(): Promise<Student[]> {
  return api.unassignedStudents();
}
