import { afterEach, describe, expect, it, vi } from "vitest";
import pending from "../../../../docs/contracts/samples/address-requests/address-request-pending.json";
import { ApiError, ApiValidationError } from "./errors";
import {
  addressInputErrors, InvalidAddressRequestResponse, listParentAddressRequests, submitParentAddressRequest,
} from "./addressRequests";

afterEach(() => vi.unstubAllGlobals());
const child = pending.studentId;
function reply(body: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(new Response(
    status === 204 ? null : JSON.stringify(body), { status },
  ));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("SCRUM-281 parent address requests contract", () => {
  it("lists only requests belonging to the selected child using authenticated cookies", async () => {
    const fetcher = reply([pending]);
    expect(await listParentAddressRequests(child)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/parent/children/" + child + "/address-requests"),
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("parentUserId");
  });

  it("submits an optional pin and keeps the response pending until school approval", async () => {
    const fetcher = reply(pending, 201);
    const result = await submitParentAddressRequest(child, {
      address: "  Verdun Street 12, Beirut  ", latitude: 33.8707, longitude: 35.4842,
    });
    expect(result.status).toBe("pending");
    expect(result.currentAddress).toBe("Hamra Street, Beirut");
    expect(fetcher).toHaveBeenCalledWith(expect.any(String),
      expect.objectContaining({
        method: "POST", credentials: "include",
        body: JSON.stringify({ address: "Verdun Street 12, Beirut", latitude: 33.8707, longitude: 35.4842 }),
      }));
  });

  it("submits without invented pin values", async () => {
    const fetcher = reply(pending, 201);
    await submitParentAddressRequest(child, { address: pending.requestedAddress });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({ address: pending.requestedAddress });
  });

  it("validates required address, both coordinates and geographic bounds", () => {
    expect(addressInputErrors({ address: " ", latitude: "", longitude: "" }).address).toBeDefined();
    expect(addressInputErrors({ address: "a".repeat(256), latitude: "", longitude: "" }).address).toBeDefined();
    expect(addressInputErrors({ address: "Valid", latitude: "33", longitude: "" }).longitude).toBeDefined();
    expect(addressInputErrors({ address: "Valid", latitude: "91", longitude: "35" }).latitude).toBeDefined();
    expect(addressInputErrors({ address: "Valid", latitude: "33", longitude: "-181" }).longitude).toBeDefined();
    expect(addressInputErrors({ address: "Valid", latitude: "0", longitude: "0" })).toEqual({});
  });

  it("rejects text that only looks numeric", () => {
    for (const bad of ["abc", "33.8e", "--", "0x10", "1e1", "."])
      expect(addressInputErrors({ address: "Valid", latitude: bad, longitude: "35" }).latitude).toBeDefined();
    expect(addressInputErrors({ address: "Valid", latitude: "-33.5", longitude: ".5" })).toEqual({});
  });

  it("flags a 2xx submit reply that is not a valid request, so the caller can reload", async () => {
    reply({ ...pending, status: "weird" }, 201);
    await expect(submitParentAddressRequest(child, { address: "New" }))
      .rejects.toBeInstanceOf(InvalidAddressRequestResponse);
  });

  it("does not turn a failed POST into an optimistic approval", async () => {
    reply({ errors: { address: "Invalid address" } }, 400);
    await expect(submitParentAddressRequest(child, { address: "Wrong" }))
      .rejects.toBeInstanceOf(ApiValidationError);
    reply({ detail: "Pending request already exists" }, 409);
    await expect(submitParentAddressRequest(child, { address: "New" }))
      .rejects.toMatchObject({ status: 409 });
  });

  it.each([401, 403, 404, 500])("propagates HTTP %s instead of fake rows", async status => {
    reply({ detail: "private backend message" }, status);
    await expect(listParentAddressRequests(child)).rejects.toMatchObject({
      status, name: new ApiError(status).name,
    });
  });

  it("rejects other-child rows and malformed pins", async () => {
    reply([{ ...pending, studentId: "another-child" }]);
    await expect(listParentAddressRequests(child)).rejects.toThrow("Invalid address-request response");
    reply([{ ...pending, requestedLat: 30, requestedLng: null }]);
    await expect(listParentAddressRequests(child)).rejects.toThrow("Invalid address-request response");
  });

  it("preserves the honest empty state", async () => {
    reply([]);
    expect(await listParentAddressRequests(child)).toEqual([]);
  });
});
