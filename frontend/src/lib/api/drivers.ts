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

// SCRUM-98: a revoked driver can't sign in and loses an open session at the next request. The server
// answers with the driver ("deactivated", vehicle released); restoring gives "active" (or "invited" if they
// never set a password) and does not give the vehicle back.
export function revokeDriver(id: string): Promise<Driver> {
  return request<Driver>(`${DRIVERS_API}/${encodeURIComponent(id)}/revoke`, { method: "PATCH" });
}

export function restoreDriver(id: string): Promise<Driver> {
  return request<Driver>(`${DRIVERS_API}/${encodeURIComponent(id)}/restore`, { method: "PATCH" });
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
