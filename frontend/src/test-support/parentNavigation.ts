// Test-only families; never imported by a production page or API client.
import type { Child } from "@/lib/api/myChildren";
export const family: Child[] = ["Lina", "Omar"].map((name, index) => ({
  studentId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  firstName: name, lastName: "Navigation",
  route: { id: "route-parent", name: "School route" },
  driver: { id: "driver-parent", firstName: "Test", lastName: "Driver", phone: "+961 70 123 456" },
  vehicle: { id: "vehicle-parent", plateNumber: "TEST 279" },
  expectedPickupTime: "07:20", todayRun: { direction: "MORNING", state: "IN_PROGRESS", stopsLeft: index + 1 },
}));
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
