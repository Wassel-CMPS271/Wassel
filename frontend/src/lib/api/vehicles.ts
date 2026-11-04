// Fleet API — SCRUM-191. All data comes from the authenticated backend.
// The component-facing signatures match the Sprint 1 mock API so the page
// can continue calling the same functions.

import { request } from "./client";

export interface Vehicle {
  id: string;
  plateNumber: string;
  capacity: number;
  isActive: boolean;
  createdAt: string;
}

// The backend assigns the UUID, active status, and creation timestamp.
export type NewVehicle = Pick<Vehicle, "plateNumber" | "capacity">;

const VEHICLES_PATH = "/api/head-of-transport/vehicles";

export function getVehicles(): Promise<Vehicle[]> {
  return request<Vehicle[]>(VEHICLES_PATH);
}

export function addVehicle(data: NewVehicle): Promise<Vehicle> {
  return request<Vehicle>(VEHICLES_PATH, { method: "POST", body: data });
}

export function setVehicleCapacity(id: string, capacity: number): Promise<Vehicle> {
  return request<Vehicle>(`${VEHICLES_PATH}/${encodeURIComponent(id)}/capacity`, {
    method: "PATCH",
    body: { capacity },
  });
}

export function deactivateVehicle(id: string): Promise<Vehicle> {
  return request<Vehicle>(`${VEHICLES_PATH}/${encodeURIComponent(id)}/deactivate`, {
    method: "PATCH",
  });
}

export function reactivateVehicle(id: string): Promise<Vehicle> {
  return request<Vehicle>(`${VEHICLES_PATH}/${encodeURIComponent(id)}/reactivate`, {
    method: "PATCH",
  });
}
