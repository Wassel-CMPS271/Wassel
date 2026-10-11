// SCRUM-192: Drivers are loaded and changed through the real Spring Boot API.
// Server DTO field names match the Driver interface used by the existing screen.
// Cookies and error handling are centralized in request().

import { request } from "./client";

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: "invited" | "active" | "deactivated";
  invitedAt: string;
  assignedVehicleId: string | null;
}

export type NewDriver = Pick<Driver, "firstName" | "lastName" | "phone" | "email">;

const DRIVERS_API = "/api/head-of-transport/drivers";

export function getDrivers(): Promise<Driver[]> {
  return request<Driver[]>(DRIVERS_API);
}

export function addDriver(data: NewDriver): Promise<Driver> {
  return request<Driver>(DRIVERS_API, { method: "POST", body: data });
}

export function resendInvite(id: string): Promise<Driver> {
  return request<Driver>(`${DRIVERS_API}/${encodeURIComponent(id)}/resend-invite`, {
    method: "PATCH",
  });
}

export function assignDriverToVehicle(driverId: string, vehicleId: string): Promise<Driver> {
  return request<Driver>(`${DRIVERS_API}/${encodeURIComponent(driverId)}/vehicle`, {
    method: "PATCH",
    body: { vehicleId },
  });
}

export function unassignDriver(driverId: string): Promise<Driver> {
  return request<Driver>(`${DRIVERS_API}/${encodeURIComponent(driverId)}/vehicle`, {
    method: "DELETE",
  });
}
