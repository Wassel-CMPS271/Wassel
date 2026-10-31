// Tests for the head of transportation's two runs reads (SCRUM-255), modeled on drivers.test.ts: the calls
// are checked against the paths in docs/contracts/runs.md with fetch mocked.

import { afterEach, describe, expect, it, vi } from "vitest";
import { getAbsentStudents, getRunsDay } from "./runs";
import { ApiError } from "./errors";
import { getAbsentStudents as sampleAbsent, getRunsDay as sampleRuns } from "./runsSample";
import runsFixture from "./__fixtures__/runs/hot-runs.json";
import absencesFixture from "./__fixtures__/runs/hot-absences.json";

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

describe("the temporary sample client", () => {
  it("answers with the contract's sample JSON, which has the same shape as the real calls", async () => {
    await expect(sampleRuns()).resolves.toEqual(runsFixture);
    await expect(sampleAbsent()).resolves.toEqual(absencesFixture);
  });
});
