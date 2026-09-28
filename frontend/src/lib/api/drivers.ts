// Driver API layer — SCRUM-159.
//
// The backend driver endpoints (SCRUM-164) don't exist yet, so these
// functions run against an in-memory mock, the same approach as
// vehicles.ts. Each one is already async and returns the same shape a
// real request would, so when SCRUM-164 lands, replace the function
// bodies with fetch() calls and keep the signatures.

import { getVehicles } from "./vehicles";

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

// Fields the caller supplies when adding a driver; the rest are assigned by
// the API (mock today, server later).
export type NewDriver = Pick<Driver, "firstName" | "lastName" | "phone" | "email">;

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms: number = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let drivers: Driver[] = [
  {
    id: "d-1",
    firstName: "Ahmad",
    lastName: "Khalil",
    phone: "+961 3 123 456",
    email: "ahmad.khalil@example.com",
    status: "active",
    invitedAt: "2026-01-10T09:00:00.000Z",
    assignedVehicleId: "v-1",
  },
  {
    id: "d-2",
    firstName: "Sara",
    lastName: "Haddad",
    phone: "+961 70 234 567",
    email: "sara.haddad@example.com",
    status: "active",
    invitedAt: "2026-01-12T09:00:00.000Z",
    assignedVehicleId: "v-2",
  },
  {
    id: "d-3",
    firstName: "Rami",
    lastName: "Fares",
    phone: "+961 71 345 678",
    email: "rami.fares@example.com",
    status: "invited",
    invitedAt: "2026-02-01T09:00:00.000Z",
    assignedVehicleId: null,
  },
  {
    id: "d-4",
    firstName: "Nour",
    lastName: "Saleh",
    phone: "+961 76 456 789",
    email: "nour.saleh@example.com",
    status: "deactivated",
    invitedAt: "2026-01-20T09:00:00.000Z",
    assignedVehicleId: null,
  },
  {
    id: "d-5",
    firstName: "Joseph",
    lastName: "Abou Jaoude",
    phone: "+961 3 567 890",
    email: "joseph.aboujaoude@example.com",
    status: "invited",
    invitedAt: "2026-03-05T09:00:00.000Z",
    assignedVehicleId: null,
  },
];

export async function getDrivers(): Promise<Driver[]> {
  return delay([...drivers]);
}

export async function addDriver(data: NewDriver): Promise<Driver> {
  if (!data.firstName || !data.lastName || !data.phone || !data.email) {
    throw new Error("First name, last name, phone, and email are all required.");
  }

  const email = data.email.trim().toLowerCase();
  const phone = data.phone.trim();

  if (drivers.some((d) => d.email.toLowerCase() === email)) {
    throw new Error(`A driver with email ${data.email} already exists.`);
  }
  if (drivers.some((d) => d.phone === phone)) {
    throw new Error(`A driver with phone ${data.phone} already exists.`);
  }

  const driver: Driver = {
    firstName: data.firstName,
    lastName: data.lastName,
    phone,
    email: data.email.trim(),
    status: "invited",
    invitedAt: new Date().toISOString(),
    id: `d-${Date.now()}`,
    assignedVehicleId: null,
  };
  drivers = [...drivers, driver];
  return delay(driver);
}

export async function resendInvite(id: string): Promise<Driver> {
  const existing = drivers.find((d) => d.id === id);
  if (!existing) {
    throw new Error(`Driver not found: ${id}`);
  }
  if (existing.status !== "invited") {
    throw new Error(`Cannot resend invite: driver is already ${existing.status}.`);
  }
  const updated: Driver = { ...existing, invitedAt: new Date().toISOString() };
  drivers = drivers.map((d) => (d.id === id ? updated : d));
  return delay(updated);
}

export async function assignDriverToVehicle(
  driverId: string,
  vehicleId: string,
): Promise<Driver> {
  const driver = drivers.find((d) => d.id === driverId);
  if (!driver) {
    throw new Error(`Driver not found: ${driverId}`);
  }
  if (driver.status === "deactivated") {
    throw new Error("Cannot assign a deactivated driver to a vehicle.");
  }

  const vehicles = await getVehicles();
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) {
    throw new Error(`Vehicle not found: ${vehicleId}`);
  }
  if (!vehicle.isActive) {
    throw new Error("Cannot assign a driver to a deactivated vehicle.");
  }

  const takenBy = drivers.find(
    (d) => d.id !== driverId && d.assignedVehicleId === vehicleId,
  );
  if (takenBy) {
    throw new Error(`Vehicle is already assigned to ${takenBy.firstName} ${takenBy.lastName}.`);
  }

  const updated: Driver = { ...driver, assignedVehicleId: vehicleId };
  drivers = drivers.map((d) => (d.id === driverId ? updated : d));
  return delay(updated);
}

export async function unassignDriver(driverId: string): Promise<Driver> {
  const existing = drivers.find((d) => d.id === driverId);
  if (!existing) {
    throw new Error(`Driver not found: ${driverId}`);
  }
  const updated: Driver = { ...existing, assignedVehicleId: null };
  drivers = drivers.map((d) => (d.id === driverId ? updated : d));
  return delay(updated);
}
