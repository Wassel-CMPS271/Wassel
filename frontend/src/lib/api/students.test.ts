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
  type ImportRow,
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

// Until the bulk endpoint exists (docs/contracts/students-import.md), each row
// is still one POST to single create, through the real request().
describe("importStudents", () => {
  const MAYBE_SAVED = "The import stopped here. This row may or may not have been saved.";
  const stoppedAt = (row: number) => `The import stopped at row ${row}.`;

  function importRow(row: number, overrides: Partial<NewStudent> = {}): ImportRow {
    return { row, ...NEW_STUDENT, ...overrides };
  }

  function postedBodies(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
  }

  const hadi = importRow(5, { firstName: "Hadi", lastName: "Bou Saab", guardianPhone: "+961 70 333 222" });
  const zeina = importRow(7, { firstName: "Zeina", lastName: "Fakhoury", guardianPhone: "+961 3 222 111" });
  const hadiStudent: Student = { ...STUDENT, id: "st-2", firstName: "Hadi", lastName: "Bou Saab" };

  it("creates each row with one POST, in order, and keeps each row's line number", async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, status: 201, body: STUDENT },
      { ok: true, status: 201, body: hadiStudent },
    ]);

    await expect(importStudents([importRow(2), hadi])).resolves.toEqual({
      result: {
        created: 2,
        rejected: 0,
        results: [
          { row: 2, status: "created", student: STUDENT },
          { row: 5, status: "created", student: hadiStudent },
        ],
      },
      notSent: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe(STUDENTS_URL);
      expect(init).toMatchObject({ method: "POST", credentials: "include" });
    }
  });

  it("sends single create's body, trimmed, and never the row number", async () => {
    const fetchMock = mockFetchSequence([{ ok: true, status: 201, body: STUDENT }]);

    await importStudents([importRow(3, { grade: " Grade 4 " })]);
    const [body] = postedBodies(fetchMock);
    expect(body).toEqual({ ...NEW_STUDENT, grade: "Grade 4" });
    expect(body).not.toHaveProperty("row");
  });

  it("rejects a row the server answers 409 with an errors map, keeping the server's errors as they are", async () => {
    const errors = { guardianPhone: "A student named Lina Daher with guardian phone +961 3 123 456 already exists." };
    mockFetchSequence([{ ok: false, status: 409, body: { detail: "Student already exists", errors } }]);

    await expect(importStudents([importRow(4)])).resolves.toEqual({
      result: { created: 0, rejected: 1, results: [{ row: 4, status: "rejected", errors }] },
      notSent: [],
    });
  });

  it("rejects a row the server answers 400 with an errors map, keeping every field name", async () => {
    const errors = {
      guardianPhone: 'Use a format like "+961 3 123 456" or "+961 70 234 567"',
      firstName: "First name must be 100 characters or fewer",
    };
    const fetchMock = mockFetchSequence([
      { ok: false, status: 400, body: { detail: "Validation failed", errors } },
      { ok: true, status: 201, body: hadiStudent },
    ]);

    const { result, notSent } = await importStudents([importRow(2), hadi]);
    expect(result.results[0]).toEqual({ row: 2, status: "rejected", errors });
    expect(Object.keys((result.results[0] as { errors: object }).errors)).toEqual(["guardianPhone", "firstName"]);
    expect(result.results[1]).toEqual({ row: 5, status: "created", student: hadiStudent });
    expect(result).toMatchObject({ created: 1, rejected: 1 });
    expect(notSent).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a plain 409 with no errors map under guardianPhone, as single create reports a duplicate", async () => {
    mockFetchSequence([{ ok: false, status: 409, body: { detail: "Student already exists" } }]);

    const { result } = await importStudents([importRow(2)]);
    expect(result.results).toEqual([
      { row: 2, status: "rejected", errors: { guardianPhone: "A student with this name and guardian phone already exists." } },
    ]);
  });

  it("stops at a plain 400 with no errors map, saying the row was not saved", async () => {
    const fetchMock = mockFetchSequence([{ ok: false, status: 400, body: { detail: "Malformed request body" } }]);

    await expect(importStudents([importRow(2), hadi])).resolves.toEqual({
      result: { created: 0, rejected: 0, results: [] },
      notSent: [
        { row: 2, message: "The server refused this row without saying why. It was not saved." },
        { row: 5, message: stoppedAt(2) },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a repeat of an earlier row without sending it, naming the first row's line", async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, status: 201, body: STUDENT },
      { ok: true, status: 201, body: hadiStudent },
    ]);
    // Same names in another letter case and the same phone; the grade and guardian name don't count.
    const repeat = importRow(9, { firstName: "LINA", lastName: " daher ", grade: "Grade 9", guardianName: "Someone Else" });

    const { result } = await importStudents([importRow(2), hadi, repeat]);
    expect(result.results[2]).toEqual({
      row: 9,
      status: "rejected",
      errors: { guardianPhone: "Same student and guardian phone as row 2." },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postedBodies(fetchMock).map((body) => body.firstName)).toEqual(["Lina", "Hadi"]);
  });

  it("names the first row even when the server rejected it", async () => {
    const errors = { guardianPhone: "A student named Lina Daher with guardian phone +961 3 123 456 already exists." };
    const fetchMock = mockFetchSequence([{ ok: false, status: 409, body: { errors } }]);

    const { result } = await importStudents([importRow(3), importRow(6)]);
    expect(result.results).toEqual([
      { row: 3, status: "rejected", errors },
      { row: 6, status: "rejected", errors: { guardianPhone: "Same student and guardian phone as row 3." } },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat the same names with another phone as a repeat", async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, status: 201, body: STUDENT },
      { ok: true, status: 201, body: STUDENT },
    ]);

    const { result } = await importStudents([importRow(2), importRow(3, { guardianPhone: "+961 3 999 999" })]);
    expect(result.created).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops at a network failure: earlier results stay, the failed row and every later row are not sent", async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, status: 201, body: STUDENT },
      new TypeError("Failed to fetch"),
    ]);

    await expect(importStudents([importRow(2), hadi, zeina, importRow(8)])).resolves.toEqual({
      result: { created: 1, rejected: 0, results: [{ row: 2, status: "created", student: STUDENT }] },
      notSent: [
        { row: 5, message: MAYBE_SAVED },
        { row: 7, message: stoppedAt(5) },
        { row: 8, message: stoppedAt(5) },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([500, 503, 401, 403])("stops the same way at a %i", async (status) => {
    const errors = { guardianPhone: "A student named Lina Daher with guardian phone +961 3 123 456 already exists." };
    const fetchMock = mockFetchSequence([
      { ok: false, status: 409, body: { errors } },
      { ok: false, status, body: status >= 500 ? { detail: "An unexpected error occurred" } : undefined },
    ]);

    await expect(importStudents([importRow(2), hadi, zeina])).resolves.toEqual({
      result: { created: 0, rejected: 1, results: [{ row: 2, status: "rejected", errors }] },
      notSent: [
        { row: 5, message: MAYBE_SAVED },
        { row: 7, message: stoppedAt(5) },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an empty result for no rows, without calling the server", async () => {
    const fetchMock = mockFetchSequence([]);

    await expect(importStudents([])).resolves.toEqual({
      result: { created: 0, rejected: 0, results: [] },
      notSent: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
