// Routes API — SCRUM-218, built against docs/contracts/routing.md (the source
// of truth for every type and path here). Morning pickup, one school.
//
//   GET    /api/head-of-transport/routes            -> RouteSummary[]
//   POST   /api/head-of-transport/routes            { name, vehicleId, driverId } -> Route (201)
//   GET    /api/head-of-transport/routes/{routeId}  -> Route
//   PUT    /api/head-of-transport/routes/{routeId}  { name, vehicleId, driverId } -> Route
//   DELETE /api/head-of-transport/routes/{routeId}  -> 204
//
// The endpoints are SCRUM-208's and don't exist yet, so the functions run
// against an in-memory sample client seeded from the contract samples
// (copied into ./samples/routing because the Docker build only sees frontend/).
//
// TEMPORARY: the sample client below and ./samples/routing/ must be deleted
// when SCRUM-208 lands. Point `api` at `httpRoutes` and nothing else changes.

import { request } from "./client";
import { getDrivers } from "./drivers";
import { ApiError, ApiValidationError } from "./errors";
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
}

const ROUTES_PATH = "/api/head-of-transport/routes";

function routePath(routeId: string): string {
  return `${ROUTES_PATH}/${encodeURIComponent(routeId)}`;
}

// The real calls, written against the contract and ready for SCRUM-208.
export const httpRoutes: RoutesApi = {
  list: () => request<RouteSummary[]>(ROUTES_PATH),
  get: (routeId) => request<Route>(routePath(routeId)),
  create: (input) => request<Route>(ROUTES_PATH, { method: "POST", body: input }),
  update: (routeId, input) => request<Route>(routePath(routeId), { method: "PUT", body: input }),
  remove: (routeId) => request(routePath(routeId), { method: "DELETE" }),
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
      id: crypto.randomUUID(),
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
};

// SCRUM-208: change to `httpRoutes`, then delete the sample client above.
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
