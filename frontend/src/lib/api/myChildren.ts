// The parent's children — SCRUM-232, written from docs/contracts/runs.md (the
// source of truth for every type and path here). The authenticated call uses
// request() in client.ts; the server determines the parent from the session. This
// is not parents.ts, which is the head of transportation's parent list.
//
//   GET /api/parent/children -> Child[]
//
// Run status and "stops left before my child" (SCRUM-237) are not in the contract yet.

import { request } from "./client";

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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChild(value: unknown): value is Child {
  if (!record(value) || typeof value.studentId !== "string"
    || typeof value.firstName !== "string" || typeof value.lastName !== "string") return false;
  if (value.route === null) {
    return value.driver === null && value.vehicle === null && value.expectedPickupTime === null;
  }
  return record(value.route) && typeof value.route.id === "string" && typeof value.route.name === "string"
    && record(value.driver) && typeof value.driver.id === "string"
    && typeof value.driver.firstName === "string" && typeof value.driver.lastName === "string"
    && typeof value.driver.phone === "string"
    && record(value.vehicle) && typeof value.vehicle.id === "string" && typeof value.vehicle.plateNumber === "string"
    && (value.expectedPickupTime === null || (typeof value.expectedPickupTime === "string"
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.expectedPickupTime)));
}

export async function getMyChildren(): Promise<Child[]> {
  const children = await request<unknown>("/api/parent/children");
  // A broken contract must show the load error, not an empty family or partial
  // transport details. Additional fields remain allowed for future stories.
  if (!Array.isArray(children) || !children.every(isChild)) {
    throw new Error("Invalid parent children response");
  }
  return children;
}
