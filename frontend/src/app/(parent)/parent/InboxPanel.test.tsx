import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
it("shows loading then empty results", async () => { render(<InboxPanel api={source([])} />); expect(screen.getByText("Loading inbox…")).toBeVisible(); expect(await screen.findByText("No transport updates yet.")).toBeVisible(); });
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
  let old!: (rows: InboxEvent[]) => void; const first = source(); first.list.mockReturnValue(new Promise(resolve => { old = resolve; })); const next = source([]); const view = render(<InboxPanel api={first} />); view.rerender(<InboxPanel api={next} />); await screen.findByText("No transport updates yet."); await act(async () => old([entry])); await waitFor(() => expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument());
});

it("marks exactly the clicked sibling's event and preserves the other child's read state", async () => {
  const other = { ...entry, id: "omar-event", studentId: "omar", studentName: "Omar" }; const api = source([entry, other]);
  api.markRead.mockResolvedValue({ ...other, readAt: "2026-11-10T08:00:00Z" });
  render(<InboxPanel api={api} />); await screen.findByText("Omar: Picked up");
  fireEvent.click(screen.getByRole("button", { name: "Mark update for Omar as read" }));
  await waitFor(() => expect(api.markRead).toHaveBeenCalledWith("omar-event"));
  expect(api.markRead).toHaveBeenCalledTimes(1); expect(api.markAllRead).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Mark update for Lina as read" })).toBeInTheDocument();
});
it("does not fabricate a zero unread count when count loading fails, and retries both reads", async () => {
  const api = source(); api.unreadCount.mockRejectedValueOnce(new Error("offline")); render(<InboxPanel api={api} />);
  await screen.findByRole("alert"); expect(screen.queryByText(/unread updates$/)).not.toBeInTheDocument(); expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Refresh inbox")); expect(await screen.findByText("73 unread updates")).toBeVisible(); expect(api.list).toHaveBeenCalledTimes(2);
});
it("resets private rows, filter and pending actions for a new account with the same client", async () => {
  let finish!: (value: InboxEvent) => void; const api = source(); api.markRead.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<InboxPanel api={api} accountKey="first" />); await screen.findByText("Lina: Picked up"); fireEvent.click(screen.getByLabelText("Unread only")); await screen.findByText("Lina: Picked up");
  fireEvent.click(screen.getByRole("button", { name: "Mark update for Lina as read" }));
  api.list.mockResolvedValue([]); api.unreadCount.mockResolvedValue(0); view.rerender(<InboxPanel api={api} accountKey="second" />);
  expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument(); await screen.findByText("No transport updates yet."); expect(screen.getByLabelText("Unread only")).not.toBeChecked();
  const calls = api.list.mock.calls.length; await act(async () => finish({ ...entry, readAt: "2026-11-10T08:00:00Z" }));
  expect(api.list).toHaveBeenCalledTimes(calls); expect(screen.getByText("0 unread updates")).toBeVisible();
});
it.each([401, 403])("clears private entries when refreshed access is denied with %s", async status => {
  const api = source(); render(<InboxPanel api={api} />); await screen.findByText("Lina: Picked up"); api.list.mockRejectedValue(new ApiError(status));
  fireEvent.click(screen.getByText("Refresh inbox")); await screen.findByRole("alert"); expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
});
it("uses native 44px read/retry controls and distinguishes historic authorized events", async () => {
  vi.stubGlobal("innerWidth", 360); const api = source([{ ...entry, studentId: "formerly-linked", studentName: "Historical child" }]);
  render(<InboxPanel api={api} />); await screen.findByText("Historical child: Picked up");
  for (const button of screen.getAllByRole("button")) expect(Number.parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(44);
  expect(screen.getByText(/up to 50 updates/)).toHaveTextContent("all your children and older updates");
});

it("serializes rapid read taps and never sends read-all while a receipt is pending", async () => {
  let finish!: (value: InboxEvent) => void; const api = source(); api.markRead.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<InboxPanel api={api} />); await screen.findByText("Lina: Picked up");
  const button = screen.getByRole("button", { name: "Mark update for Lina as read" });
  fireEvent.click(button); fireEvent.click(button); fireEvent.click(screen.getByText("Mark all as read"));
  expect(api.markRead).toHaveBeenCalledTimes(1); expect(api.markAllRead).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Unread only")).toBeDisabled();
  api.list.mockResolvedValue([{ ...entry, readAt: "2026-11-12T08:00:00Z" }]); api.unreadCount.mockResolvedValue(72);
  await act(async () => finish({ ...entry, readAt: "2026-11-12T08:00:00Z" }));
  expect(await screen.findByText("72 unread updates")).toBeVisible(); expect(api.list).toHaveBeenCalledTimes(2);
});
it("retains unread totals on failed read-all, then applies only the successful server refresh", async () => {
  const api = source(); api.markAllRead.mockRejectedValueOnce(new Error("offline"));
  render(<InboxPanel api={api} />); await screen.findByText("73 unread updates"); fireEvent.click(screen.getByText("Mark all as read"));
  await screen.findByRole("alert"); expect(screen.getByText("73 unread updates")).toBeVisible(); expect(screen.getByText("Unread")).toBeVisible();
  api.list.mockResolvedValue([{ ...entry, readAt: "2026-11-12T08:00:00Z" }]); api.unreadCount.mockResolvedValue(0);
  fireEvent.click(screen.getByText("Mark all as read")); expect(await screen.findByText("0 unread updates")).toBeVisible(); expect(api.markAllRead).toHaveBeenCalledTimes(2);
});
it.each([401, 403])("removes all private entries and controls when read-all loses authorization (%s)", async status => {
  const api = source(); api.markAllRead.mockRejectedValue(new ApiError(status)); render(<InboxPanel api={api} />);
  await screen.findByText("Lina: Picked up"); fireEvent.click(screen.getByText("Mark all as read")); await screen.findByRole("alert");
  expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument(); expect(screen.queryByText("73 unread updates")).not.toBeInTheDocument(); expect(screen.queryByText("Mark all as read")).not.toBeInTheDocument();
});
it("does not invent preference controls or endpoints while SCRUM-268 has no contract", async () => {
  const api = source([]); render(<InboxPanel api={api} />); await screen.findByText("No transport updates yet.");
  expect(screen.getByText("Preferences and late alerts are not available yet.")).toBeVisible(); expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(api.markAllRead).not.toHaveBeenCalled(); expect(api.markRead).not.toHaveBeenCalled();
});
