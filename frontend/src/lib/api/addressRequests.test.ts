// Tests for the addressRequests module (SCRUM-275), modeled on parents.test.ts
// and client.test.ts. The calls are checked against the contract's paths,
// methods and bodies with fetch mocked, including the error cases from
// docs/contracts/address-requests.md.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approveAddressRequest,
  listAddressRequests,
  rejectAddressRequest,
  type AddressRequest,
} from "./addressRequests";
import { ApiError, ApiValidationError } from "./errors";

const PATH = "http://localhost:8080/api/head-of-transport/address-requests";

const PENDING_REQUEST: AddressRequest = {
  id: "5d3c0b8e-2f4a-4d57-9a41-6c1b7e0a9f10",
  studentId: "0b6f2d9a-7c11-4f3e-8a52-3e9d4c7b1a20",
  studentName: "Tarek Mansour",
  currentAddress: "Hamra Street, Beirut",
  requestedAddress: "Verdun Street 12, Beirut",
  requestedLat: 33.8707,
  requestedLng: 35.4842,
  requestedBy: { parentUserId: "a1f4c6d2-9b30-4e8a-b7d5-2c0e8f3a6b41", email: "rana.mansour@example.com" },
  status: "pending",
  createdAt: "2026-11-09T07:30:00Z",
  decidedAt: null,
  rejectionReason: null,
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

describe("listAddressRequests", () => {
  it("makes a GET with no query string and resolves with the array", async () => {
    const fetchMock = mockFetchOnce(true, 200, [PENDING_REQUEST]);

    await expect(listAddressRequests()).resolves.toEqual([PENDING_REQUEST]);
    expect(fetchMock).toHaveBeenCalledWith(PATH, expect.objectContaining({ method: "GET" }));
  });

  it("resolves with an empty array", async () => {
    mockFetchOnce(true, 200, []);

    await expect(listAddressRequests()).resolves.toEqual([]);
  });
});

describe("approveAddressRequest", () => {
  it("makes a POST with no body, encoding the id, and resolves with the approved request", async () => {
    const approved = { ...PENDING_REQUEST, status: "approved" as const };
    const fetchMock = mockFetchOnce(true, 200, approved);

    await expect(approveAddressRequest("a/b")).resolves.toEqual(approved);
    expect(fetchMock).toHaveBeenCalledWith(
      `${PATH}/a%2Fb/approve`,
      expect.objectContaining({ method: "POST", body: undefined, headers: undefined }),
    );
  });
});

describe("rejectAddressRequest", () => {
  it("makes a POST with the trimmed reason as the body", async () => {
    const rejected = { ...PENDING_REQUEST, status: "rejected" as const };
    const fetchMock = mockFetchOnce(true, 200, rejected);

    await expect(rejectAddressRequest("req-1", "  Outside the service area.  ")).resolves.toEqual(rejected);
    expect(fetchMock).toHaveBeenCalledWith(
      `${PATH}/req-1/reject`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "Outside the service area." }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("makes a POST with no body when no reason is given", async () => {
    const rejected = { ...PENDING_REQUEST, status: "rejected" as const };
    const fetchMock = mockFetchOnce(true, 200, rejected);

    await expect(rejectAddressRequest("req-1")).resolves.toEqual(rejected);
    expect(fetchMock).toHaveBeenCalledWith(
      `${PATH}/req-1/reject`,
      expect.objectContaining({ method: "POST", body: undefined, headers: undefined }),
    );
  });

  it("makes a POST with no body when the reason is blank", async () => {
    const rejected = { ...PENDING_REQUEST, status: "rejected" as const };
    const fetchMock = mockFetchOnce(true, 200, rejected);

    await expect(rejectAddressRequest("req-1", "   ")).resolves.toEqual(rejected);
    expect(fetchMock).toHaveBeenCalledWith(
      `${PATH}/req-1/reject`,
      expect.objectContaining({ method: "POST", body: undefined, headers: undefined }),
    );
  });

  it("rejects with an ApiError when the request was already decided (409)", async () => {
    mockFetchOnce(false, 409, { detail: "This request was already approved at 2026-11-09T08:00:00Z." });

    try {
      await rejectAddressRequest("req-1");
      expect.unreachable("expected rejectAddressRequest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).message).toBe("This request was already approved at 2026-11-09T08:00:00Z.");
    }
  });

  it("rejects with an ApiError when the request is not found (404)", async () => {
    mockFetchOnce(false, 404, { detail: "Address request not found." });

    try {
      await rejectAddressRequest("req-1");
      expect.unreachable("expected rejectAddressRequest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
    }
  });

  it("rejects with an ApiValidationError when the reason is too long (400)", async () => {
    mockFetchOnce(false, 400, { errors: { reason: "Reason must be 255 characters or fewer" } });

    try {
      await rejectAddressRequest("req-1", "a".repeat(260));
      expect.unreachable("expected rejectAddressRequest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors).toEqual({
        reason: "Reason must be 255 characters or fewer",
      });
    }
  });
});

describe("approveAddressRequest errors", () => {
  it("rejects with an ApiValidationError when the student is inactive (409)", async () => {
    mockFetchOnce(false, 409, {
      detail: "Student not active",
      errors: { studentId: "Only active students can have an address request." },
    });

    try {
      await approveAddressRequest("req-1");
      expect.unreachable("expected approveAddressRequest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors).toEqual({
        studentId: "Only active students can have an address request.",
      });
    }
  });
});
