import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelAbsence, getAbsences, isSchoolDate, reportAbsence, schoolToday } from "./absences";
import { ApiError, ApiValidationError } from "./errors";

afterEach(() => vi.unstubAllGlobals());
const row = { id: "absence", studentId: "child", fromDate: "2026-11-02", toDate: "2026-11-03" };
function reply(body: unknown, status = 200) { const fetcher = vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status })); vi.stubGlobal("fetch", fetcher); return fetcher; }

describe("contract absence client", () => {
  it("uses authenticated child paths, validates and sorts records", async () => {
    const fetcher = reply([row, { ...row, id: "earlier", fromDate: "2026-11-01" }]);
    expect((await getAbsences("child"))[0].id).toBe("earlier");
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/api/parent/children/child/absences"), expect.objectContaining({ credentials: "include", method: "GET" }));
  });
  it.each([200, 201])("accepts POST status %s without duplicating client semantics", async status => {
    const fetcher = reply(row, status);
    expect(await reportAbsence("child", { fromDate: row.fromDate })).toEqual(row);
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "POST", body: JSON.stringify({ fromDate: row.fromDate }) }));
  });
  it("encodes identifiers and accepts empty DELETE 204", async () => {
    const fetcher = reply(null, 204); await cancelAbsence("child/a", "absence/b");
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("child%2Fa/absences/absence%2Fb"), expect.objectContaining({ method: "DELETE", credentials: "include" }));
  });
  it.each([null, {}, [{ ...row, studentId: "foreign" }], [{ ...row, fromDate: "2026-02-30" }], [{ ...row, toDate: "2026-01-01" }]])("rejects malformed/foreign records: %j", async value => {
    reply(value); await expect(getAbsences("child")).rejects.toThrow();
  });
  it.each([400, 409])("retains field errors for HTTP %s", async status => {
    reply({ errors: { fromDate: "Overlaps existing absence" } }, status);
    await expect(reportAbsence("child", { fromDate: row.fromDate })).rejects.toBeInstanceOf(ApiValidationError);
  });
  it.each([401, 403, 404, 500])("retains HTTP %s failures", async status => {
    reply({}, status); await expect(getAbsences("child")).rejects.toMatchObject({ status, name: new ApiError(status).name });
  });
});
describe("school date boundaries", () => {
  it("uses Beirut tomorrow even while UTC is yesterday", () => expect(schoolToday(new Date("2026-11-01T22:30:00Z"))).toBe("2026-11-02"));
  it("handles the Beirut summer offset", () => expect(schoolToday(new Date("2026-07-01T21:30:00Z"))).toBe("2026-07-02"));
  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "01/11/2026", ""])("rejects invalid date %s", value => expect(isSchoolDate(value)).toBe(false));
  it("accepts a real leap day", () => expect(isSchoolDate("2028-02-29")).toBe(true));
});
