// Tests for the headOfTransport module (SCRUM-97), modeled on drivers.test.ts
// and client.test.ts. The call is checked against the contract's path,
// method and body with fetch mocked, plus how a backend error surfaces.

import { afterEach, describe, expect, it, vi } from "vitest";
import { inviteHeadOfTransport } from "./headOfTransport";
import { ApiValidationError } from "./errors";

const HEAD_OF_TRANSPORT_URL = "http://localhost:8080/api/admin/head-of-transport";

const ACCOUNT = {
  id: "a-1",
  email: "nour.saad@example.com",
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

describe("httpHeadOfTransport", () => {
  it("invites a head of transport with a POST of { email }", async () => {
    const fetchMock = mockFetchOnce(true, 201, ACCOUNT);

    await expect(inviteHeadOfTransport("nour.saad@example.com")).resolves.toEqual(ACCOUNT);
    expect(fetchMock).toHaveBeenCalledWith(
      HEAD_OF_TRANSPORT_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "nour.saad@example.com" }),
      }),
    );
  });
});

describe("error surfacing", () => {
  it("surfaces a duplicate email as an ApiValidationError with the field message", async () => {
    mockFetchOnce(false, 409, { errors: { email: "An account with this email already exists." } });

    try {
      await inviteHeadOfTransport("nour.saad@example.com");
      expect.unreachable("expected inviteHeadOfTransport to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors).toEqual({
        email: "An account with this email already exists.",
      });
    }
  });
});
