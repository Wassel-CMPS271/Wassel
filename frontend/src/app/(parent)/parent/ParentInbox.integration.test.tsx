import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ParentPage from "./page";
import { ParentInboxHome } from "./ParentInboxHome";
import { parentInboxApi, createParentInboxApi, type InboxEvent } from "@/lib/api/parentInbox";
import { notificationPreferencesApi } from "@/lib/api/notificationPreferences";
import { family } from "@/test-support/parentNavigation";
afterEach(() => vi.unstubAllGlobals());
const base: InboxEvent = { id: "event/a", type: "PICKED_UP", studentId: family[0].studentId, studentName: "Lina", runId: "run", direction: "MORNING", createdAt: "2026-11-14T07:00:00Z", readAt: null };
it("production lazily uses the real request client for counts and persistent read receipts", async () => {
 let rows: InboxEvent[] = [base, { ...base, id: "b", studentId: family[1].studentId, studentName: "Omar" }]; let count = 73;
 const f = vi.fn(async (url: string, options: RequestInit) => {
   if (url.endsWith("/children")) return Response.json(family);
   if (url.endsWith("/unread-count")) return Response.json({ count });
   if (url.endsWith("/inbox/event%2Fa/read")) { rows = rows.map(r => r.id === base.id ? { ...r, readAt: "2026-11-14T08:00:00Z" } : r); count = 72; return Response.json(rows[0]); }
   if (url.endsWith("/read-all")) { rows = rows.map(r => ({ ...r, readAt: "2026-11-14T08:00:00Z" })); count = 0; return new Response(null, { status: 204 }); }
   if (url.endsWith("/inbox")) return Response.json(rows);
   throw new Error(`Unexpected production request ${url} ${options.method}`);
 }); vi.stubGlobal("fetch", f);
 const view = render(<ParentPage />); await screen.findByText("Lina Navigation"); expect(f).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole("button", { name: "Inbox" })); await screen.findByText("73 unread updates");
 fireEvent.click(screen.getByRole("button", { name: "Mark update for Lina as read" })); await screen.findByText("72 unread updates");
 expect(screen.getByRole("button", { name: "Mark update for Omar as read" })).toBeVisible();
 expect(f).toHaveBeenCalledWith(expect.stringContaining("/inbox/event%2Fa/read"), expect.objectContaining({ credentials: "include", method: "POST" }));
 view.unmount(); render(<ParentPage />); await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: "Inbox" })); await screen.findByText("Read");
 fireEvent.click(screen.getByText("Mark all as read")); await screen.findByText("0 unread updates"); expect(screen.getAllByText("Read")).toHaveLength(2);
 expect(f.mock.calls.some(([url]) => /notification-preferences/.test(url))).toBe(false);
});
it("production clears private inbox data on revoked access and restores it only after a successful retry", async () => {
 let denied = false; const f = vi.fn(async (url: string) => url.endsWith("/children") ? Response.json(family) : denied ? new Response(null, { status: 403 }) : url.endsWith("/unread-count") ? Response.json({ count: 1 }) : Response.json([base])); vi.stubGlobal("fetch", f);
 render(<ParentPage />); await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: "Inbox" })); await screen.findByText("Lina: Picked up");
 denied = true; fireEvent.click(screen.getByText("Refresh inbox")); await screen.findByRole("alert"); expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument();
 denied = false; fireEvent.click(screen.getByText("Refresh inbox")); expect(await screen.findByText("Lina: Picked up")).toBeVisible();
});
it("prepared preferences use the canonical GET/PUT and LATE only when explicitly enabled", async () => {
 let pref = { pickedUp: true, droppedOff: true, notPresent: true, late: true, lateAfterMinutes: 10 };
 const f = vi.fn(async (url: string, options: RequestInit) => {
  if (url.endsWith("/children")) return Response.json(family);
  if (url.endsWith("/notification-preferences")) { if (options.method === "PUT") pref = JSON.parse(String(options.body)); return Response.json(pref); }
  if (url.endsWith("/unread-count")) return Response.json({ count: 1 });
  return Response.json([{ ...base, type: "LATE" }]);
 }); vi.stubGlobal("fetch", f);
 render(<ParentInboxHome api={createParentInboxApi({ allowLate: true })} preferencesApi={notificationPreferencesApi} />); await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
 await screen.findByText("Lina: Pickup delayed"); await screen.findByLabelText("Picked up"); fireEvent.click(screen.getByLabelText("Late pickup")); fireEvent.click(screen.getByText("Save preferences")); await screen.findByText("Preferences saved.");
 expect(pref.late).toBe(false); expect(f).toHaveBeenCalledWith(expect.stringContaining("/notification-preferences"), expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify(pref) }));
});
it("preference authorization loss also clears the parent-wide inbox", async () => {
 const f = vi.fn(async (url: string) => url.endsWith("/children") ? Response.json(family) : url.endsWith("/notification-preferences") ? new Response(null, { status: 401 }) : url.endsWith("/unread-count") ? Response.json({ count: 1 }) : Response.json([base])); vi.stubGlobal("fetch", f);
 render(<ParentInboxHome api={parentInboxApi} preferencesApi={notificationPreferencesApi} />); await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
 await waitFor(() => expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument()); await screen.findAllByText("Your sign-in has expired.");
 expect(screen.queryByText("1 unread updates")).not.toBeInTheDocument();
});

it("does not restore a late inbox response after preferences reject the session", async () => {
 let finish!: (response: Response) => void;
 const pending = new Promise<Response>(resolve => { finish = resolve; });
 vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/children") ? Response.json(family) : url.endsWith("/notification-preferences") ? new Response(null, { status: 401 }) : url.endsWith("/unread-count") ? Response.json({ count: 1 }) : pending));
 render(<ParentInboxHome api={parentInboxApi} preferencesApi={notificationPreferencesApi} />); await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: "Inbox" })); await screen.findAllByText("Your sign-in has expired.");
 await act(async () => finish(Response.json([base]))); expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument(); expect(screen.queryByText("1 unread updates")).not.toBeInTheDocument();
});
