// Tests for the head of transportation's two runs reads (SCRUM-255), modeled on drivers.test.ts: the calls
// are checked against the paths in docs/contracts/runs.md with fetch mocked.

import { afterEach, describe, expect, it, vi } from "vitest";
import { getAbsentStudents, getRunReassignments, getRunsDay, reassignRun } from "./runs";
import { ApiError, ApiValidationError } from "./errors";
import { getAbsentStudents as sampleAbsent, getRunsDay as sampleRuns } from "./runsSample";
import runsFixture from "./__fixtures__/runs/hot-runs.json";
import absencesFixture from "./__fixtures__/runs/hot-absences.json";
import reassignRequest from "../../../../docs/contracts/samples/runs/hot-reassign-request.json";
import reassignedRun from "../../../../docs/contracts/samples/runs/hot-reassign-run.json";
import reassignments from "../../../../docs/contracts/samples/runs/hot-reassignments.json";

const BASE = "http://localhost:8080/api/head-of-transport";

function mockFetchOnce(ok: boolean, status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runs reads", () => {
  it("reads the runs of today with a GET and no date", async () => {
    const fetchMock = mockFetchOnce(true, 200, runsFixture);

    await expect(getRunsDay()).resolves.toEqual(runsFixture);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/runs`, expect.objectContaining({ method: "GET" }));
  });

  it("asks for another date with ?date=", async () => {
    const fetchMock = mockFetchOnce(true, 200, runsFixture);

    await getRunsDay("2026-10-22");
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/runs?date=2026-10-22`, expect.anything());
  });

  it("reads the absent students with a GET, with or without a date", async () => {
    const fetchMock = mockFetchOnce(true, 200, absencesFixture);

    await expect(getAbsentStudents()).resolves.toEqual(absencesFixture);
    await getAbsentStudents("2026-10-22");
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${BASE}/absences`, expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${BASE}/absences?date=2026-10-22`, expect.anything());
  });

  it("surfaces a failure as an ApiError", async () => {
    mockFetchOnce(false, 403, { detail: "Access denied" });

    await expect(getRunsDay()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("run reassignment (SCRUM-264)", () => {
  const RUN = "50000000-0000-4000-8000-000000000001";

  it("POSTs the body to the run's reassignments and returns the run", async () => {
    const fetchMock = mockFetchOnce(true, 201, reassignedRun);

    await expect(reassignRun(RUN, reassignRequest)).resolves.toEqual(reassignedRun);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/runs/${RUN}/reassignments`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(reassignRequest) }),
    );
  });

  it("GETs the audit list", async () => {
    const fetchMock = mockFetchOnce(true, 200, reassignments);

    await expect(getRunReassignments(RUN)).resolves.toEqual(reassignments);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/runs/${RUN}/reassignments`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects a refused replacement as an ApiValidationError carrying the driver field", async () => {
    mockFetchOnce(false, 409, {
      detail: "Route assignment conflict",
      errors: { driverId: "Cannot put a deactivated driver on a route." },
    });

    await expect(reassignRun(RUN, reassignRequest)).rejects.toEqual(
      expect.objectContaining({ errors: { driverId: "Cannot put a deactivated driver on a route." } }),
    );
  });

  it("rejects a refused replacement with an ApiValidationError instance", async () => {
    mockFetchOnce(false, 409, { errors: { driverId: "Driver is already on route \"Verdun\"." } });

    await expect(reassignRun(RUN, reassignRequest)).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("rejects a stale precondition or a finished run as an ApiError with the detail", async () => {
    mockFetchOnce(false, 409, { detail: "The driver of this run is now Walid Saad. Reload and try again." });

    await expect(reassignRun(RUN, reassignRequest)).rejects.toMatchObject({
      status: 409,
      message: "The driver of this run is now Walid Saad. Reload and try again.",
    });
  });

  it("rejects a bad body (400) as an ApiValidationError naming the field", async () => {
    mockFetchOnce(false, 400, { errors: { reason: "size must be between 0 and 200" } });

    await expect(reassignRun(RUN, { ...reassignRequest, reason: "x".repeat(201) })).rejects.toEqual(
      expect.objectContaining({ errors: { reason: "size must be between 0 and 200" } }),
    );
  });

  it("rejects an unknown run (404) as an ApiError with the detail", async () => {
    mockFetchOnce(false, 404, { detail: "Run not found" });

    const rejected = reassignRun(RUN, reassignRequest);
    await expect(rejected).rejects.toBeInstanceOf(ApiError);
    await expect(rejected).rejects.toMatchObject({ status: 404, message: "Run not found" });
  });

  it("returns the run for a repeat that changes nothing (200), as for the first request (201)", async () => {
    mockFetchOnce(true, 200, reassignedRun);

    await expect(reassignRun(RUN, reassignRequest)).resolves.toEqual(reassignedRun);
  });

  it("reads an audit list with no changes as an empty array", async () => {
    mockFetchOnce(true, 200, []);

    await expect(getRunReassignments(RUN)).resolves.toEqual([]);
  });
});

describe("the temporary sample client", () => {
  it("answers with the contract's sample JSON, which has the same shape as the real calls", async () => {
    await expect(sampleRuns()).resolves.toEqual(runsFixture);
    await expect(sampleAbsent()).resolves.toEqual(absencesFixture);
  });
});
