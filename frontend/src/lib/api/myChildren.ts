// The parent's children — SCRUM-232, written from docs/contracts/runs.md (the
// source of truth for every type and path here). Types only: the call is added
// with the parent home screen (SCRUM-248), through request() in client.ts. This
// is not parents.ts, which is the head of transportation's parent list.
//
//   GET /api/parent/children -> Child[]
//
// Run status and "stops left before my child" (SCRUM-237) are not in the contract yet.

export interface ChildRoute {
  id: string;
  name: string;
}

export interface ChildDriver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string; // for the "Call driver" tel: link
}

export interface ChildVehicle {
  id: string;
  plateNumber: string;
}

// Every child linked to the signed-in parent, by first name. route null means
// "no route yet", and then driver, vehicle and expectedPickupTime are null too;
// with a route, driver and vehicle are always set.
export interface Child {
  studentId: string; // the id the absence paths use
  firstName: string;
  lastName: string;
  route: ChildRoute | null;
  driver: ChildDriver | null;
  vehicle: ChildVehicle | null;
  // "HH:mm", the planned morning time, not a live estimate. Null exactly when
  // the routing arrivalTime is null.
  expectedPickupTime: string | null;
}
