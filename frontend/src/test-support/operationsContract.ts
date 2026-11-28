// Test fixtures and HTTP transport only: no Git lookup, eval, alternate-source
// selection, business API replacement or production oracle. DTO types are public.
import type { AddressRequest } from "@/lib/api/addressRequests";
import type { Run, RunLocation, RunSummary } from "@/lib/api/runs";

export function driverRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1", date: "2026-11-09", direction: "MORNING", state: "IN_PROGRESS",
    schoolTime: "08:00", startedAt: "2026-11-09T05:00:00Z", endedAt: null,
    route: { id: "route-1", name: "Hamra" },
    driver: { id: "driver-1", firstName: "Rami", lastName: "Haddad" },
    vehicle: { id: "vehicle-1", plateNumber: "TEST", capacity: 4 },
    counts: { students: 1, absent: 0, pickedUp: 0, droppedOff: 0, notPresent: 0 },
    locationSharing: false,
    stops: [{ studentId: "student-1", position: 1, firstName: "Lina", lastName: "Saleh",
      address: "Saved street", latitude: 33.88, longitude: 35.52, arrivalTime: "07:10",
      guardianName: "Parent Saleh", guardianPhone: "+9613000000", absent: false,
      confirmation: null, removedFromRoute: false }],
    ...overrides,
  };
}

export const controlRun: RunSummary = {
  ...driverRun(),
  counts: { students: 4, absent: 1, pickedUp: 2, droppedOff: 0, notPresent: 0 },
  locationSharing: true,
};
export const location: RunLocation = {
  runId: controlRun.id, status: "LIVE",
  position: { latitude: 33.88, longitude: 35.52, accuracyMeters: 12, receivedAt: "2026-11-17T05:01:00Z", ageSeconds: 2 },
  remainingStops: 2,
  nextStop: { studentId: "student-1", firstName: "Lina", lastName: "Saleh", plannedTime: "07:10",
    estimate: { arrivesAt: "2026-11-17T05:12:00Z", secondsAway: 120 } },
};
export const address: AddressRequest = {
  id: "request/a", studentId: "student-1", studentName: "Lina", currentAddress: "Saved street",
  requestedAddress: "Requested street", requestedLat: null, requestedLng: null,
  requestedBy: { parentUserId: "parent-1", email: "parent@example.invalid" }, status: "pending",
  createdAt: "2026-11-09T07:00:00Z", decidedAt: null, rejectionReason: null,
};

export function response(body?: unknown, status = 200): Response {
  return status === 204 || body === undefined
    ? new Response(null, { status })
    : Response.json(body, { status });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

export function pathOf(input: RequestInfo | URL): string {
  return new URL(String(input), "http://localhost").pathname;
}
