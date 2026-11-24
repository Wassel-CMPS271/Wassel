import { afterEach, describe, expect, it, vi } from "vitest";
import pending from "../../../../docs/contracts/samples/address-requests/address-request-pending.json";
import attendance from "../../../../docs/contracts/samples/attendance/parent-attendance.json";
import { attendanceRangeErrors, getParentAttendance } from "./attendance";

afterEach(() => vi.unstubAllGlobals());
const child = pending.studentId;
function reply(body: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(new Response(
    status === 204 ? null : JSON.stringify(body), { status },
  ));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("SCRUM-281 parent attendance contract", () => {
  const from = "2026-11-03", to = "2026-11-04";
  it("uses the exact authorized child endpoint and required date range", async () => {
    const fetcher = reply(attendance);
    const rows = await getParentAttendance(child, { from, to });
    expect(rows.map(row => row.status)).toEqual(["DROPPED_OFF", "PICKED_UP", "NOT_PRESENT"]);
    expect(rows[1].notPresentAt).not.toBeNull(); // correction remains visible
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/parent/children/" + child + "/attendance?from=" + from + "&to=" + to),
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("includes both endpoints and allows exactly 62 days, not 63", () => {
    expect(attendanceRangeErrors({ from: "2026-01-01", to: "2026-03-03" })).toEqual({});
    expect(attendanceRangeErrors({ from: "2026-01-01", to: "2026-03-04" }).to).toBeDefined();
  });

  it.each([
    { from: "2026-11-05", to: "2026-11-04" },
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "", to: "2026-11-01" },
  ])("rejects invalid range %j without a network request", async range => {
    const fetcher = reply([]);
    await expect(getParentAttendance(child, range)).rejects.toThrow("Invalid attendance date range");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not substitute empty data for an unauthorized child", async () => {
    reply({ detail: "Child not found." }, 404);
    await expect(getParentAttendance(child, { from, to })).rejects.toMatchObject({ status: 404 });
  });

  it("rejects malformed record or response body", async () => {
    reply([{ ...attendance[0], direction: "UNKNOWN" }]);
    await expect(getParentAttendance(child, { from, to })).rejects.toThrow("Invalid attendance response");
    reply(null);
    await expect(getParentAttendance(child, { from, to })).rejects.toThrow("Invalid attendance list");
  });

  it("accepts an empty valid attendance period", async () => {
    reply([]);
    expect(await getParentAttendance(child, { from, to })).toEqual([]);
  });
});
