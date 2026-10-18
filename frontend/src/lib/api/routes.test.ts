// Tests for the routes module (SCRUM-218, students SCRUM-219), modeled on client.test.ts. The
// calls are checked against the contract's paths, methods and bodies with fetch mocked.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Proposal, Route, RouteSummary } from "./routes";

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

const ON_ROUTE_STUDENT_ID = "40000000-0000-4000-8000-000000000009";

vi.mock("./students", () => ({
  getStudents: vi.fn().mockResolvedValue([
    student("s-free", "Lara", true),
    student("s-nopin", "Sami", false),
    student(ON_ROUTE_STUDENT_ID, "Maya", true),
  ]),
}));

const HAMRA_ID = "10000000-0000-4000-8000-000000000001";
const VERDUN_ID = "10000000-0000-4000-8000-000000000003";
const ROUTES_URL = "http://localhost:8080/api/head-of-transport/routes";

const SUMMARIES: RouteSummary[] = [
  {
    id: HAMRA_ID,
    name: "Hamra morning run",
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 12 },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    studentCount: 1,
    seatsLeft: 11,
  },
  {
    id: VERDUN_ID,
    name: "Verdun morning run",
    vehicle: { id: "v-3", plateNumber: "C 345678", capacity: 12 },
    driver: { id: "d-3", firstName: "Rania", lastName: "Khalil" },
    studentCount: 0,
    seatsLeft: 12,
  },
];

const ROUTE: Route = {
  ...SUMMARIES[0],
  school: { latitude: 33.8938, longitude: 35.5018, arrivalTime: "07:30" },
  stops: [
    {
      studentId: ON_ROUTE_STUDENT_ID,
      position: 1,
      firstName: "Maya",
      lastName: "Test",
      address: "Bliss Street, Hamra",
      latitude: 33.8997,
      longitude: 35.4823,
      arrivalTime: null,
    },
  ],
};

const PROPOSAL_ID = "50000000-0000-4000-8000-000000000001";

const FEASIBLE_PROPOSAL: Proposal = {
  id: PROPOSAL_ID,
  feasible: true,
  current: { drivingMinutes: 22, stops: ROUTE.stops },
  proposed: { drivingMinutes: 13, stops: ROUTE.stops },
  reasons: [],
};

const INFEASIBLE_PROPOSAL: Proposal = {
  id: null,
  feasible: false,
  current: { drivingMinutes: 15, stops: ROUTE.stops },
  proposed: null,
  reasons: [{ code: "CAPACITY_EXCEEDED", message: "The route has 4 students but the vehicle seats 3." }],
};

// A fresh copy of the module for each test.
async function loadRoutes() {
  vi.resetModules();
  return import("./routes");
}

// loadRoutes() resets the module registry, so an ApiError imported statically
// at the top of this file would be a different class than the one routes.ts
// actually throws. Import it from the same fresh registry instead.
async function loadErrors() {
  return import("./errors");
}

function mockFetchError(status: number, detail: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ detail }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
    mockFetchOnce(200, SUMMARIES);

    await expect(httpRoutes.list()).resolves.toEqual(SUMMARIES);
    expect(fetchMock).toHaveBeenCalledWith(ROUTES_URL, expect.objectContaining({ method: "GET" }));
  });

  it("gets one route by id, encoding the id", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, ROUTE);

    await httpRoutes.get("a/b");

    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/a%2Fb`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a route with a POST of { name, vehicleId, driverId }", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(201, ROUTE);
    const input = { name: "Verdun morning run", vehicleId: "v-1", driverId: "d-1" };

    await httpRoutes.create(input);

    expect(fetchMock).toHaveBeenCalledWith(
      ROUTES_URL,
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("edits a route with a PUT to its path", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, ROUTE);
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
    mockFetchOnce(200, ROUTE);

    await expect(httpRoutes.addStudent(VERDUN_ID, "s-free")).resolves.toEqual(ROUTE);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/${VERDUN_ID}/students`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ studentId: "s-free" }) }),
    );
  });

  it("removes a student with a DELETE to its path, encoding the id", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, ROUTE);

    await expect(httpRoutes.removeStudent(VERDUN_ID, "a/b")).resolves.toEqual(ROUTE);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/${VERDUN_ID}/students/a%2Fb`,
      expect.objectContaining({ method: "DELETE", body: undefined }),
    );
  });

  it("reorders the stops with a PUT of { studentIds } to the route's stops, encoding the id", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, ROUTE);

    await expect(httpRoutes.reorderStops("a/b", ["s-2", "s-1"])).resolves.toEqual(ROUTE);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/a%2Fb/stops`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ studentIds: ["s-2", "s-1"] }) }),
    );
  });

  it("works out the unassigned students by getting every route", async () => {
    const { httpRoutes } = await loadRoutes();
    const stopsById: Record<string, unknown[]> = {
      [HAMRA_ID]: [{ ...ROUTE.stops[0], studentId: "s-free" }],
      [VERDUN_ID]: [],
    };
    fetchMock = vi.fn((url: string) => {
      const id = url.slice(ROUTES_URL.length + 1);
      const body = id ? { ...ROUTE, id, stops: stopsById[id] } : SUMMARIES;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const unassigned = await httpRoutes.unassignedStudents();

    expect(unassigned.map((s) => s.id)).toEqual(["s-nopin", ON_ROUTE_STUDENT_ID]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const url of [ROUTES_URL, ...SUMMARIES.map((summary) => `${ROUTES_URL}/${summary.id}`)]) {
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

describe("optimization", () => {
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

  it("proposes an optimization with a POST to the route's optimization path", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(201, FEASIBLE_PROPOSAL);

    await expect(httpRoutes.proposeOptimization(HAMRA_ID)).resolves.toEqual(FEASIBLE_PROPOSAL);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/${HAMRA_ID}/optimization`,
      expect.objectContaining({ method: "POST", body: undefined }),
    );
  });

  it("resolves a 201 with feasible: false, id: null and proposed: null when the route can't be planned", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(201, INFEASIBLE_PROPOSAL);

    await expect(httpRoutes.proposeOptimization(HAMRA_ID)).resolves.toEqual(INFEASIBLE_PROPOSAL);
  });

  it.each([
    "the route has no stops",
    "the school's arrival time is not set",
    "some stops have no pin",
    "another propose for this route is already in flight",
  ])("rejects proposing with a 409 when %s", async (detail) => {
    const { httpRoutes } = await loadRoutes();
    const { ApiError } = await loadErrors();
    mockFetchError(409, detail);

    try {
      await httpRoutes.proposeOptimization(HAMRA_ID);
      expect.unreachable("expected proposeOptimization to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as InstanceType<typeof ApiError>).status).toBe(409);
      expect((error as InstanceType<typeof ApiError>).message).toBe(detail);
    }
  });

  it("applies a proposal with a POST to its apply path, encoding both ids", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(200, ROUTE);

    await expect(httpRoutes.applyProposal("a/b", "p/1")).resolves.toEqual(ROUTE);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/a%2Fb/optimization/p%2F1/apply`,
      expect.objectContaining({ method: "POST", body: undefined }),
    );
  });

  it("rejects applying with a 404 when the proposal is gone, replaced or unknown", async () => {
    mockFetchError(404, "Proposal not found");
    const { httpRoutes } = await loadRoutes();
    const { ApiError } = await loadErrors();

    try {
      await httpRoutes.applyProposal(HAMRA_ID, PROPOSAL_ID);
      expect.unreachable("expected applyProposal to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as InstanceType<typeof ApiError>).status).toBe(404);
    }
  });

  it("rejects applying with a 409 when the route's stops changed since the proposal", async () => {
    mockFetchError(409, "The route has changed since this proposal was made");
    const { httpRoutes } = await loadRoutes();
    const { ApiError } = await loadErrors();

    try {
      await httpRoutes.applyProposal(HAMRA_ID, PROPOSAL_ID);
      expect.unreachable("expected applyProposal to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as InstanceType<typeof ApiError>).status).toBe(409);
    }
  });

  it("discards a proposal with a DELETE to its path, resolving with undefined on a 204", async () => {
    const { httpRoutes } = await loadRoutes();
    mockFetchOnce(204);

    await expect(httpRoutes.discardProposal("a/b", "p/1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ROUTES_URL}/a%2Fb/optimization/p%2F1`,
      expect.objectContaining({ method: "DELETE", body: undefined }),
    );
  });

  it("rejects discarding with a 404 when the proposal is already gone", async () => {
    mockFetchError(404, "Proposal not found");
    const { httpRoutes } = await loadRoutes();
    const { ApiError } = await loadErrors();

    try {
      await httpRoutes.discardProposal(HAMRA_ID, PROPOSAL_ID);
      expect.unreachable("expected discardProposal to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as InstanceType<typeof ApiError>).status).toBe(404);
    }
  });
});

describe("exported functions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The screens call these, so they must reach the backend, not a stand-in.
  it.each([
    ["listRoutes", (r: Awaited<ReturnType<typeof loadRoutes>>) => r.listRoutes(), "GET", ROUTES_URL],
    [
      "reorderStops",
      (r: Awaited<ReturnType<typeof loadRoutes>>) => r.reorderStops(HAMRA_ID, ["s-1"]),
      "PUT",
      `${ROUTES_URL}/${HAMRA_ID}/stops`,
    ],
  ])("%s calls the backend", async (_name, call, method, url) => {
    const routes = await loadRoutes();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(ROUTE),
    });
    vi.stubGlobal("fetch", fetchMock);

    await call(routes);

    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method }));
  });
});
