// Example test for SCRUM-148/SCRUM-225: shows the pattern for testing a
// module that calls fetch, by mocking fetch itself. request() is the one
// place every API call goes through, so it's worth covering well.

import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "./client";
import { ApiError, ApiValidationError } from "./errors";

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: response.json ?? (() => Promise.resolve(undefined)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("request base URL", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // BASE_URL is read when the module loads, so each case sets the variable and imports it afresh.
  async function requestWithBaseUrl(value: string | undefined) {
    if (value === undefined) {
      vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", undefined as unknown as string);
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", value);
    }
    vi.resetModules();
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const { request: freshRequest } = await import("./client");
    await freshRequest("/api/auth/me");
    return fetchMock;
  }

  it("calls the local backend when the variable is not set", async () => {
    const fetchMock = await requestWithBaseUrl(undefined);

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8080/api/auth/me");
  });

  it("uses a relative URL when the variable is empty, so the app's own origin is called", async () => {
    const fetchMock = await requestWithBaseUrl("");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/me");
  });

  it("calls the given backend directly, ignoring a trailing slash", async () => {
    const fetchMock = await requestWithBaseUrl("https://api.example.com/");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/api/auth/me");
  });
});

describe("request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the backend's base URL with the given path", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await request("/api/admin/school-settings/times");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/admin/school-settings/times",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("always sends the session cookies", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await request("/api/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("sends Content-Type and a JSON body only when there is a body", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });

    await request("/api/auth/login", { method: "POST", body: { email: "a@b.com" } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@b.com" }),
      }),
    );
  });

  it.each(["PUT", "DELETE"] as const)("sends %s as the method", async (method) => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });

    await request("/api/head-of-transport/routes/r-1", { method });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method }),
    );
  });

  it("sends the JSON body with a PUT", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await request("/api/head-of-transport/routes/r-1", { method: "PUT", body: { name: "Hamra" } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hamra" }),
      }),
    );
  });

  it("sends no body and no Content-Type for a plain GET", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await request("/api/admin/school-calendar/holidays");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: undefined, body: undefined }),
    );
  });

  it("resolves with the parsed body on a 200", async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ arrivalTime: "07:30" }) });

    await expect(request("/api/admin/school-settings/times")).resolves.toEqual({
      arrivalTime: "07:30",
    });
  });

  it("resolves with undefined on a 204, without reading a body", async () => {
    const jsonSpy = vi.fn().mockResolvedValue({ shouldNotBeRead: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: jsonSpy }),
    );

    await expect(request("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("throws ApiValidationError when the backend sends a field error map", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: "Validation failed", errors: { date: "Date is required" } }),
    });

    await expect(request("/api/admin/school-calendar/holidays", { method: "POST", body: {} }))
      .rejects.toThrow(ApiValidationError);
  });

  it("carries every field error through to the caller", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ errors: { date: "Date is required" } }),
    });

    try {
      await request("/api/admin/school-calendar/holidays", { method: "POST", body: {} });
      expect.unreachable("expected request() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors).toEqual({ date: "Date is required" });
    }
  });

  it("throws ApiError with the status and detail when there is no error map", async () => {
    mockFetchOnce({ ok: false, status: 409, json: () => Promise.resolve({ detail: "Already exists" }) });

    try {
      await request("/api/admin/school-calendar/holidays", { method: "POST", body: {} });
      expect.unreachable("expected request() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).message).toBe("Already exists");
    }
  });

  it("throws ApiError with a fallback message when the error body is empty", async () => {
    // A 401 from /api/auth/me has no body, so .json() rejects rather than parsing.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await request("/api/auth/me");
      expect.unreachable("expected request() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect((error as ApiError).message).toBe("Request failed");
    }
  });

  it("rejects as a plain network failure when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(request("/api/auth/me")).rejects.toThrow("Failed to fetch");
  });
});
