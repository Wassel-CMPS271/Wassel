// Tests for the routes module (SCRUM-218, students SCRUM-219), modeled on client.test.ts. The real
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

// The first Verdun stop in route.json, so this student is already on a route.
const VERDUN_STUDENT_ID = "40000000-0000-4000-8000-000000000009";

function student(id: string, firstName: string, pin: boolean, status: "active" | "inactive" = "active") {
  return {
    id,
    firstName,
    lastName: "Test",
    grade: "5",
    guardianName: "",
    guardianPhone: "",
    status,
    address: pin ? "Bliss Street, Hamra" : null,
    latitude: pin ? 33.8997 : null,
    longitude: pin ? 35.4823 : null,
    route: null,
    parentUserId: null,
    createdAt: "",
  };
}

vi.mock("./students", () => ({
  getStudents: vi.fn().mockResolvedValue([
    student("s-free", "Lara", true),
    student("s-nopin", "Sami", false),
    student(VERDUN_STUDENT_ID, "Maya", true),
  ]),
}));

const HAMRA_ID = "10000000-0000-4000-8000-000000000001";
const ACHRAFIEH_ID = "10000000-0000-4000-8000-000000000002";
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

  it("adds a student with a POST of { studentId } to the route's students", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, sampleRoute);

    await expect(httpRoutes.addStudent(VERDUN_ID, "s-free")).resolves.toEqual(sampleRoute);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/${VERDUN_ID}/students`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ studentId: "s-free" }) }),
    );
  });

  it("removes a student with a DELETE to its path, encoding the id", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, sampleRoute);

    await expect(httpRoutes.removeStudent(VERDUN_ID, "a/b")).resolves.toEqual(sampleRoute);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/${VERDUN_ID}/students/a%2Fb`,
      expect.objectContaining({ method: "DELETE", body: undefined }),
    );
  });

  it("works out the unassigned students by getting every route", async () => {
    const { httpRoutes } = await loadRoutes();
    const summaries = sampleRouteList.slice(0, 2);
    const stopsById: Record<string, unknown[]> = {
      [summaries[0].id]: [{ ...sampleRoute.stops[0], studentId: "s-free" }],
      [summaries[1].id]: [],
    };
    fetchMock = vi.fn((url: string) => {
      const id = url.slice(ROUTES_URL.length + 1);
      const body = id ? { ...sampleRoute, id, stops: stopsById[id] } : summaries;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const unassigned = await httpRoutes.unassignedStudents();

    expect(unassigned.map((s) => s.id)).toEqual(["s-nopin", VERDUN_STUDENT_ID]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const url of [ROUTES_URL, ...summaries.map((summary) => `${ROUTES_URL}/${summary.id}`)]) {
      expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "GET" }));
    }
  });

  it("excludes inactive students, even when they're on no route", async () => {
    const { httpRoutes } = await loadRoutes();
    const { getStudents } = await import("./students");
    vi.mocked(getStudents).mockResolvedValueOnce([
      student("s-free", "Lara", true),
      student("s-inactive", "Nora", true, "inactive"),
    ]);
    mockFetchOnce(200, []); // no routes, so neither student is a stop anywhere

    await expect(httpRoutes.unassignedStudents()).resolves.toEqual([student("s-free", "Lara", true)]);
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
    ["addStudentToRoute", () => routes.addStudentToRoute("missing", "s-free")],
    ["removeStudentFromRoute", () => routes.removeStudentFromRoute("missing", VERDUN_STUDENT_ID)],
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

  // crypto.randomUUID only exists in a secure context, and staging is plain HTTP.
  it("creates routes with distinct ids without crypto.randomUUID", async () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const first = await routes.createRoute({ name: "First", vehicleId: "v-free", driverId: "d-free" });
      await routes.deleteRoute(first.id);
      const second = await routes.createRoute({ name: "Second", vehicleId: "v-free", driverId: "d-free" });

      expect(first.id).toEqual(expect.any(String));
      expect(second.id).not.toBe(first.id);
      await expect(routes.getRoute(second.id)).resolves.toMatchObject({ name: "Second" });
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("adds a student as the last stop, built from the student record", async () => {
    const updated = await routes.addStudentToRoute(VERDUN_ID, "s-free");

    expect(updated.stops).toHaveLength(4);
    expect(updated.stops.slice(0, 3)).toEqual(sampleRoute.stops);
    expect(updated.stops[3]).toEqual({
      studentId: "s-free",
      position: 4,
      firstName: "Lara",
      lastName: "Test",
      address: "Bliss Street, Hamra",
      latitude: 33.8997,
      longitude: 35.4823,
      arrivalTime: null,
    });
    expect(updated).toMatchObject({ studentCount: 4, seatsLeft: 10 });
    await expect(routes.getRoute(VERDUN_ID)).resolves.toEqual(updated);
    const list = await routes.listRoutes();
    expect(list.find((route) => route.id === VERDUN_ID)).toMatchObject({ studentCount: 4 });

    updated.stops.pop();
    await expect(routes.getRoute(VERDUN_ID)).resolves.toMatchObject({ studentCount: 4 });
  });

  it("refuses to add beyond the vehicle's capacity, with the count and the capacity", async () => {
    try {
      // Achrafieh has 4 students on 3 seats.
      await routes.addStudentToRoute(ACHRAFIEH_ID, "s-free");
      expect.unreachable("expected a 409");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as Errors.ApiError).status).toBe(409);
      expect((error as Errors.ApiError).message).toContain("4 students");
      expect((error as Errors.ApiError).message).toContain("3 seats");
    }
    await expect(routes.getRoute(ACHRAFIEH_ID)).resolves.toMatchObject({ studentCount: 4 });
  });

  it("answers 404 for an unknown student", async () => {
    await expect(routes.addStudentToRoute(VERDUN_ID, "nobody")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses a student who is already on a route, naming it", async () => {
    try {
      await routes.addStudentToRoute(HAMRA_ID, VERDUN_STUDENT_ID);
      expect.unreachable("expected a 409");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as Errors.ApiError).status).toBe(409);
      expect((error as Errors.ApiError).message).toContain("Verdun morning run");
    }

    await routes.addStudentToRoute(VERDUN_ID, "s-free");
    await expect(routes.addStudentToRoute(VERDUN_ID, "s-free")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("removes a student, renumbering the stops and recomputing the seats", async () => {
    const updated = await routes.removeStudentFromRoute(VERDUN_ID, VERDUN_STUDENT_ID);

    expect(updated.stops.map((stop) => stop.studentId)).toEqual(
      sampleRoute.stops.slice(1).map((stop) => stop.studentId),
    );
    expect(updated.stops.map((stop) => stop.position)).toEqual([1, 2]);
    expect(updated).toMatchObject({ studentCount: 2, seatsLeft: 12 });
    await expect(routes.getRoute(VERDUN_ID)).resolves.toEqual(updated);
  });

  it("answers 404 when removing a student who is not on the route", async () => {
    await expect(routes.removeStudentFromRoute(HAMRA_ID, VERDUN_STUDENT_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("lists the students who are on no route", async () => {
    const ids = async () => (await routes.listUnassignedStudents()).map((s) => s.id);

    await expect(ids()).resolves.toEqual(["s-free", "s-nopin"]);
    await routes.addStudentToRoute(VERDUN_ID, "s-free");
    await expect(ids()).resolves.toEqual(["s-nopin"]);
    await routes.removeStudentFromRoute(VERDUN_ID, VERDUN_STUDENT_ID);
    await expect(ids()).resolves.toEqual(["s-nopin", VERDUN_STUDENT_ID]);
  });

  it("excludes inactive students, even when they're on no route", async () => {
    const { getStudents } = await import("./students");
    vi.mocked(getStudents).mockResolvedValueOnce([
      student("s-free", "Lara", true),
      student("s-inactive", "Nora", true, "inactive"),
    ]);

    await expect(routes.listUnassignedStudents()).resolves.toEqual([student("s-free", "Lara", true)]);
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
