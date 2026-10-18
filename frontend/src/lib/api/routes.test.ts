// Tests for the routes module (SCRUM-218, students SCRUM-219), modeled on client.test.ts. The
// calls are checked against the contract's paths, methods and bodies with fetch mocked.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Route, RouteSummary } from "./routes";

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

// A fresh copy of the module for each test.
async function loadRoutes() {
  vi.resetModules();
  return import("./routes");
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
