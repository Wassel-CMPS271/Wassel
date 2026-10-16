import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiValidationError } from "./errors";
import { addHalfDay, getHalfDays } from "./halfDays";
import { addHoliday, getHolidays } from "./holidays";

function mockFetchOnce(response: { ok: boolean; status: number; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: () => Promise.resolve(response.body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("holidays API", () => {
  it("gets the holidays from the school-calendar endpoint", async () => {
    const list = [{ id: "1", date: "2026-12-25", name: "Christmas" }];
    const fetchMock = mockFetchOnce({ ok: true, status: 200, body: list });

    await expect(getHolidays()).resolves.toEqual(list);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/admin/school-calendar/holidays",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("posts the date and name and returns the created holiday", async () => {
    const data = { date: "2026-12-25", name: "Christmas" };
    const fetchMock = mockFetchOnce({ ok: true, status: 201, body: { id: "1", ...data } });

    await expect(addHoliday(data)).resolves.toEqual({ id: "1", ...data });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/admin/school-calendar/holidays",
      expect.objectContaining({ method: "POST", body: JSON.stringify(data) }),
    );
  });

  it("surfaces the backend's field error when the date already has a holiday", async () => {
    mockFetchOnce({ ok: false, status: 409, body: { errors: { date: "Already a holiday" } } });

    await expect(addHoliday({ date: "2026-12-25", name: "Again" })).rejects.toBeInstanceOf(
      ApiValidationError,
    );
  });
});

describe("half-days API", () => {
  it("gets the half-days from the school-calendar endpoint", async () => {
    const list = [{ id: "1", date: "2026-12-24" }];
    const fetchMock = mockFetchOnce({ ok: true, status: 200, body: list });

    await expect(getHalfDays()).resolves.toEqual(list);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/admin/school-calendar/half-days",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("posts the date and returns the created half-day", async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 201, body: { id: "1", date: "2026-12-24" } });

    await expect(addHalfDay({ date: "2026-12-24" })).resolves.toEqual({ id: "1", date: "2026-12-24" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/admin/school-calendar/half-days",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ date: "2026-12-24" }) }),
    );
  });

  it("surfaces the backend's field error when the date is already a holiday", async () => {
    mockFetchOnce({ ok: false, status: 409, body: { errors: { date: "That date is a holiday" } } });

    await expect(addHalfDay({ date: "2026-12-25" })).rejects.toBeInstanceOf(ApiValidationError);
  });
});
