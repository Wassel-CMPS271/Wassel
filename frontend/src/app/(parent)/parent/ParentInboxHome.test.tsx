import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { family } from "@/test-support/parentNavigation";
import type { InboxEvent, ParentInboxApi } from "@/lib/api/parentInbox";
import { ParentInboxHome } from "./ParentInboxHome";
const entry: InboxEvent = { id: "entry-lina", studentId: family[0].studentId, studentName: "Lina Navigation", type: "PICKED_UP", runId: "run", direction: "MORNING", createdAt: "2026-11-10T07:00:00Z", readAt: null };
const fetcher = vi.fn();
const api = { list: vi.fn(), unreadCount: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() } satisfies ParentInboxApi;
beforeEach(() => { vi.resetAllMocks(); fetcher.mockResolvedValue(Response.json(family)); api.list.mockResolvedValue([entry]); api.unreadCount.mockResolvedValue(83); vi.stubGlobal("fetch", fetcher); vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("opens the prepared parent-wide inbox without confusing it with a child's absence screen", async () => {
  render(<ParentInboxHome api={api} />); await screen.findByText("Lina Navigation");
  fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
  expect(await screen.findByText("Lina Navigation: Picked up")).toBeVisible(); expect(screen.getByText("83 unread updates")).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByText(/Preferences and late alerts are not available yet/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "My children" })); await screen.findByRole("heading", { level: 1, name: "My children" });
  expect(screen.queryByText("Lina Navigation: Picked up")).not.toBeInTheDocument();
});
it("resets the inbox destination and private entries when the parent account changes", async () => {
  const view = render(<ParentInboxHome api={api} accountKey="first" />); await screen.findByText("Lina Navigation");
  fireEvent.click(screen.getByRole("button", { name: "Inbox" })); await screen.findByText("Lina Navigation: Picked up");
  fetcher.mockResolvedValue(Response.json([])); api.list.mockResolvedValue([]); api.unreadCount.mockResolvedValue(0);
  view.rerender(<ParentInboxHome api={api} accountKey="second" />); expect(screen.queryByText("Lina Navigation: Picked up")).not.toBeInTheDocument();
  await screen.findByText("No children linked yet"); fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
  expect(await screen.findByText("No transport updates yet.")).toBeVisible(); expect(screen.getByText("0 unread updates")).toBeVisible();
});
it("keeps the production composition unavailable without an accepted client", async () => {
  render(<ParentInboxHome />); await screen.findByText("Lina Navigation"); expect(screen.queryByRole("button", { name: "Inbox" })).not.toBeInTheDocument(); expect(api.list).not.toHaveBeenCalled();
});

it("retains authorized historic inbox entries even when no child is currently linked", async () => {
  fetcher.mockResolvedValue(Response.json([])); render(<ParentInboxHome api={api} />); await screen.findByText("No children linked yet");
  fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
  expect(await screen.findByText("Lina Navigation: Picked up")).toBeVisible();
});
