// Tests for the drivers module (SCRUM-223), modeled on vehicles.test.ts and
// client.test.ts. The calls are checked against the contract's paths,
// methods and bodies with fetch mocked, plus how backend errors surface.

import { afterEach, describe, expect, it, vi } from "vitest";
import { addDriver, assignDriverToVehicle, getDrivers, resendInvite, unassignDriver } from "./drivers";
import { ApiValidationError } from "./errors";

const DRIVERS_URL = "http://localhost:8080/api/head-of-transport/drivers";

const DRIVER = {
  id: "d-1",
  firstName: "Ahmad",
  lastName: "Khalil",
  phone: "+961 3 123 456",
  email: "ahmad.khalil@example.com",
  status: "invited",
  invitedAt: "2026-01-01T00:00:00Z",
  assignedVehicleId: null,
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

describe("httpDrivers", () => {
  it("lists drivers with a GET", async () => {
    const fetchMock = mockFetchOnce(true, 200, [DRIVER]);

    await expect(getDrivers()).resolves.toEqual([DRIVER]);
    expect(fetchMock).toHaveBeenCalledWith(DRIVERS_URL, expect.objectContaining({ method: "GET" }));
  });

  it("adds a driver with a POST of { firstName, lastName, phone, email }", async () => {
    const fetchMock = mockFetchOnce(true, 201, DRIVER);
    const input = {
      firstName: "Ahmad",
      lastName: "Khalil",
      phone: "+961 3 123 456",
      email: "ahmad.khalil@example.com",
    };

    await expect(addDriver(input)).resolves.toEqual(DRIVER);
    expect(fetchMock).toHaveBeenCalledWith(
      DRIVERS_URL,
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("resends an invite with a PATCH and no body, encoding the id", async () => {
    const fetchMock = mockFetchOnce(true, 200, DRIVER);

    await expect(resendInvite("a/b")).resolves.toEqual(DRIVER);
    expect(fetchMock).toHaveBeenCalledWith(
      `${DRIVERS_URL}/a%2Fb/resend-invite`,
      expect.objectContaining({ method: "PATCH", body: undefined }),
    );
  });

  it("assigns a driver to a vehicle with a PATCH of { vehicleId } to the driver's vehicle path, encoding the id", async () => {
    const assigned = { ...DRIVER, status: "active", assignedVehicleId: "v-1" };
    const fetchMock = mockFetchOnce(true, 200, assigned);

    await expect(assignDriverToVehicle("a/b", "v-1")).resolves.toEqual(assigned);
    expect(fetchMock).toHaveBeenCalledWith(
      `${DRIVERS_URL}/a%2Fb/vehicle`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ vehicleId: "v-1" }) }),
    );
  });

  it("unassigns a driver with a DELETE and no body, encoding the id", async () => {
    const unassigned = { ...DRIVER, status: "active", assignedVehicleId: null };
    const fetchMock = mockFetchOnce(true, 200, unassigned);

    await expect(unassignDriver("a/b")).resolves.toEqual(unassigned);
    expect(fetchMock).toHaveBeenCalledWith(
      `${DRIVERS_URL}/a%2Fb/vehicle`,
      expect.objectContaining({ method: "DELETE", body: undefined }),
    );
  });
});

describe("error surfacing", () => {
  it("surfaces a duplicate email as an ApiValidationError with the field message", async () => {
    mockFetchOnce(false, 409, { errors: { email: "A driver with that email already exists." } });

    try {
      await addDriver({
        firstName: "Sara",
        lastName: "Haddad",
        phone: "+961 70 234 567",
        email: "ahmad.khalil@example.com",
      });
      expect.unreachable("expected addDriver to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors).toEqual({
        email: "A driver with that email already exists.",
      });
    }
  });
});
