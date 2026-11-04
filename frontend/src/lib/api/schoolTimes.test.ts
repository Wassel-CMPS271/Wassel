import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiValidationError } from "./errors";
import { getSchoolTimes, saveSchoolTimes } from "./schoolTimes";

function mockFetchOnce(response: { ok: boolean; status: number; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: () => Promise.resolve(response.body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("school times API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gets the times from the admin school-settings endpoint", async () => {
    const times = { arrivalTime: "07:30", dismissalTime: "14:00" };
    const fetchMock = mockFetchOnce({ ok: true, status: 200, body: times });

    await expect(getSchoolTimes()).resolves.toEqual(times);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/admin/school-settings/times",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("puts both times as a JSON body and returns the saved times", async () => {
    const times = { arrivalTime: "07:30", dismissalTime: "14:00" };
    const fetchMock = mockFetchOnce({ ok: true, status: 200, body: times });

    await expect(saveSchoolTimes(times)).resolves.toEqual(times);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/admin/school-settings/times",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(times) }),
    );
  });

  it("surfaces the backend's field error when dismissal is not after arrival", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      body: { errors: { dismissalTime: "Dismissal time must be after arrival time" } },
    });

    await expect(
      saveSchoolTimes({ arrivalTime: "14:00", dismissalTime: "07:30" }),
    ).rejects.toBeInstanceOf(ApiValidationError);
  });
});
