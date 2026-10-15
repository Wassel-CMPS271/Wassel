// Tests for SCRUM-218's routes module, modeled on client.test.ts. The real
// calls (httpRoutes) are checked against the contract's paths with fetch
// mocked; the temporary sample client is checked through the exported
// functions the screen uses. Drop the "sample client" and "sample copies"
// blocks with the sample client when SCRUM-208 lands.

import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Errors from "./errors";
import sampleProposal from "./samples/routing/proposal.json";
import sampleRoute from "./samples/routing/route.json";
import sampleRouteList from "./samples/routing/routes.json";

vi.mock("./vehicles", () => ({
  getVehicles: vi.fn().mockResolvedValue([
    { id: "v-free", plateNumber: "D 456789", capacity: 10, isActive: true, createdAt: "" },
    { id: "v-inactive", plateNumber: "E 567890", capacity: 10, isActive: false, createdAt: "" },
  ]),
}));

vi.mock("./drivers", () => ({
  getDrivers: vi.fn().mockResolvedValue([
    {
      id: "d-free",
      firstName: "Rania",
      lastName: "Khalil",
      phone: "",
      email: "",
      status: "active",
      invitedAt: "",
      assignedVehicleId: null,
    },
    {
      id: "d-deactivated",
      firstName: "Omar",
      lastName: "Zein",
      phone: "",
      email: "",
      status: "deactivated",
      invitedAt: "",
      assignedVehicleId: null,
    },
  ]),
}));

const HAMRA_ID = "10000000-0000-4000-8000-000000000001";
const VERDUN_ID = "10000000-0000-4000-8000-000000000003";
const VERDUN_VEHICLE_ID = "20000000-0000-4000-8000-000000000003";
const VERDUN_DRIVER_ID = "30000000-0000-4000-8000-000000000003";
const ROUTES_URL = "http://localhost:8080/api/head-of-transport/routes";

// A fresh copy of the module for each test, so the sample state starts over.
// The error classes come from the same fresh load, or instanceof would fail.
let ApiError: typeof Errors.ApiError;
let ApiValidationError: typeof Errors.ApiValidationError;

async function loadRoutes() {
  vi.resetModules();
  ({ ApiError, ApiValidationError } = await import("./errors"));
  return import("./routes");
}

async function expectFieldError(promise: Promise<unknown>, field: string) {
  try {
    await promise;
    expect.unreachable("expected a validation error");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiValidationError);
    expect((error as Errors.ApiValidationError).errors).toHaveProperty(field);
  }
}

describe("httpRoutes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function mockFetchOnce(status: number, body?: unknown) {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status,
      json: () => Promise.resolve(body),
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the routes with a GET", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, sampleRouteList);

    await expect(httpRoutes.list()).resolves.toEqual(sampleRouteList);
    expect(fetchMock).toHaveBeenCalledWith(ROUTES_URL, expect.objectContaining({ method: "GET" }));
  });

  it("gets one route by id, encoding the id", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, sampleRoute);

    await httpRoutes.get("a/b");

    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/a%2Fb`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a route with a POST of { name, vehicleId, driverId }", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(201, sampleRoute);
    const input = { name: "Verdun morning run", vehicleId: "v-1", driverId: "d-1" };

    await httpRoutes.create(input);

    expect(fetchMock).toHaveBeenCalledWith(
      ROUTES_URL,
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("edits a route with a PUT to its path", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, sampleRoute);
    const input = { name: "Renamed", vehicleId: "v-1", driverId: "d-1" };

    await httpRoutes.update(VERDUN_ID, input);

    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/${VERDUN_ID}`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify(input) }),
    );
  });

  it("deletes a route with a DELETE and resolves with undefined on a 204", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(204);

    await expect(httpRoutes.remove(VERDUN_ID)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/${VERDUN_ID}`,
      expect.objectContaining({ method: "DELETE", body: undefined }),
    );
  });
});

describe("sample client (temporary, delete with SCRUM-208)", () => {
  let routes: Awaited<ReturnType<typeof loadRoutes>>;

  beforeEach(async () => {
    routes = await loadRoutes();
  });

  it("lists the routes in routes.json", async () => {
    await expect(routes.listRoutes()).resolves.toEqual(sampleRouteList);
  });

  it("returns route.json for the Verdun route", async () => {
    await expect(routes.getRoute(VERDUN_ID)).resolves.toEqual(sampleRoute);
  });

  it("fills the Hamra route's stops from the proposal's current order", async () => {
    const hamra = await routes.getRoute(HAMRA_ID);

    expect(hamra.stops).toEqual(sampleProposal.current.stops);
    expect(hamra.school).toEqual(sampleRoute.school);
  });

  it.each([
    ["getRoute", () => routes.getRoute("missing")],
    [
      "updateRoute",
      () => routes.updateRoute("missing", { name: "x", vehicleId: "v-free", driverId: "d-free" }),
    ],
    ["deleteRoute", () => routes.deleteRoute("missing")],
  ])("%s answers 404 for an unknown route", async (_name, call) => {
    try {
      await call();
      expect.unreachable("expected a 404");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as Errors.ApiError).status).toBe(404);
    }
  });

  it("creates an empty route that then shows up in the list", async () => {
    const created = await routes.createRoute({
      name: "  Ras Beirut run ",
      vehicleId: "v-free",
      driverId: "d-free",
    });

    expect(created).toMatchObject({
      name: "Ras Beirut run",
      vehicle: { id: "v-free", plateNumber: "D 456789", capacity: 10 },
      driver: { id: "d-free", firstName: "Rania", lastName: "Khalil" },
      studentCount: 0,
      seatsLeft: 10,
      school: sampleRoute.school,
      stops: [],
    });
    await expect(routes.getRoute(created.id)).resolves.toEqual(created);
    const list = await routes.listRoutes();
    expect(list.map((route) => route.id)).toContain(created.id);
  });

  it("edits a route, keeping its stops and recomputing the seats left", async () => {
    const updated = await routes.updateRoute(VERDUN_ID, {
      name: "Verdun early run",
      vehicleId: "v-free",
      driverId: VERDUN_DRIVER_ID,
    });

    expect(updated.name).toBe("Verdun early run");
    expect(updated.vehicle.id).toBe("v-free");
    expect(updated.stops).toEqual(sampleRoute.stops);
    expect(updated.seatsLeft).toBe(10 - sampleRoute.studentCount);
    await expect(routes.getRoute(VERDUN_ID)).resolves.toEqual(updated);
  });

  it("lets a route keep its own vehicle and driver", async () => {
    await expect(
      routes.updateRoute(VERDUN_ID, {
        name: "Verdun",
        vehicleId: VERDUN_VEHICLE_ID,
        driverId: VERDUN_DRIVER_ID,
      }),
    ).resolves.toMatchObject({ name: "Verdun" });
  });

  it("deletes a route", async () => {
    await routes.deleteRoute(VERDUN_ID);

    const list = await routes.listRoutes();
    expect(list.map((route) => route.id)).not.toContain(VERDUN_ID);
  });

  it("refuses a blank name", async () => {
    await expectFieldError(
      routes.createRoute({ name: "  ", vehicleId: "v-free", driverId: "d-free" }),
      "name",
    );
  });

  it("refuses an unknown vehicle or driver", async () => {
    await expectFieldError(
      routes.createRoute({ name: "x", vehicleId: "nope", driverId: "d-free" }),
      "vehicleId",
    );
    await expectFieldError(
      routes.createRoute({ name: "x", vehicleId: "v-free", driverId: "nope" }),
      "driverId",
    );
  });

  it("refuses an inactive vehicle or a deactivated driver", async () => {
    await expectFieldError(
      routes.createRoute({ name: "x", vehicleId: "v-inactive", driverId: "d-free" }),
      "vehicleId",
    );
    await expectFieldError(
      routes.createRoute({ name: "x", vehicleId: "v-free", driverId: "d-deactivated" }),
      "driverId",
    );
  });

  it("refuses a vehicle or driver that is already on another route, naming it", async () => {
    try {
      await routes.updateRoute(HAMRA_ID, {
        name: "Hamra",
        vehicleId: VERDUN_VEHICLE_ID,
        driverId: VERDUN_DRIVER_ID,
      });
      expect.unreachable("expected a validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      const { errors } = error as Errors.ApiValidationError;
      expect(errors.vehicleId).toContain("Verdun morning run");
      expect(errors.driverId).toContain("Verdun morning run");
    }
  });

  it("returns copies, so changing a result doesn't change the stored route", async () => {
    const route = await routes.getRoute(VERDUN_ID);
    route.name = "changed";
    route.stops.pop();

    await expect(routes.getRoute(VERDUN_ID)).resolves.toEqual(sampleRoute);
  });
});

describe("sample copies (temporary, delete with SCRUM-208)", () => {
  // The copies in ./samples/routing must stay identical to the contract's.
  it.each(["routes.json", "route.json", "proposal.json", "proposal-infeasible.json"])(
    "%s matches docs/contracts/samples/routing",
    (file) => {
      const read = (dir: string) => JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      const copy = read(path.resolve(import.meta.dirname, "samples/routing"));
      const contract = read(
        path.resolve(import.meta.dirname, "../../../../docs/contracts/samples/routing"),
      );

      expect(copy).toEqual(contract);
    },
  );
});
