// Tests for the parents module (SCRUM-223), modeled on drivers.test.ts and
// client.test.ts. The calls are checked against the contract's paths,
// methods and bodies with fetch mocked, plus how backend errors surface
// through parentError.

import { afterEach, describe, expect, it, vi } from "vitest";
import { getParents, inviteParent, parentError, type Parent } from "./parents";
import { ApiError, ApiValidationError } from "./errors";

const PARENTS_URL = "http://localhost:8080/api/head-of-transport/parents";

const PARENT: Parent = {
  id: "p-1",
  email: "rami.daher@example.com",
  status: "invited",
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

describe("httpParents", () => {
  it("lists parents with a GET", async () => {
    const fetchMock = mockFetchOnce(true, 200, [PARENT]);

    await expect(getParents()).resolves.toEqual([PARENT]);
    expect(fetchMock).toHaveBeenCalledWith(PARENTS_URL, expect.objectContaining({ method: "GET" }));
  });

  it("invites a parent with a POST of the trimmed email", async () => {
    const fetchMock = mockFetchOnce(true, 201, PARENT);

    await expect(inviteParent("  rami.daher@example.com  ")).resolves.toEqual(PARENT);
    expect(fetchMock).toHaveBeenCalledWith(
      PARENTS_URL,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "rami.daher@example.com" }) }),
    );
  });

  it("surfaces a duplicate email as an ApiValidationError with the field message", async () => {
    mockFetchOnce(false, 409, { errors: { email: "A parent with that email already exists." } });

    try {
      await inviteParent("rami.daher@example.com");
      expect.unreachable("expected inviteParent to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors).toEqual({
        email: "A parent with that email already exists.",
      });
    }
  });
});

describe("parentError", () => {
  it("joins every field message from an ApiValidationError", () => {
    const error = new ApiValidationError({ email: "Email is required.", phone: "Phone is invalid." });
    expect(parentError(error)).toBe("Email is required. Phone is invalid.");
  });

  it("maps a 401 to a session-expired message", () => {
    expect(parentError(new ApiError(401, "nope"))).toBe("Your session has expired. Please sign in again.");
  });

  it("maps a 403 to a permission message", () => {
    expect(parentError(new ApiError(403, "nope"))).toBe("You do not have permission to manage parents.");
  });

  it("maps a 404 to a not-available message", () => {
    expect(parentError(new ApiError(404, "nope"))).toBe(
      "The student or parent is no longer available. Refresh and try again.",
    );
  });

  it("uses the backend's own message for any other 4xx", () => {
    expect(parentError(new ApiError(400, "Email must be a valid address."))).toBe(
      "Email must be a valid address.",
    );
  });

  it("falls back to a generic message for a 5xx ApiError", () => {
    expect(parentError(new ApiError(500, "boom"))).toBe("Something went wrong. Please try again.");
  });

  it("falls back to a generic message for anything that isn't an ApiError or ApiValidationError", () => {
    expect(parentError(new TypeError("Failed to fetch"))).toBe("Something went wrong. Please try again.");
  });
});
