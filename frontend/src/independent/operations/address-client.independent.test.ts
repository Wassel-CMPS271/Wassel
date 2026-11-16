import { afterEach, expect, it, vi } from "vitest";
import { candidate } from "@/test-support/operationsCandidate";
const ref = process.env.WASSEL_ROSTER_CANDIDATE || "HEAD";
interface Api { list(): Promise<unknown[]>; approve(id: string): Promise<unknown>; reject(id: string, reason?: string): Promise<unknown>; }
const api = () => candidate<{ addressRequestsApi: Api }>("lib/api/addressRequests.ts", ref).addressRequestsApi;
const row = { id: "request/a", studentId: "child", studentName: "Lina", currentAddress: "Saved", requestedAddress: "Proposed", requestedLat: 33.9, requestedLng: 35.5, requestedBy: { parentUserId: "parent", email: "parent@example.invalid" }, status: "pending", createdAt: "2026-11-16T07:00:00Z", decidedAt: null, rejectionReason: null };
function response(body: unknown, status = 200) { const fetcher = vi.fn().mockResolvedValue(Response.json(body, { status })); vi.stubGlobal("fetch", fetcher); return fetcher; }
afterEach(() => vi.unstubAllGlobals());
it("lists canonical pending address requests through the authenticated school scope", async () => {
 const f = response([row]); expect(await api().list()).toEqual([row]);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/api\/head-of-transport\/address-requests$/), expect.objectContaining({ method: "GET", credentials: "include" }));
 expect(f.mock.calls[0][1].body).toBeUndefined();
});
it("approves an encoded request id and preserves the authoritative receipt", async () => {
 const saved = { ...row, status: "approved", decidedAt: "2026-11-16T07:01:00Z" }; const f = response(saved); expect(await api().approve(row.id)).toEqual(saved);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/address-requests\/request%2Fa\/approve$/), expect.objectContaining({ method: "POST", credentials: "include" })); expect(f.mock.calls[0][1].body).toBeUndefined();
});
it("rejects with the optional trimmed reason through POST, without parent or school identity", async () => {
 const saved = { ...row, status: "rejected", rejectionReason: "Outside area" }; const f = response(saved); expect(await api().reject(row.id, " Outside area ")).toEqual(saved);
 expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/address-requests\/request%2Fa\/reject$/), expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify({ reason: "Outside area" }) }));
});
it("omits a blank rejection reason rather than sending invented data", async () => {
 const f = response({ ...row, status: "rejected" }); await api().reject(row.id, "  "); expect(f.mock.calls[0][1].body).toBeUndefined();
});
it.each([401, 403, 404, 409, 500])("retains decision HTTP %s for the screen's privacy/conflict/retry behavior", async status => {
 response({ detail: "Decision refused" }, status); await expect(api().approve(row.id)).rejects.toMatchObject({ status });
});
