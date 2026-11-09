import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { InboxEvent, ParentInboxApi } from "@/lib/api/parentInbox";
import { ApiError } from "@/lib/api/errors";
import { InboxPanel } from "./InboxPanel";
const entry: InboxEvent = { id: "a", type: "PICKED_UP", studentId: "s", studentName: "Lina", runId: "r", direction: "MORNING", createdAt: "2026-11-09T07:00:00Z", readAt: null };
function source(rows: InboxEvent[] = [entry]) { return { list: vi.fn().mockResolvedValue(rows), unreadCount: vi.fn().mockResolvedValue(73), markRead: vi.fn().mockResolvedValue({ ...entry, readAt: "2026-11-09T08:00:00Z" }), markAllRead: vi.fn().mockResolvedValue(undefined) } satisfies ParentInboxApi; }
it("never displays sample notifications when no backend is integrated", () => { render(<InboxPanel />); expect(screen.getByText("Inbox is not available yet.")).toBeVisible(); expect(screen.queryByText(/Lina/)).not.toBeInTheDocument(); });
it("renders every defined event type and keeps siblings distinct", async () => {
  const api = source([entry, { ...entry, id: "b", studentName: "Omar", studentId: "t", type: "DROPPED_OFF" }, { ...entry, id: "c", type: "NOT_PRESENT" }]);
  render(<InboxPanel api={api} />); expect(await screen.findByText("Lina: Picked up")).toBeVisible(); expect(screen.getByText("Omar: Dropped off")).toBeVisible(); expect(screen.getByText("Lina: Not at the stop")).toBeVisible(); expect(screen.getByText("73 unread updates")).toBeVisible();
});
it("shows loading then empty results", async () => { render(<InboxPanel api={source([])} />); expect(screen.getByText("Loading inboxâ€¦")).toBeVisible(); expect(await screen.findByText("No transport updates yet.")).toBeVisible(); });
it("refreshes the authoritative count after marking read, and persists after remount", async () => {
  const api = source(); const view = render(<InboxPanel api={api} />); await screen.findByText("Lina: Picked up");
  api.list.mockResolvedValue([{ ...entry, readAt: "2026-11-09T08:00:00Z" }]); api.unreadCount.mockResolvedValue(72);
  fireEvent.click(screen.getByRole("button", { name: "Mark update for Lina as read" }));
  expect(await screen.findByText("72 unread updates")).toBeVisible(); expect(api.markRead).toHaveBeenCalledWith("a"); expect(screen.getByText("Read")).toBeVisible();
  view.unmount(); render(<InboxPanel api={api} />); expect(await screen.findByText("Read")).toBeVisible(); expect(screen.queryByRole("button", { name: "Mark update for Lina as read" })).not.toBeInTheDocument();
});
it("filters unread through the API and supports read-all", async () => {
  const api = source(); render(<InboxPanel api={api} />); await screen.findByText("Lina: Picked up"); fireEvent.click(screen.getByLabelText("Unread only")); await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(true)); await screen.findByText("Lina: Picked up");
  api.list.mockResolvedValue([]); api.unreadCount.mockResolvedValue(0); fireEvent.click(screen.getByText("Mark all as read")); expect(await screen.findByText("No unread updates.")).toBeVisible(); expect(api.markAllRead).toHaveBeenCalledOnce(); expect(screen.getByText("0 unread updates")).toBeVisible();
});
it("keeps failed action retryable without decrementing the count", async () => {
  const api = source(); api.markRead.mockRejectedValueOnce(new Error("offline")); render(<InboxPanel api={api} />); await screen.findByText("Lina: Picked up"); fireEvent.click(screen.getByRole("button", { name: "Mark update for Lina as read" })); await screen.findByRole("alert"); expect(screen.getByText("73 unread updates")).toBeVisible(); expect(screen.getByText("Unread")).toBeVisible(); expect(screen.getByRole("button", { name: "Mark update for Lina as read" })).toBeEnabled();
});
it("drops private entries on revoked access", async () => {
  const api = source(); api.markRead.mockRejectedValue(new ApiError(401)); render(<InboxPanel api={api} />); await screen.findByText("Lina: Picked up"); fireEvent.click(screen.getByRole("button", { name: "Mark update for Lina as read" })); expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login"); expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument();
});
it("does not let a previous account's late response replace a new inbox", async () => {
  let old!: (rows: InboxEvent[]) => void; const first = source(); first.list.mockReturnValue(new Promise(resolve => { old = resolve; })); const next = source([]); const view = render(<InboxPanel api={first} />); view.rerender(<InboxPanel api={next} />); await screen.findByText("No transport updates yet."); old([entry]); await waitFor(() => expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument());
});
