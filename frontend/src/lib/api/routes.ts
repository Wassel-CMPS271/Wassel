// Routes API — SCRUM-218, built against docs/contracts/routing.md (the source
// of truth for every type and path here). Morning pickup, one school.
//
//   GET    /api/head-of-transport/routes            -> RouteSummary[]
//   POST   /api/head-of-transport/routes            { name, vehicleId, driverId } -> Route (201)
//   GET    /api/head-of-transport/routes/{routeId}  -> Route
//   PUT    /api/head-of-transport/routes/{routeId}  { name, vehicleId, driverId } -> Route
//   DELETE /api/head-of-transport/routes/{routeId}  -> 204
//   POST   /api/head-of-transport/routes/{routeId}/students  { studentId } -> Route (SCRUM-219)
//   DELETE /api/head-of-transport/routes/{routeId}/students/{studentId} -> Route (SCRUM-219)
//
// WORKAROUND: the contract has no endpoint for the students who are on no
// route, so listUnassignedStudents() works it out on the client (SCRUM-209).
//
// The endpoints are SCRUM-208's and 209's and don't exist yet, so the functions run
// against an in-memory sample client seeded from the contract samples
// (copied into ./samples/routing because the Docker build only sees frontend/).
//
// TEMPORARY: the sample client below and ./samples/routing/ must be deleted
// when SCRUM-208 lands. Point `api` at `httpRoutes` and nothing else changes.

import { request } from "./client";
import { getDrivers } from "./drivers";
import { ApiError, ApiValidationError } from "./errors";
import { getStudents, type Student } from "./students";
import { getVehicles } from "./vehicles";
import sampleProposalInfeasible from "./samples/routing/proposal-infeasible.json";
import sampleProposal from "./samples/routing/proposal.json";
import sampleRoute from "./samples/routing/route.json";
import sampleRouteList from "./samples/routing/routes.json";

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

// The real calls, written against the contract and ready for SCRUM-208/209.
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

  // WORKAROUND: the contract has no endpoint for this (raise with SCRUM-209).
  // The list has no stops, so this fetches every route: one request per route,
  // fine at MVP size. Replace it with the endpoint if one is added.
  async unassignedStudents() {
    const [students, summaries] = await Promise.all([getStudents(), httpRoutes.list()]);
    const routes = await Promise.all(summaries.map((summary) => httpRoutes.get(summary.id)));
    return subtractAssigned(students, routes);
  },
};

// ---------------------------------------------------------------------------
// TEMPORARY sample client. Delete from here to `sampleRoutes` when SCRUM-208
// lands, together with ./samples/routing/.
// ---------------------------------------------------------------------------

const SAMPLE_SCHOOL: RouteSchool = (sampleRoute satisfies Route).school;

// Only route.json is a full Route. The Hamra and Achrafieh stops come from the
// `current` order in the proposal samples (the contract says which is which).
const SAMPLE_STOPS: Record<string, Stop[]> = {
  "10000000-0000-4000-8000-000000000001": (sampleProposal satisfies Proposal).current.stops,
  "10000000-0000-4000-8000-000000000002": (sampleProposalInfeasible satisfies Proposal).current
    .stops,
  [sampleRoute.id]: sampleRoute.stops,
};

// crypto.randomUUID() needs a secure context (HTTPS/localhost); staging runs
// over plain HTTP, so a counter is used instead.
let nextSampleId = 1;

let sampleState: Route[] = (sampleRouteList satisfies RouteSummary[]).map((summary) => ({
  ...structuredClone(summary),
  school: structuredClone(SAMPLE_SCHOOL),
  stops: structuredClone(SAMPLE_STOPS[summary.id] ?? []),
}));

function toSummary({ id, name, vehicle, driver, studentCount, seatsLeft }: Route): RouteSummary {
  return structuredClone({ id, name, vehicle, driver, studentCount, seatsLeft });
}

function findSampleRoute(routeId: string): Route {
  const route = sampleState.find((candidate) => candidate.id === routeId);
  if (!route) {
    throw new ApiError(404, "Route not found.");
  }
  return route;
}

// Stores `route` with these stops, renumbered from 1, and the counts redone.
function withStops(route: Route, stops: Stop[]): Route {
  const updated: Route = {
    ...route,
    stops: stops.map((stop, index) => ({ ...stop, position: index + 1 })),
    studentCount: stops.length,
    seatsLeft: route.vehicle.capacity - stops.length,
  };
  sampleState = sampleState.map((candidate) => (candidate.id === route.id ? updated : candidate));
  return updated;
}

// Applies the contract's create/edit rules: 400 for a blank name, 409 for an
// unknown, inactive or already-used vehicle or driver. `routeId` is the route
// being edited, so it doesn't conflict with itself.
async function resolveSampleInput(
  input: RouteInput,
  routeId?: string,
): Promise<Pick<Route, "name" | "vehicle" | "driver">> {
  const name = input.name.trim();
  if (!name) {
    throw new ApiValidationError({ name: "Name is required." });
  }

  // The form offers the real vehicles and drivers, but the seeded routes use
  // sample ids, so both are accepted.
  const [vehicles, drivers] = await Promise.all([getVehicles(), getDrivers()]);
  const errors: Record<string, string> = {};

  const realVehicle = vehicles.find((vehicle) => vehicle.id === input.vehicleId);
  const vehicle: RouteVehicle | undefined = realVehicle
    ? { id: realVehicle.id, plateNumber: realVehicle.plateNumber, capacity: realVehicle.capacity }
    : sampleState.find((route) => route.vehicle.id === input.vehicleId)?.vehicle;
  const vehicleOnRoute = sampleState.find(
    (route) => route.id !== routeId && route.vehicle.id === input.vehicleId,
  );
  if (!vehicle) {
    errors.vehicleId = "Vehicle not found.";
  } else if (realVehicle && !realVehicle.isActive) {
    errors.vehicleId = "This vehicle is inactive.";
  } else if (vehicleOnRoute) {
    errors.vehicleId = `This vehicle is already on ${vehicleOnRoute.name}.`;
  }

  const realDriver = drivers.find((driver) => driver.id === input.driverId);
  const driver: RouteDriver | undefined = realDriver
    ? { id: realDriver.id, firstName: realDriver.firstName, lastName: realDriver.lastName }
    : sampleState.find((route) => route.driver.id === input.driverId)?.driver;
  const driverOnRoute = sampleState.find(
    (route) => route.id !== routeId && route.driver.id === input.driverId,
  );
  if (!driver) {
    errors.driverId = "Driver not found.";
  } else if (realDriver?.status === "deactivated") {
    errors.driverId = "This driver is deactivated.";
  } else if (driverOnRoute) {
    errors.driverId = `This driver is already on ${driverOnRoute.name}.`;
  }

  if (!vehicle || !driver || Object.keys(errors).length > 0) {
    throw new ApiValidationError(errors);
  }
  return { name, vehicle: structuredClone(vehicle), driver: structuredClone(driver) };
}

const sampleRoutes: RoutesApi = {
  async list() {
    return sampleState.map(toSummary);
  },

  async get(routeId) {
    return structuredClone(findSampleRoute(routeId));
  },

  async create(input) {
    const fields = await resolveSampleInput(input);
    const route: Route = {
      id: `sample-${nextSampleId++}`,
      ...fields,
      studentCount: 0,
      seatsLeft: fields.vehicle.capacity,
      school: structuredClone(SAMPLE_SCHOOL),
      stops: [],
    };
    sampleState = [...sampleState, route];
    return structuredClone(route);
  },

  async update(routeId, input) {
    const existing = findSampleRoute(routeId);
    const fields = await resolveSampleInput(input, routeId);
    const route: Route = {
      ...existing,
      ...fields,
      seatsLeft: fields.vehicle.capacity - existing.studentCount,
    };
    sampleState = sampleState.map((candidate) => (candidate.id === routeId ? route : candidate));
    return structuredClone(route);
  },

  async remove(routeId) {
    findSampleRoute(routeId);
    sampleState = sampleState.filter((route) => route.id !== routeId);
  },

  async addStudent(routeId, studentId) {
    const route = findSampleRoute(routeId);
    // ASSUMPTION: the contract doesn't say what an unknown student answers;
    // 404 matches how it treats an unknown route.
    const student = (await getStudents()).find((candidate) => candidate.id === studentId);
    if (!student) {
      throw new ApiError(404, "Student not found.");
    }
    // ASSUMPTION: the contract is silent on a student who is already on a route
    // (this one or another). 409 until Moustafa confirms (SCRUM-209).
    const current = sampleState.find((candidate) =>
      candidate.stops.some((stop) => stop.studentId === studentId),
    );
    if (current) {
      throw new ApiError(409, `This student is already on ${current.name}.`);
    }
    // Also refuses a route that is already over capacity (seatsLeft < 0).
    if (route.stops.length >= route.vehicle.capacity) {
      throw new ApiError(
        409,
        `This route has ${route.stops.length} students and the vehicle has ${route.vehicle.capacity} seats.`,
      );
    }
    const stop: Stop = {
      studentId: student.id,
      position: 0, // set by withStops
      firstName: student.firstName,
      lastName: student.lastName,
      address: student.address,
      latitude: student.latitude,
      longitude: student.longitude,
      // The sample client doesn't work out arrival times (the backend's
      // arrival-time rule does), so a new stop has none.
      arrivalTime: null,
    };
    return structuredClone(withStops(route, [...route.stops, stop]));
  },

  async removeStudent(routeId, studentId) {
    const route = findSampleRoute(routeId);
    if (!route.stops.some((stop) => stop.studentId === studentId)) {
      throw new ApiError(404, "Student is not on this route.");
    }
    const stops = route.stops.filter((stop) => stop.studentId !== studentId);
    return structuredClone(withStops(route, stops));
  },

  // WORKAROUND: no endpoint in the contract (SCRUM-209). The real students
  // minus the stops on the in-memory routes.
  async unassignedStudents() {
    return subtractAssigned(await getStudents(), sampleState);
  },
};

// SCRUM-208 (and 209 for the student calls): change to `httpRoutes`, then
// delete the sample client above.
const api: RoutesApi = sampleRoutes;

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

// WORKAROUND: see unassignedStudents above; the contract has no endpoint.
export function listUnassignedStudents(): Promise<Student[]> {
  return api.unassignedStudents();
}
