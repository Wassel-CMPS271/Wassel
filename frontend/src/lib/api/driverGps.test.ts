// driverGps.ts (SCRUM-273), modelled on client.test.ts: mocks fetch itself and checks
// what request() is asked to do, not the backend's real behaviour.

import { afterEach, describe, expect, it, vi } from "vitest";
import { driverGpsApi } from "./driverGps";
import { ApiError, ApiValidationError } from "./errors";
import type { Run } from "./runs";

function mockFetchOnce(response: { ok: boolean; status: number; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: response.json ?? (() => Promise.resolve(undefined)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sampleRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    date: "2026-11-09",
    direction: "MORNING",
    state: "IN_PROGRESS",
    schoolTime: "08:00",
    startedAt: "2026-11-09T05:00:00Z",
    endedAt: null,
    route: { id: "route-1", name: "Hamra morning run" },
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 14 },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    counts: { students: 0, absent: 0, pickedUp: 0, droppedOff: 0, notPresent: 0 },
    locationSharing: true,
    stops: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setSharing", () => {
  it("sends PUT .../location-sharing with { enabled } and resolves with the Run", async () => {
    const run = sampleRun();
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(run) });

    await expect(driverGpsApi.setSharing("run-1", { enabled: true })).resolves.toEqual(run);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/driver/runs/run-1/location-sharing",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
    );
  });

  it("sends { enabled: false } to withdraw sharing", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(sampleRun()) });

    await driverGpsApi.setSharing("run-1", { enabled: false });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ enabled: false }) }),
    );
  });

  it("throws ApiError on a 409 (not IN_PROGRESS, or sharing turned on by another driver)", async () => {
    mockFetchOnce({ ok: false, status: 409, json: () => Promise.resolve({ detail: "Run is not in progress" }) });

    await expect(driverGpsApi.setSharing("run-1", { enabled: true })).rejects.toBeInstanceOf(ApiError);
  });

  it("sends no timeoutMs, so an opt-in never aborts on its own", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(sampleRun()) });

    await driverGpsApi.setSharing("run-1", { enabled: true });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: undefined }));
  });
});

describe("sendPosition", () => {
  const position = { latitude: 33.9, longitude: 35.5, accuracyMeters: 10 };

  it("sends PUT .../location with the fix and resolves with undefined on 204", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });

    await expect(driverGpsApi.sendPosition("run-1", position)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/driver/runs/run-1/location",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(position),
      }),
    );
  });

  it("passes a ~10s timeoutMs, so a stuck send doesn't pile up behind the next fix", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });

    await driverGpsApi.sendPosition("run-1", position);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("throws ApiError on a 409 (sharing off, or the run isn't in progress)", async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ detail: "Location sharing is off for this run" }),
    });

    await expect(driverGpsApi.sendPosition("run-1", position)).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiValidationError on a 400 (latitude, longitude or accuracyMeters out of range)", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ errors: { latitude: "must be between -90 and 90" } }),
    });

    await expect(driverGpsApi.sendPosition("run-1", position)).rejects.toBeInstanceOf(ApiValidationError);
  });
});
