import { describe, expect, it } from "vitest";
import type { Driver } from "@/lib/api/drivers";
import type { RouteSummary } from "@/lib/api/routes";
import { eligibleDrivers } from "./eligibleDrivers";

function driver(id: string, status: Driver["status"] = "active"): Driver {
  return {
    id,
    firstName: `First ${id}`,
    lastName: `Last ${id}`,
    phone: "+961 3 000 000",
    email: `${id}@example.com`,
    status,
    invitedAt: "2026-09-01T08:00:00Z",
    assignedVehicleId: null,
  };
}

function route(id: string, driverId: string): RouteSummary {
  return {
    id,
    name: `Route ${id}`,
    vehicle: { id: `v-${id}`, plateNumber: "A 1", capacity: 14 },
    driver: { id: driverId, firstName: "x", lastName: "y" },
    studentCount: 5,
    seatsLeft: 9,
  };
}

describe("eligibleDrivers", () => {
  it("keeps active drivers on no route, other than the run's current driver, in roster order", () => {
    const drivers = [
      driver("current"),
      driver("spare-b"),
      driver("invited", "invited"),
      driver("busy"),
      driver("revoked", "deactivated"),
      driver("spare-a"),
    ];
    const routes = [route("r1", "current"), route("r2", "busy")];
    expect(eligibleDrivers(drivers, routes, "current").map((d) => d.id)).toEqual(["spare-b", "spare-a"]);
  });

  it("excludes the current driver even when no route lists them (routes read before the change)", () => {
    expect(eligibleDrivers([driver("current"), driver("spare")], [], "current").map((d) => d.id)).toEqual(["spare"]);
  });

  it("is empty when no active driver is spare", () => {
    expect(eligibleDrivers([driver("current"), driver("busy")], [route("r", "busy")], "current")).toEqual([]);
    expect(eligibleDrivers([], [], "current")).toEqual([]);
  });

  it("doesn't change its inputs", () => {
    const drivers = [driver("a"), driver("b")];
    eligibleDrivers(drivers, [route("r", "a")], "x");
    expect(drivers.map((d) => d.id)).toEqual(["a", "b"]);
  });
});
