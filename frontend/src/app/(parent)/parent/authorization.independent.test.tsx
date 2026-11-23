// SCRUM-278: independent acceptance tests for SCRUM-280 (parent inbox/preferences authorization,
// PR #150). Every case goes through the production page and layout, the real RoleGuard and the real
// request() client. Only fetch and next/navigation are replaced.
//
// The redirect-with-zero-requests guarantee itself (RoleGuard, signed-out, wrong role) is already
// proven generically in tracking.independent.test.tsx (SCRUM-279 AC2): parentRequests() there covers
// every /api/parent/* path, inbox and preferences included. These cases re-confirm the same guarantee
// scoped to the inbox/preferences endpoints specifically, since that is this ticket's own criterion,
// and add what SCRUM-279's suite does not cover: cross-parent leakage on mark-read, and a 401 that
// arrives mid-session (after the inbox is already open) rather than on the first /auth/me call.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createParentServer, inboxEvent, sessionAs, type ParentServer } from "@/test-support/parentAcceptance";
import ParentLayout from "./layout";
import ParentPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/parent" }));

let server: ParentServer;
function serve(initial: Parameters<typeof createParentServer>[0] = {}) {
  server = createParentServer(initial);
  vi.stubGlobal("fetch", server.fetch);
  return server;
}
const show = () => render(<ParentLayout><ParentPage /></ParentLayout>);

beforeEach(() => { router.replace.mockReset(); vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false"); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  expect(server?.unexpected ?? []).toEqual([]);
});

async function openInbox() {
  show();
  await screen.findByRole("heading", { level: 1, name: "My children" });
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Inbox" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
  await screen.findByRole("heading", { level: 1, name: "Transport updates" });
}
const noInboxOrPrefsRequests = () => {
  expect(server.requests(/^\/api\/parent\/inbox/)).toEqual([]);
  expect(server.requests("/api/parent/notification-preferences")).toEqual([]);
};

describe("SCRUM-280 criterion 2: wrong roles, signed-out, 401 mid-session, and no cross-parent leakage", () => {
  it.each([["ADMIN", "/admin"], ["DRIVER", "/driver"], ["HEAD_OF_TRANSPORT", "/head-of-transport"]])(
    "redirects a %s session to %s without any inbox or preferences request",
    async (role, home) => {
      serve({ session: sessionAs(role), inbox: [inboxEvent({})] });
      show();
      await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
      await vi.waitFor(() => noInboxOrPrefsRequests());
      expect(screen.queryByRole("heading", { name: "Transport updates" })).not.toBeInTheDocument();
    },
  );

  it("sends a signed-out visitor (401 on /me) to /login without any inbox or preferences request", async () => {
    serve({ session: 401, inbox: [inboxEvent({})] });
    show();
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    await vi.waitFor(() => noInboxOrPrefsRequests());
  });

  it("returns 404 when marking read an id no longer this parent's own (an unknown id and another parent's entry are the same 404 per the contract), with no fake receipt and no server detail shown", async () => {
    const row = inboxEvent({ type: "PICKED_UP" });
    serve({ inbox: [row] });
    await openInbox();
    expect(screen.getByText(/^1 unread updates?$/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Mark update for Tarek Mansour as read" });

    // The entry stops being this parent's between load and the click (e.g. the child was relinked
    // to another parent): the fake server now answers exactly as it would for an unknown or another
    // parent's id — a 404 with a detail it never exposes to the UI.
    server.state.inbox = [];
    fireEvent.click(button);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not update the inbox/i);
    expect(alert.textContent).not.toMatch(/not found/i);
    expect(server.requests(`/api/parent/inbox/${row.id}/read`)).toHaveLength(1);
    // No optimistic/fake receipt: the row this parent can see is unaffected by the failed call.
    expect(screen.getByText(/^1 unread updates?$/)).toBeInTheDocument();
  });

  it.each([403, 404])("shows a generic message for a %s on the inbox list load, never the server's detail", async status => {
    serve({});
    server.state.inboxFailure = status;
    await openInbox();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/Inbox failure/); // the fake server's fixed detail text
    expect(alert.textContent).toMatch(status === 403 ? /do not have access/i : /could not update the inbox/i);
  });

  it("401 mid-session (sign-in expires while the inbox is already open) clears the data and offers Sign in", async () => {
    const row = inboxEvent({ type: "PICKED_UP" });
    serve({ inbox: [row] });
    await openInbox();
    expect(screen.getByText(/^1 unread updates?$/)).toBeInTheDocument();

    server.state.inboxFailure = 401; // the session expires after the page already loaded
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/sign-in has expired/i);
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/unread updates$/)).not.toBeInTheDocument(); // stale data is cleared, not left showing
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument(); // rows are gone too
  });
});
