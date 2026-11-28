import { afterEach, expect, it, vi } from "vitest";
import { addressRequestsApi, type AddressRequest } from "@/lib/api/addressRequests";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
const api = () => addressRequestsApi;
const row: AddressRequest = { id: "request/a", studentId: "child", studentName: "Lina", currentAddress: "Saved", requestedAddress: "Proposed", requestedLat: 33.9, requestedLng: 35.5, requestedBy: { parentUserId: "parent", email: "parent@example.invalid" }, status: "pending", createdAt: "2026-11-16T07:00:00Z", decidedAt: null, rejectionReason: null };
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
it.each([401, 403, 404, 409, 500])("propagates HTTP %s to the decision screen without client-side retries", async status => {
 const f = response({ detail: "Decision refused" }, status);
 const pending = api().approve(row.id);
 await expect(pending).rejects.toBeInstanceOf(ApiError);
 await expect(pending).rejects.toMatchObject({ status, message: "Decision refused" });
 expect(f).toHaveBeenCalledTimes(1);
});

it("retains a 400 field map as ApiValidationError for inline form handling", async () => {
 const f = response({ errors: { reason: "Reason was refused" } }, 400);
 const pending = api().reject(row.id, "Entered reason");
 await expect(pending).rejects.toBeInstanceOf(ApiValidationError);
 await expect(pending).rejects.toMatchObject({ errors: { reason: "Reason was refused" } });
 expect(f).toHaveBeenCalledTimes(1);
});
