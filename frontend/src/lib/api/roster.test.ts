// Tests for the roster module (SCRUM-287), modeled on client.test.ts. The
// calls are checked against docs/contracts/roster.md's paths, methods and
// bodies with fetch mocked, plus how each error of its table surfaces.

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApiValidationError } from "./errors";
import { getBestRoute, placeStudentOnBestRoute, setStudentStatus, type BestRoute, type BestRoutePlacement } from "./roster";
import type { Route } from "./routes";
import type { Student } from "./students";
import bestRouteFixture from "./__fixtures__/roster/best-route.json";
import bestRouteNoneFixture from "./__fixtures__/roster/best-route-none.json";
import studentPausedFixture from "./__fixtures__/roster/student-paused.json";

const BEST_ROUTE: BestRoute = bestRouteFixture;
const BEST_ROUTE_NONE: BestRoute = bestRouteNoneFixture;
const STUDENT_PAUSED = studentPausedFixture as Student;

const STUDENT_ID = STUDENT_PAUSED.id;
const STUDENT_URL = `http://localhost:8080/api/head-of-transport/students/${STUDENT_ID}`;

const ROUTE: Route = {
  id: BEST_ROUTE.recommended!.routeId,
  name: BEST_ROUTE.recommended!.routeName,
  vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 12 },
  driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
  studentCount: 8,
  seatsLeft: 4,
  school: { latitude: 33.8938, longitude: 35.5018, arrivalTime: "07:30" },
  stops: [
    {
      studentId: "40000000-0000-4000-8000-000000000001",
      position: 1,
      firstName: "Maya",
      lastName: "Haddad",
      address: "Bliss Street, Hamra",
      latitude: 33.8997,
      longitude: 35.4823,
      arrivalTime: "07:12",
    },
    {
      studentId: STUDENT_ID,
      position: 2,
      firstName: STUDENT_PAUSED.firstName,
      lastName: STUDENT_PAUSED.lastName,
      address: STUDENT_PAUSED.address,
      latitude: STUDENT_PAUSED.latitude,
      longitude: STUDENT_PAUSED.longitude,
      arrivalTime: "07:20",
    },
  ],
};

const PLACEMENT: BestRoutePlacement = { position: 2, extraMinutes: 1, arrivalTime: "07:20", route: ROUTE };

function mockFetchOnce(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    // An empty body (a 401) is not JSON.
    json: () => (body === undefined ? Promise.reject(new SyntaxError("Unexpected end of JSON input")) : Promise.resolve(body)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
}

async function expectApiError(promise: Promise<unknown>, status: number, message?: string) {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).not.toBeInstanceOf(ApiValidationError);
  expect((error as ApiError).status).toBe(status);
  if (message !== undefined) expect((error as ApiError).message).toBe(message);
}

async function expectValidationError(promise: Promise<unknown>, errors: Record<string, string>) {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ApiValidationError);
  expect((error as ApiValidationError).errors).toEqual(errors);
}

// The errors every endpoint shares (contract "Errors" table).
const COMMON_ERRORS: [string, number, unknown, string][] = [
  ["no session (401, empty body)", 401, undefined, "Request failed"],
  ["another role (403)", 403, { detail: "Access denied" }, "Access denied"],
  ["an unknown or other school's student (404)", 404, { detail: "Student not found" }, "Student not found"],
  ["a server error (5xx)", 500, { detail: "Internal Server Error" }, "Internal Server Error"],
  ["a gateway error with no JSON (502)", 502, undefined, "Request failed"],
];

const ON_A_BUS = "Tarek Mansour is on Hamra morning run (A 123456 07:05). Move them after the run ends.";
const NOT_ACTIVE = { studentId: "Only active students can be placed on a route." };
const PRECONDITIONS = [
  "The student is already on a route. Take them off it first, or move them by hand.",
  "The student has no pin yet. Set their address or place the pin first.",
  "The school's arrival time is not set, so no pickup time can be worked out.",
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the fixtures", () => {
  it("are the contract's samples, typed", () => {
    expect(STUDENT_PAUSED.status).toBe("paused");
    expect(BEST_ROUTE.recommended).toEqual(BEST_ROUTE.options[0]);
    expect(BEST_ROUTE.skipped.map((s) => s.reason)).toEqual(["FULL"]);
    expect(BEST_ROUTE_NONE.recommended).toBeNull();
    expect(BEST_ROUTE_NONE.options).toEqual([]);
    expect(BEST_ROUTE_NONE.skipped.map((s) => s.reason)).toEqual(["FULL", "STARTS_TOO_EARLY"]);
  });
});

describe("setStudentStatus", () => {
  it.each(["paused", "inactive", "active"] as const)(
    "PUTs { status: %s } to the student's status path and resolves with the student",
    async (status) => {
      const answer = { ...STUDENT_PAUSED, status };
      const fetchMock = mockFetchOnce(200, answer);

      await expect(setStudentStatus(STUDENT_ID, status)).resolves.toEqual(answer);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(`${STUDENT_URL}/status`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
  );

  it("parses the contract's paused student sample", async () => {
    mockFetchOnce(200, studentPausedFixture);

    const student = await setStudentStatus(STUDENT_ID, "paused");

    expect(student).toEqual(STUDENT_PAUSED);
    expect(student.status).toBe("paused");
    expect(student.route).toBeNull();
  });

  it("encodes the student id in the path", async () => {
    const fetchMock = mockFetchOnce(200, STUDENT_PAUSED);

    await setStudentStatus("a/b?c", "paused");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/head-of-transport/students/a%2Fb%3Fc/status",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("rejects a bad or missing status as an ApiValidationError on status (400)", async () => {
    mockFetchOnce(400, { errors: { status: "Status must be active, paused or inactive." } });

    await expectValidationError(setStudentStatus(STUDENT_ID, "paused"), {
      status: "Status must be active, paused or inactive.",
    });
  });

  it("rejects archived to paused as a plain ApiError 409 with the backend's detail", async () => {
    mockFetchOnce(409, { detail: "An archived student can only be restored to active." });

    await expectApiError(
      setStudentStatus(STUDENT_ID, "paused"),
      409,
      "An archived student can only be restored to active.",
    );
  });

  it("rejects pausing a student on a bus today as a plain ApiError 409 naming the child, bus and time", async () => {
    mockFetchOnce(409, { detail: ON_A_BUS });

    await expectApiError(setStudentStatus(STUDENT_ID, "paused"), 409, ON_A_BUS);
  });

  it.each(COMMON_ERRORS)("rejects %s as an ApiError", async (_case, status, body, message) => {
    mockFetchOnce(status, body);

    await expectApiError(setStudentStatus(STUDENT_ID, "inactive"), status, message);
  });

  it("rejects a network failure as it is", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(setStudentStatus(STUDENT_ID, "paused")).rejects.toThrow(TypeError);
  });
});

describe("getBestRoute", () => {
  it("GETs the student's best-route path with no body and no Content-Type", async () => {
    const fetchMock = mockFetchOnce(200, bestRouteFixture);

    await expect(getBestRoute(STUDENT_ID)).resolves.toEqual(BEST_ROUTE);
    expect(fetchMock).toHaveBeenCalledWith(`${STUDENT_URL}/best-route`, {
      method: "GET",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
  });

  it("parses the contract's sample: the recommended option first, then the others, and the skipped routes", async () => {
    mockFetchOnce(200, bestRouteFixture);

    const best = await getBestRoute(STUDENT_ID);

    expect(best.studentId).toBe(STUDENT_ID);
    expect(best.recommended).toEqual({
      routeId: "10000000-0000-4000-8000-000000000001",
      routeName: "Hamra morning run",
      position: 2,
      extraMinutes: 1,
      arrivalTime: "07:20",
      seatsLeft: 5,
    });
    expect(best.options.map((o) => o.routeName)).toEqual(["Hamra morning run", "Verdun morning run"]);
    expect(best.skipped).toEqual([
      { routeId: "10000000-0000-4000-8000-000000000003", routeName: "Achrafieh morning run", reason: "FULL" },
    ]);
  });

  it("resolves the no-feasible-route sample as a 200 with recommended null and no options", async () => {
    mockFetchOnce(200, bestRouteNoneFixture);

    const best = await getBestRoute(STUDENT_ID);

    expect(best).toEqual(BEST_ROUTE_NONE);
    expect(best.recommended).toBeNull();
    expect(best.options).toEqual([]);
    expect(best.skipped.map((s) => s.reason)).toEqual(["FULL", "STARTS_TOO_EARLY"]);
  });

  it("passes an unknown skip reason through instead of failing", async () => {
    const answer = { ...BEST_ROUTE_NONE, skipped: [{ routeId: "r-9", routeName: "Jounieh run", reason: "NO_DRIVER" }] };
    mockFetchOnce(200, answer);

    await expect(getBestRoute(STUDENT_ID)).resolves.toEqual(answer);
  });

  it("encodes the student id in the path", async () => {
    const fetchMock = mockFetchOnce(200, bestRouteFixture);

    await getBestRoute("a/b");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/head-of-transport/students/a%2Fb/best-route",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects a student who is not active as an ApiValidationError on studentId (409)", async () => {
    mockFetchOnce(409, { errors: NOT_ACTIVE });

    await expectValidationError(getBestRoute(STUDENT_ID), NOT_ACTIVE);
  });

  it.each(PRECONDITIONS)("rejects a precondition as a plain ApiError 409: %s", async (detail) => {
    mockFetchOnce(409, { detail });

    await expectApiError(getBestRoute(STUDENT_ID), 409, detail);
  });

  it.each(COMMON_ERRORS)("rejects %s as an ApiError", async (_case, status, body, message) => {
    mockFetchOnce(status, body);

    await expectApiError(getBestRoute(STUDENT_ID), status, message);
  });
});

describe("placeStudentOnBestRoute", () => {
  it("POSTs to the student's best-route path with no body and no Content-Type, resolving the 201", async () => {
    const fetchMock = mockFetchOnce(201, PLACEMENT);

    await expect(placeStudentOnBestRoute(STUDENT_ID)).resolves.toEqual(PLACEMENT);
    expect(fetchMock).toHaveBeenCalledWith(`${STUDENT_URL}/best-route`, {
      method: "POST",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
  });

  it("resolves with where the student went and the full route as it is now", async () => {
    mockFetchOnce(201, PLACEMENT);

    const placement = await placeStudentOnBestRoute(STUDENT_ID);

    expect(placement.position).toBe(BEST_ROUTE.recommended!.position);
    expect(placement.arrivalTime).toBe(BEST_ROUTE.recommended!.arrivalTime);
    expect(placement.route.id).toBe(BEST_ROUTE.recommended!.routeId);
    expect(placement.route.stops.find((s) => s.studentId === STUDENT_ID)).toMatchObject({
      position: 2,
      arrivalTime: "07:20",
    });
  });

  it("encodes the student id in the path", async () => {
    const fetchMock = mockFetchOnce(201, PLACEMENT);

    await placeStudentOnBestRoute("a/b");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/head-of-transport/students/a%2Fb/best-route",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects a student who is not active as an ApiValidationError on studentId (409)", async () => {
    mockFetchOnce(409, { errors: NOT_ACTIVE });

    await expectValidationError(placeStudentOnBestRoute(STUDENT_ID), NOT_ACTIVE);
  });

  it.each([
    ...PRECONDITIONS,
    "No route has a free seat and a schedule that can be driven for this student.",
    "The route filled up or changed while it was being chosen. Try again.",
  ])("rejects as a plain ApiError 409: %s", async (detail) => {
    mockFetchOnce(409, { detail });

    await expectApiError(placeStudentOnBestRoute(STUDENT_ID), 409, detail);
  });

  it.each(COMMON_ERRORS)("rejects %s as an ApiError", async (_case, status, body, message) => {
    mockFetchOnce(status, body);

    await expectApiError(placeStudentOnBestRoute(STUDENT_ID), status, message);
  });

  it("rejects a network failure as it is", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(placeStudentOnBestRoute(STUDENT_ID)).rejects.toThrow(TypeError);
  });
});
