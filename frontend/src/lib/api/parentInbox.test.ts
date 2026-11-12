import { afterEach, expect, it, vi } from "vitest";
import { parentInboxApi as api } from "./parentInbox";
afterEach(() => vi.unstubAllGlobals());
const event = { id: "a", type: "PICKED_UP", studentId: "s", studentName: "Lina", runId: "r", direction: "MORNING", createdAt: "2026-11-09T07:00:00Z", readAt: null };
function response(value: unknown, status = 200) { const fetcher = vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(value), { status })); vi.stubGlobal("fetch", fetcher); return fetcher; }
it("lists through the parent cookie session without a user identity parameter", async () => { const fetcher = response([event]); expect(await api.list(true)).toEqual([event]); expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/api/parent/inbox?unread=true"), expect.objectContaining({ credentials: "include", method: "GET" })); });
it("reads the server's total rather than the listed 50", async () => { response({ count: 73 }); expect(await api.unreadCount()).toBe(73); });
it.each([-1, 1.5, "3", null])("rejects malformed count %j", async count => { response({ count }); await expect(api.unreadCount()).rejects.toThrow(); });
it("marks an encoded entry read with POST and retains the server receipt", async () => { const saved = { ...event, id: "a/b", readAt: "2026-11-09T08:00:00Z" }; const fetcher = response(saved); expect(await api.markRead("a/b")).toEqual(saved); expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/inbox/a%2Fb/read"), expect.objectContaining({ method: "POST", credentials: "include" })); });
it("does not accept another entry's receipt", async () => { response({ ...event, readAt: "2026-11-09T08:00:00Z" }); await expect(api.markRead("different")).rejects.toThrow(); });
it("supports read-all's empty 204", async () => { const f = response(null, 204); await api.markAllRead(); expect(f).toHaveBeenCalledWith(expect.stringContaining("/inbox/read-all"), expect.objectContaining({ method: "POST" })); });
it.each([401, 403, 404, 500])("retains HTTP %s", async status => { response(null, status); await expect(api.list()).rejects.toMatchObject({ status }); });
it.each([[{ ...event, type: "LATE" }], [event, event], [{ ...event, createdAt: "bad" }], null])("rejects unsupported or malformed events %j", async rows => { response(rows); await expect(api.list()).rejects.toThrow(); });

it.each([401, 403, 404, 409, 500])("retains mutation HTTP %s and never fabricates a receipt", async status => {
  const fetcher = response(null, status); await expect(api.markRead("child/event")).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/inbox/child%2Fevent/read"), expect.objectContaining({ credentials: "include", method: "POST" }));
});
it("read-all sends no parent or student identity and no preference payload", async () => {
  const fetcher = response(null, 204); await api.markAllRead();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include" });
  expect(fetcher.mock.calls[0][1].body).toBeUndefined(); expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/parent\/inbox\/read-all$/);
});
