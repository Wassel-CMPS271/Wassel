// Tests for the vehicles module (SCRUM-223), modeled on routes.test.ts and
// client.test.ts. The calls are checked against the contract's paths,
// methods and bodies with fetch mocked, plus how backend errors surface.

import { afterEach, describe, expect, it, vi } from "vitest";
import { addVehicle, deactivateVehicle, getVehicles, reactivateVehicle, setVehicleCapacity } from "./vehicles";
import { ApiValidationError } from "./errors";

const VEHICLES_URL = "http://localhost:8080/api/head-of-transport/vehicles";

const VEHICLE = {
  id: "v-1",
  plateNumber: "A 123456",
  capacity: 12,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("httpVehicles", () => {
  it("lists vehicles with a GET", async () => {
    const fetchMock = mockFetchOnce(true, 200, [VEHICLE]);

    await expect(getVehicles()).resolves.toEqual([VEHICLE]);
    expect(fetchMock).toHaveBeenCalledWith(VEHICLES_URL, expect.objectContaining({ method: "GET" }));
  });

  it("adds a vehicle with a POST of { plateNumber, capacity }", async () => {
    const fetchMock = mockFetchOnce(true, 201, VEHICLE);
    const input = { plateNumber: "A 123456", capacity: 12 };

    await expect(addVehicle(input)).resolves.toEqual(VEHICLE);
    expect(fetchMock).toHaveBeenCalledWith(
      VEHICLES_URL,
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("sets the capacity with a PATCH of { capacity } to the vehicle's capacity path, encoding the id", async () => {
    const updated = { ...VEHICLE, capacity: 20 };
    const fetchMock = mockFetchOnce(true, 200, updated);

    await expect(setVehicleCapacity("a/b", 20)).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenCalledWith(
      `${VEHICLES_URL}/a%2Fb/capacity`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ capacity: 20 }) }),
    );
  });

  it("deactivates a vehicle with a PATCH and no body, encoding the id", async () => {
    const deactivated = { ...VEHICLE, isActive: false };
    const fetchMock = mockFetchOnce(true, 200, deactivated);

    await expect(deactivateVehicle("a/b")).resolves.toEqual(deactivated);
    expect(fetchMock).toHaveBeenCalledWith(
      `${VEHICLES_URL}/a%2Fb/deactivate`,
      expect.objectContaining({ method: "PATCH", body: undefined }),
    );
  });

  it("reactivates a vehicle with a PATCH and no body, encoding the id", async () => {
    const fetchMock = mockFetchOnce(true, 200, VEHICLE);

    await expect(reactivateVehicle("a/b")).resolves.toEqual(VEHICLE);
    expect(fetchMock).toHaveBeenCalledWith(
      `${VEHICLES_URL}/a%2Fb/reactivate`,
      expect.objectContaining({ method: "PATCH", body: undefined }),
    );
  });
});

describe("error surfacing", () => {
  it("surfaces a duplicate plate as an ApiValidationError with the field message", async () => {
    mockFetchOnce(false, 400, { errors: { plateNumber: "A vehicle with that plate number already exists." } });

    try {
      await addVehicle({ plateNumber: "A 123456", capacity: 12 });
      expect.unreachable("expected addVehicle to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors).toEqual({
        plateNumber: "A vehicle with that plate number already exists.",
      });
    }
  });
});
