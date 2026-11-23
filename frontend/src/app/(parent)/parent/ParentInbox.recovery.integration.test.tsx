import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/api/auth";
import type { InboxEvent } from "@/lib/api/parentInbox";
import { family } from "@/test-support/parentNavigation";
import ParentLayout from "./layout";
import ParentPage from "./page";
// Owned supplemental coverage; the original PR #169 snapshot stays untouched.
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/parent" }));
const parent = { id: "parent-recovery", email: "parent@example.invalid", role: "PARENT", schoolId: "school-recovery" } satisfies AuthUser;
const first: InboxEvent = { id: "update-one", studentId: family[0].studentId, studentName: "Lina", runId: "run-one", type: "PICKED_UP", direction: "MORNING", createdAt: "2026-11-17T07:00:00Z", readAt: null };
const second: InboxEvent = { ...first, id: "update-two", studentId: family[1].studentId, studentName: "Omar", type: "NOT_PRESENT" };
let unexpected: string[] = [];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); expect(unexpected).toEqual([]); });
function backend(rows: InboxEvent[] = [first]) {
 const state = { rows: rows.map(row => ({ ...row })), listFailure: null as number | null, markFailure: null as number | null, allFailure: null as number | null };
 const calls: { path: string; method: string; credentials: RequestCredentials | undefined }[] = []; unexpected = [];
 vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
  const path = new URL(url).pathname, method = options.method ?? "GET"; calls.push({ path, method, credentials: options.credentials });
  const fail = (status: number) => Response.json({ detail: "Private backend owner record and stack trace" }, { status });
  if (path === "/api/auth/me") return Response.json(parent);
  if (path === "/api/parent/children") return Response.json(family);
  if (path === "/api/parent/notification-preferences") return Response.json({ pickedUp: true, droppedOff: true, notPresent: true, late: true, lateAfterMinutes: 10 });
  if (path === "/api/parent/inbox/unread-count") return Response.json({ count: state.rows.filter(row => row.readAt === null).length });
  if (path === "/api/parent/inbox" && method === "GET") return state.listFailure ? fail(state.listFailure) : Response.json(state.rows);
  if (path === "/api/parent/inbox/read-all" && method === "POST") {
   if (state.allFailure) return fail(state.allFailure);
   state.rows = state.rows.map(row => ({ ...row, readAt: "2026-11-17T08:00:00Z" })); return new Response(null, { status: 204 });
  }
  const match = /^\/api\/parent\/inbox\/([^/]+)\/read$/.exec(path);
  if (match && method === "POST") {
   if (state.markFailure) return fail(state.markFailure);
   const id = decodeURIComponent(match[1]); if (!state.rows.some(row => row.id === id)) return fail(404);
   state.rows = state.rows.map(row => row.id === id ? { ...row, readAt: "2026-11-17T08:00:00Z" } : row);
   return Response.json(state.rows.find(row => row.id === id));
  }
  unexpected.push(`${method} ${path}`); throw new Error("Unexpected test request");
 }));
 return { state, calls, requests: (path: string) => calls.filter(call => call.path === path) };
}
async function openInbox() {
 const view = render(<ParentLayout><ParentPage /></ParentLayout>);
 await screen.findByRole("heading", { level: 1, name: "My children" }); fireEvent.click(screen.getByRole("button", { name: /^Inbox$/ }));
 await screen.findByRole("heading", { level: 1, name: "Transport updates" }); return view;
}
const row = (title: string) => within(screen.getByRole("heading", { level: 3, name: title }).closest("li")!);
it("retains one unread entry after a mark-read 404 without a fake receipt or private error detail", async () => {
 const server = backend(); await openInbox(); await screen.findByText("1 unread update"); server.state.markFailure = 404;
 fireEvent.click(screen.getByRole("button", { name: "Mark update for Lina as read" })); const alert = await screen.findByRole("alert");
 expect(alert).toHaveTextContent("Could not update the inbox"); expect(alert).not.toHaveTextContent(/Private|owner record|stack trace/);
 expect(screen.getByText("1 unread update")).toBeVisible(); expect(row("Lina: Picked up").getByText("Unread")).toBeVisible();
 expect(screen.getByRole("button", { name: "Mark update for Lina as read" })).toBeEnabled(); expect(server.state.rows[0].readAt).toBeNull();
 expect(server.requests("/api/parent/inbox/update-one/read")).toEqual([{ path: "/api/parent/inbox/update-one/read", method: "POST", credentials: "include" }]);
 expect(server.requests("/api/parent/inbox/unread-count")).toHaveLength(1);
});
it("clears one unread entry and preferences after a mid-session 401, offering Sign in", async () => {
 const server = backend(); await openInbox(); await screen.findByText("1 unread update"); await screen.findByLabelText("Picked up"); server.state.allFailure = 401;
 fireEvent.click(screen.getByRole("button", { name: /^Mark all as read$/ })); const alert = await screen.findByRole("alert");
 expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
 expect(screen.queryByText("1 unread update")).not.toBeInTheDocument(); expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument();
 expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "Notification preferences" })).not.toBeInTheDocument();
 expect(screen.queryByRole("checkbox", { name: "Picked up" })).not.toBeInTheDocument(); expect(server.state.rows[0].readAt).toBeNull(); expect(server.requests("/api/parent/inbox/read-all")).toHaveLength(1);
});
it("refetches the two-to-one unread count and persists sibling read state after a full page remount", async () => {
 const server = backend([first, second]); const view = await openInbox(); await screen.findByText("2 unread updates");
 fireEvent.click(screen.getByRole("button", { name: "Mark update for Lina as read" })); await screen.findByText("1 unread update");
 expect(row("Lina: Picked up").getByText("Read")).toBeVisible(); expect(row("Omar: Not at the stop").getByText("Unread")).toBeVisible();
 expect(server.requests("/api/parent/inbox/unread-count")).toHaveLength(2); expect(server.requests("/api/parent/inbox/update-one/read")).toHaveLength(1);
 view.unmount(); await openInbox(); await screen.findByText("1 unread update");
 expect(row("Lina: Picked up").getByText("Read")).toBeVisible(); expect(row("Omar: Not at the stop").getByText("Unread")).toBeVisible();
 expect(server.requests("/api/parent/inbox/unread-count")).toHaveLength(3); expect(server.requests("/api/auth/me")).toHaveLength(2); expect(server.calls.every(call => call.credentials === "include")).toBe(true);
});
it("recovers from a list 500 to one unread update without leaking server detail or a stale alert", async () => {
 const server = backend(); server.state.listFailure = 500; await openInbox(); const alert = await screen.findByRole("alert");
 expect(alert).toHaveTextContent("Could not update the inbox"); expect(alert).not.toHaveTextContent(/Private|stack trace/);
 expect(screen.queryByText("1 unread update")).not.toBeInTheDocument(); server.state.listFailure = null;
 fireEvent.click(screen.getByRole("button", { name: /^Refresh inbox$/ })); await screen.findByText("1 unread update");
 expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(row("Lina: Picked up").getByText("Unread")).toBeVisible(); await screen.findByLabelText("Picked up");
 expect(server.requests("/api/parent/inbox")).toHaveLength(2); expect(server.requests("/api/parent/inbox/unread-count")).toHaveLength(2);
});
