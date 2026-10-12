// Vehicle API layer — SCRUM-158.
//
// Moustafa's real vehicle endpoints (SCRUM-163) aren't published yet, so
// these functions run against an in-memory mock. Each one is already
// async and returns the same shape a real request would, so swapping the
// body for a fetch() call later needs no change to the function
// signatures or to the components calling them.

export interface Vehicle {
  id: string;
  plateNumber: string;
  capacity: number;
  isActive: boolean;
  createdAt: string;
}

// Fields the caller supplies when creating a vehicle; id/createdAt are
// assigned by the API (mock today, server later).
export type NewVehicle = Omit<Vehicle, "id" | "createdAt">;

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms: number = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let vehicles: Vehicle[] = [
  {
    id: "v-1",
    plateNumber: "A 123456",
    capacity: 14,
    isActive: true,
    createdAt: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "v-2",
    plateNumber: "B 234567",
    capacity: 20,
    isActive: true,
    createdAt: "2026-02-02T08:00:00.000Z",
  },
  {
    id: "v-3",
    plateNumber: "C 345678",
    capacity: 8,
    isActive: false,
    createdAt: "2026-03-10T08:00:00.000Z",
  },
  {
    id: "v-4",
    plateNumber: "D 456789",
    capacity: 16,
    isActive: true,
    createdAt: "2026-04-22T08:00:00.000Z",
  },
];

export async function getVehicles(): Promise<Vehicle[]> {
  return delay([...vehicles]);
}

export async function addVehicle(data: NewVehicle): Promise<Vehicle> {
  const vehicle: Vehicle = {
    ...data,
    id: `v-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  vehicles = [...vehicles, vehicle];
  return delay(vehicle);
}

export async function setVehicleCapacity(
  id: string,
  capacity: number,
): Promise<Vehicle> {
  const existing = vehicles.find((v) => v.id === id);
  if (!existing) {
    throw new Error(`Vehicle not found: ${id}`);
  }
  const updated: Vehicle = { ...existing, capacity };
  vehicles = vehicles.map((v) => (v.id === id ? updated : v));
  return delay(updated);
}

export async function deactivateVehicle(id: string): Promise<Vehicle> {
  const existing = vehicles.find((v) => v.id === id);
  if (!existing) {
    throw new Error(`Vehicle not found: ${id}`);
  }
  const updated: Vehicle = { ...existing, isActive: false };
  vehicles = vehicles.map((v) => (v.id === id ? updated : v));
  return delay(updated);
}

export async function reactivateVehicle(id: string): Promise<Vehicle> {
  const existing = vehicles.find((v) => v.id === id);
  if (!existing) {
    throw new Error(`Vehicle not found: ${id}`);
  }
  const updated: Vehicle = { ...existing, isActive: true };
  vehicles = vehicles.map((v) => (v.id === id ? updated : v));
  return delay(updated);
}
