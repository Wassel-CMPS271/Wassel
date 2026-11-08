import { describe, expect, it } from "vitest";
import { ApiError, ApiValidationError } from "../api/errors";
import { classifyFailure } from "./classify";

describe("classifyFailure", () => {
  it("treats a fetch that never reached the server as a retryable network failure", () => {
    expect(classifyFailure(new TypeError("Failed to fetch"))).toEqual({
      kind: "retryable",
      network: true,
      message: "Failed to fetch",
    });
  });

  it.each(["AbortError", "TimeoutError"])("treats a %s (request timeout) as a network failure", (name) => {
    expect(classifyFailure(new DOMException("Timed out", name))).toMatchObject({
      kind: "retryable",
      network: true,
    });
  });

  it.each([408, 429, 500, 502, 503])("retries a %s, which reached the server", (status) => {
    expect(classifyFailure(new ApiError(status, "Busy"))).toEqual({
      kind: "retryable",
      network: false,
      status,
      message: "Busy",
    });
  });

  it("pauses on a 401", () => {
    expect(classifyFailure(new ApiError(401))).toEqual({
      kind: "auth",
      status: 401,
      message: "Request failed",
    });
  });

  it.each([404, 409])("treats a %s as a conflict, keeping the server's detail", (status) => {
    expect(classifyFailure(new ApiError(status, "Run is FINISHED"))).toEqual({
      kind: "conflict",
      status,
      message: "Run is FINISHED",
    });
  });

  it.each([400, 403, 410, 422])("rejects a %s", (status) => {
    expect(classifyFailure(new ApiError(status, "No"))).toEqual({
      kind: "rejected",
      status,
      message: "No",
    });
  });

  it("rejects a field error map with its first message", () => {
    expect(classifyFailure(new ApiValidationError({ status: "Status is required" }))).toEqual({
      kind: "rejected",
      message: "Status is required",
    });
  });

  it("retries anything unexpected, since resending with the same key is safe", () => {
    expect(classifyFailure(new SyntaxError("Unexpected token"))).toEqual({
      kind: "retryable",
      network: false,
      message: "Unexpected token",
    });
    expect(classifyFailure("weird")).toEqual({
      kind: "retryable",
      network: false,
      message: "Request failed",
    });
  });
});
