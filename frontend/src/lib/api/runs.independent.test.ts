import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmStudent, endRun, getDriverToday, startRun } from "./runs";
import { ApiError } from "./errors";
import { day, instant, run, student } from "@/test-support/driverContract";

const fetch = vi.fn();
beforeEach(() => { fetch.mockReset(); vi.stubGlobal("fetch", fetch); });
afterEach(() => vi.unstubAllGlobals());

describe("SCRUM-243/244 real HTTP adapter contract", () => {
  it("loads today's runs with the session cookie", async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify(day())));
    expect(await getDriverToday()).toEqual(day());
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/driver\/runs\/today$/), expect.objectContaining({ method: "GET", credentials: "include" }));
  });

  it.each([["start", startRun, "IN_PROGRESS"], ["end", endRun, "FINISHED"]] as const)("POST %s returns the complete authoritative run", async (action, call, state) => {
    const result = run({ state, endedAt: state === "FINISHED" ? instant : null });
    fetch.mockResolvedValue(new Response(JSON.stringify(result)));
    expect(await call(result.id)).toEqual(result);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/api/driver/runs/${result.id}/${action}$`)), expect.objectContaining({ method: "POST", credentials: "include", body: undefined }));
  });

  it.each(["PICKED_UP", "DROPPED_OFF", "NOT_PRESENT"] as const)("PUT confirmation sends %s in JSON with cookies", async status => {
    const result = run({ stops: [student(1, { confirmation: { status, at: instant } })] });
    fetch.mockResolvedValue(new Response(JSON.stringify(result)));
    expect(await confirmStudent(result.id, result.stops[0].studentId, status)).toEqual(result);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/api/driver/runs/${result.id}/students/${result.stops[0].studentId}/confirmation$`)), expect.objectContaining({ method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }));
  });

  it.each([401, 403, 404, 409, 500])("does not swallow an HTTP %s action failure", async status => {
    fetch.mockResolvedValue(new Response(status === 401 ? null : JSON.stringify({ detail: "Action rejected" }), { status }));
    await expect(startRun(run().id)).rejects.toMatchObject({ status });
  });

  it("rejects a lost connection and allows a fresh retry with the same run ID", async () => {
    fetch.mockRejectedValueOnce(new TypeError("network offline")).mockResolvedValueOnce(new Response(JSON.stringify(run())));
    await expect(startRun(run().id)).rejects.toBeInstanceOf(TypeError);
    expect(await startRun(run().id)).toEqual(run());
    expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
  });

  it("keeps the server's illegal-transition detail for a useful UI error", async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ detail: "Run is FINISHED, so it cannot be started" }), { status: 409 }));
    await expect(startRun(run().id)).rejects.toEqual(new ApiError(409, "Run is FINISHED, so it cannot be started"));
  });
});
