// Tests for the students module (SCRUM-223), modeled on drivers.test.ts and
// client.test.ts. The calls are checked against the contract's paths,
// methods and bodies with fetch mocked, plus how backend errors surface.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addStudent,
  addStudentWithAddress,
  getStudents,
  importStudents,
  linkStudentParent,
  matchesFilters,
  searchStudents,
  setStudentLocation,
  updateStudentAddress,
  type NewStudent,
  type Student,
} from "./students";
import { ApiValidationError } from "./errors";

const STUDENTS_URL = "http://localhost:8080/api/head-of-transport/students";

const STUDENT: Student = {
  id: "st-1",
  firstName: "Lina",
  lastName: "Daher",
  grade: "Grade 4",
  guardianName: "Rami Daher",
  guardianPhone: "+961 3 123 456",
  status: "active",
  address: "Hamra Street, Beirut",
  latitude: null,
  longitude: null,
  route: null,
  parentUserId: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const NEW_STUDENT: NewStudent = {
  firstName: "Lina",
  lastName: "Daher",
  grade: "Grade 4",
  guardianName: "Rami Daher",
  guardianPhone: "+961 3 123 456",
};

function mockFetchOnce(ok: boolean, status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockFetchSequence(responses: Array<{ ok: boolean; status: number; body?: unknown } | Error>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
    } else {
      const { ok, status, body } = response;
      fetchMock.mockResolvedValueOnce({ ok, status, json: () => Promise.resolve(body) });
    }
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("httpStudents", () => {
  it("lists students with a GET and no query string when there are no filters", async () => {
    const fetchMock = mockFetchOnce(true, 200, [STUDENT]);

    await expect(getStudents()).resolves.toEqual([STUDENT]);
    expect(fetchMock).toHaveBeenCalledWith(STUDENTS_URL, expect.objectContaining({ method: "GET" }));
  });

  it("includes query, status, grade and route filters in the query string", async () => {
    const fetchMock = mockFetchOnce(true, 200, [STUDENT]);

    await getStudents({ query: "lina", status: "active", grade: "Grade 4", route: "R1" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${STUDENTS_URL}?query=lina&status=active&grade=Grade+4&route=R1`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it('omits status, grade and route from the query string when they are "all", and trims the query', async () => {
    const fetchMock = mockFetchOnce(true, 200, [STUDENT]);

    await getStudents({ query: "  lina  ", status: "all", grade: "all", route: "all" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${STUDENTS_URL}?query=lina`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends no query string for a whitespace-only query and no other filters", async () => {
    const fetchMock = mockFetchOnce(true, 200, [STUDENT]);

    await getStudents({ query: "   " });
    expect(fetchMock).toHaveBeenCalledWith(STUDENTS_URL, expect.objectContaining({ method: "GET" }));
  });

  it("searches students using the query filter", async () => {
    const fetchMock = mockFetchOnce(true, 200, [STUDENT]);

    await expect(searchStudents("lina")).resolves.toEqual([STUDENT]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${STUDENTS_URL}?query=lina`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("adds a student with a POST of the trimmed required fields, without an address when none is given", async () => {
    const fetchMock = mockFetchOnce(true, 201, STUDENT);
    const input: NewStudent = {
      firstName: " Lina ",
      lastName: " Daher ",
      grade: " Grade 4 ",
      guardianName: " Rami Daher ",
      guardianPhone: " +961 3 123 456 ",
    };

    await expect(addStudent(input)).resolves.toEqual(STUDENT);
    expect(fetchMock).toHaveBeenCalledWith(
      STUDENTS_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          firstName: "Lina",
          lastName: "Daher",
          grade: "Grade 4",
          guardianName: "Rami Daher",
          guardianPhone: "+961 3 123 456",
        }),
      }),
    );
  });

  it("includes a trimmed address in the POST body when one is given", async () => {
    const fetchMock = mockFetchOnce(true, 201, STUDENT);

    await addStudent({ ...NEW_STUDENT, address: " Hamra Street, Beirut " });
    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.address).toBe("Hamra Street, Beirut");
  });

  it("updates a student's address with a PATCH of the trimmed address, encoding the id", async () => {
    const fetchMock = mockFetchOnce(true, 200, { ...STUDENT, address: "Verdun, Beirut" });

    await expect(updateStudentAddress("a/b", " Verdun, Beirut ")).resolves.toEqual({
      ...STUDENT,
      address: "Verdun, Beirut",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${STUDENTS_URL}/a%2Fb/address`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ address: "Verdun, Beirut" }) }),
    );
  });

  it("sets a student's pickup location with a PATCH of latitude and longitude, encoding the id", async () => {
    const updated = { ...STUDENT, latitude: 33.9, longitude: 35.5 };
    const fetchMock = mockFetchOnce(true, 200, updated);

    await expect(setStudentLocation("a/b", 33.9, 35.5)).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenCalledWith(
      `${STUDENTS_URL}/a%2Fb/location`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ latitude: 33.9, longitude: 35.5 }) }),
    );
  });

  it("links a parent to a student with a PATCH of parentUserId, encoding the id", async () => {
    const updated = { ...STUDENT, parentUserId: "p-1" };
    const fetchMock = mockFetchOnce(true, 200, updated);

    await expect(linkStudentParent("a/b", "p-1")).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenCalledWith(
      `${STUDENTS_URL}/a%2Fb/parent`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ parentUserId: "p-1" }) }),
    );
  });

  it("surfaces a duplicate student as an ApiValidationError keyed by guardianPhone", async () => {
    mockFetchOnce(false, 409, {
      errors: { guardianPhone: "A student named Lina Daher with guardian phone +961 3 123 456 already exists." },
    });

    try {
      await addStudent(NEW_STUDENT);
      expect.unreachable("expected addStudent to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors).toEqual({
        guardianPhone: "A student named Lina Daher with guardian phone +961 3 123 456 already exists.",
      });
    }
  });
});

describe("addStudentWithAddress", () => {
  it("returns addressSaved true, with a single request, when the create response already carries the trimmed address", async () => {
    const created = { ...STUDENT, address: "Hamra Street, Beirut" };
    const fetchMock = mockFetchSequence([{ ok: true, status: 201, body: created }]);

    await expect(addStudentWithAddress({ ...NEW_STUDENT, address: " Hamra Street, Beirut " })).resolves.toEqual({
      student: created,
      addressSaved: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a PATCH when the create response's address doesn't match, returning addressSaved true on success", async () => {
    const created = { ...STUDENT, address: null };
    const updated = { ...STUDENT, address: "Hamra Street, Beirut" };
    const fetchMock = mockFetchSequence([
      { ok: true, status: 201, body: created },
      { ok: true, status: 200, body: updated },
    ]);

    await expect(addStudentWithAddress({ ...NEW_STUDENT, address: "Hamra Street, Beirut" })).resolves.toEqual({
      student: updated,
      addressSaved: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${STUDENTS_URL}/${created.id}/address`);
  });

  it("returns addressSaved false without throwing when both create and the PATCH fallback fail to persist the address", async () => {
    const created = { ...STUDENT, address: null };
    const fetchMock = mockFetchSequence([
      { ok: true, status: 201, body: created },
      new TypeError("Failed to fetch"),
    ]);

    await expect(addStudentWithAddress({ ...NEW_STUDENT, address: "Hamra Street, Beirut" })).resolves.toEqual({
      student: created,
      addressSaved: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("matchesFilters", () => {
  it("matches everything when there are no filters", () => {
    expect(matchesFilters(STUDENT)).toBe(true);
    expect(matchesFilters(STUDENT, {})).toBe(true);
  });

  it("filters by exact status, and ignores status when it is \"all\"", () => {
    expect(matchesFilters(STUDENT, { status: "active" })).toBe(true);
    expect(matchesFilters(STUDENT, { status: "inactive" })).toBe(false);
    expect(matchesFilters(STUDENT, { status: "all" })).toBe(true);
  });

  it("filters by exact grade, and ignores grade when it is \"all\"", () => {
    expect(matchesFilters(STUDENT, { grade: "Grade 4" })).toBe(true);
    expect(matchesFilters(STUDENT, { grade: "Grade 5" })).toBe(false);
    expect(matchesFilters(STUDENT, { grade: "all" })).toBe(true);
  });

  it("filters by exact route, and ignores route when it is \"all\"", () => {
    const onRoute = { ...STUDENT, route: "R1" };
    expect(matchesFilters(onRoute, { route: "R1" })).toBe(true);
    expect(matchesFilters(onRoute, { route: "R2" })).toBe(false);
    expect(matchesFilters(onRoute, { route: "all" })).toBe(true);
  });

  it("matches the query against first name, last name or guardian name, case-insensitively and trimmed", () => {
    expect(matchesFilters(STUDENT, { query: "  lina  " })).toBe(true);
    expect(matchesFilters(STUDENT, { query: "DAHER" })).toBe(true);
    expect(matchesFilters(STUDENT, { query: "rami" })).toBe(true);
    expect(matchesFilters(STUDENT, { query: "nonexistent" })).toBe(false);
  });

  it("excludes a student that fails any one of several filters", () => {
    expect(matchesFilters(STUDENT, { status: "active", grade: "Grade 5" })).toBe(false);
  });
});

describe("importStudents", () => {
  it("imports valid rows one by one in order and returns the created student for each", async () => {
    const second: NewStudent = { ...NEW_STUDENT, firstName: "Hadi", guardianPhone: "+961 70 333 222" };
    const secondStudent: Student = { ...STUDENT, id: "st-2", firstName: "Hadi" };
    const fetchMock = mockFetchSequence([
      { ok: true, status: 201, body: STUDENT },
      { ok: true, status: 201, body: secondStudent },
    ]);

    const results = await importStudents([NEW_STUDENT, second]);
    expect(results).toEqual([
      { status: "success", row: NEW_STUDENT, student: STUDENT },
      { status: "success", row: second, student: secondStudent },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a row with missing required fields without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const incomplete: NewStudent = { ...NEW_STUDENT, lastName: "" };

    const results = await importStudents([incomplete]);
    expect(results).toEqual([
      {
        status: "error",
        row: incomplete,
        reason: "missing_fields",
        message: "First name, last name, grade, guardian name and guardian phone are required.",
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a repeated student and guardian phone within the batch as a duplicate, without calling the API for it", async () => {
    const fetchMock = mockFetchSequence([{ ok: true, status: 201, body: STUDENT }]);

    const results = await importStudents([NEW_STUDENT, { ...NEW_STUDENT }]);
    expect(results[0]).toEqual({ status: "success", row: NEW_STUDENT, student: STUDENT });
    expect(results[1]).toEqual({
      status: "error",
      row: NEW_STUDENT,
      reason: "duplicate_in_batch",
      message: "This student and guardian phone appear more than once in the CSV file.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a 409 duplicate from the backend as duplicate_existing, using the backend's message", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 409,
        body: { errors: { guardianPhone: "A student named Lina Daher with guardian phone +961 3 123 456 already exists." } },
      },
    ]);

    const results = await importStudents([NEW_STUDENT]);
    expect(results).toEqual([
      {
        status: "error",
        row: NEW_STUDENT,
        reason: "duplicate_existing",
        message: "A student named Lina Daher with guardian phone +961 3 123 456 already exists.",
      },
    ]);
  });

  it("reports a plain ApiError 409 (no errors map) as duplicate_existing too", async () => {
    mockFetchSequence([{ ok: false, status: 409, body: { detail: "Conflict" } }]);

    const results = await importStudents([NEW_STUDENT]);
    expect(results).toEqual([
      { status: "error", row: NEW_STUDENT, reason: "duplicate_existing", message: "Conflict" },
    ]);
  });

  it("reports a 400 validation failure that isn't a duplicate as invalid_fields", async () => {
    mockFetchSequence([{ ok: false, status: 400, body: { errors: { grade: "Grade is required." } } }]);

    const results = await importStudents([NEW_STUDENT]);
    expect(results).toEqual([
      { status: "error", row: NEW_STUDENT, reason: "invalid_fields", message: "Grade is required." },
    ]);
  });

  it("marks a row as request_failed on a network failure, then skips the API for every row after it", async () => {
    const third: NewStudent = { ...NEW_STUDENT, firstName: "Zeina", guardianPhone: "+961 3 222 111" };
    const fetchMock = mockFetchSequence([
      { ok: true, status: 201, body: STUDENT },
      new TypeError("Failed to fetch"),
    ]);
    const second: NewStudent = { ...NEW_STUDENT, firstName: "Hadi", guardianPhone: "+961 70 333 222" };

    const results = await importStudents([NEW_STUDENT, second, third]);
    expect(results[0]).toEqual({ status: "success", row: NEW_STUDENT, student: STUDENT });
    expect(results[1]).toEqual({
      status: "error",
      row: second,
      reason: "request_failed",
      message: "The request could not be completed. Verify the backend connection and retry this row.",
    });
    expect(results[2]).toEqual({
      status: "error",
      row: third,
      reason: "request_failed",
      message: "Not attempted because the API became unavailable. Retry this row later.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
