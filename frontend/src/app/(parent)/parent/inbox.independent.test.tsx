// SCRUM-278: independent acceptance tests for SCRUM-280 (parent inbox, PR #150).
// Every case goes through the production page and layout, the real RoleGuard and the real request()
// client. Only fetch and next/navigation are replaced. Expected values come from
// docs/contracts/samples/inbox and docs/contracts/inbox.md, via test-support/parentAcceptance.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HANG, NETWORK, createParentServer, fail, inboxEvent, samples, type ParentServer,
} from "@/test-support/parentAcceptance";
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
  // The fake backend answers every request the contract defines; anything else is a finding.
  expect(server?.unexpected ?? []).toEqual([]);
});

// --- page helpers -----------------------------------------------------------------------------

async function openPage() { show(); await screen.findByRole("heading", { level: 1, name: "My children" }); }
async function openInbox() {
  await openPage();
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Inbox" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
  await screen.findByRole("heading", { level: 1, name: "Transport updates" });
}
const inboxRegion = () => screen.getByRole("region", { name: "Parent inbox" });
const rowFor = (heading: string) => within(inboxRegion()).getByRole("heading", { level: 3, name: heading }).closest("li") as HTMLElement;

describe("SCRUM-280 criterion 1: real event statuses and an accurate unread count", () => {
  it("shows the three sample events plus a LATE event with their own wording and read status, and a count read from /unread-count rather than the list length", async () => {
    const unread = inboxEvent({ type: "PICKED_UP" });
    const late = samples.inboxLate();
    const read = samples.inboxRead();
    // Only 2 of these 3 rows are unread; the override proves the shown count comes from its own
    // endpoint (as the contract requires: "the unread count counts all unread entries, not only the
    // 50 listed"), not from counting what's on screen.
    serve({ inbox: [unread, late, read], unreadCountOverride: 3 });
    await openInbox();
    const region = inboxRegion();

    expect(within(rowFor("Tarek Mansour: Picked up")).getByText("Unread")).toBeInTheDocument();
    expect(within(rowFor("Tarek Mansour: Pickup delayed")).getByText("Unread")).toBeInTheDocument();
    expect(within(rowFor("Tarek Mansour: Not at the stop")).getByText("Read")).toBeInTheDocument();
    expect(within(region).getByText("3 unread updates")).toBeInTheDocument();
    expect(server.requests("/api/parent/inbox/unread-count")).toHaveLength(1);
  });

  it("marks one event read, refetching the list and count from the server, and the result survives a reload (unmount + remount against the same stateful server)", async () => {
    const pickedUp = inboxEvent({ type: "PICKED_UP" });
    const notPresent = inboxEvent({ type: "NOT_PRESENT" });
    serve({ inbox: [pickedUp, notPresent] });
    await openInbox();
    expect(screen.getByText("2 unread updates")).toBeInTheDocument();

    fireEvent.click(within(rowFor("Tarek Mansour: Picked up")).getByRole("button", { name: "Mark update for Tarek Mansour as read" }));
    await screen.findByText(/^1 unread updates?$/);
    expect(server.requests(`/api/parent/inbox/${pickedUp.id}/read`)).toHaveLength(1);
    expect(within(rowFor("Tarek Mansour: Picked up")).getByText("Read")).toBeInTheDocument();
    expect(within(rowFor("Tarek Mansour: Not at the stop")).getByText("Unread")).toBeInTheDocument();
    // the new count came from a real refetch, not a local guess
    expect(server.requests("/api/parent/inbox").filter(r => r.method === "GET").length).toBeGreaterThanOrEqual(2);
    expect(server.requests("/api/parent/inbox/unread-count").length).toBeGreaterThanOrEqual(2);

    cleanup(); // the parent reloads the page
    await openInbox();
    expect(within(rowFor("Tarek Mansour: Picked up")).getByText("Read")).toBeInTheDocument();
    expect(screen.getByText(/^1 unread updates?$/)).toBeInTheDocument();
  });

  it("marks all read via a 204 with no body, dropping the count to 0 and disabling Mark all, and this persists after a reload", async () => {
    serve({ inbox: [inboxEvent({ type: "PICKED_UP" }), inboxEvent({ type: "NOT_PRESENT" })] });
    await openInbox();
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await screen.findByText("0 unread updates");
    expect(server.requests("/api/parent/inbox/read-all")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();

    cleanup();
    await openInbox();
    expect(screen.getByText("0 unread updates")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  });

  it("sends ?unread=true when Unread only is checked", async () => {
    serve({ inbox: [inboxEvent({ type: "PICKED_UP" }), samples.inboxRead()] });
    await openInbox();
    fireEvent.click(screen.getByRole("checkbox", { name: "Unread only" }));
    await vi.waitFor(() => expect(server.requests("/api/parent/inbox").some(r => r.search === "?unread=true")).toBe(true));
  });

  // Known suspect (SCRUM-278 plan R7): there is no badge anywhere on the parent home or the nav
  // before the Inbox is opened, so "accurate unread count" is only ever shown once the parent opens
  // the Inbox. This documents today's behaviour; it is an AC ambiguity for the PO, not asserted here
  // as a pass/fail on correctness.
  it("shows no unread badge anywhere, and makes no unread-count request, before the Inbox is opened", async () => {
    serve({ inbox: [inboxEvent({}), inboxEvent({})], unreadCountOverride: 2 });
    await openPage();
    expect(screen.queryByText(/\d+\s*unread/i)).not.toBeInTheDocument();
    expect(server.requests("/api/parent/inbox/unread-count")).toHaveLength(0);
  });

  // Known suspect (SCRUM-278 plan R8, InboxPanel.tsx:71): the count line always says "updates"
  // (plural), even for exactly one. This is the correct, singular wording; expect it to stay red.
  it("uses singular wording for exactly one unread update", async () => {
    serve({ inbox: [inboxEvent({})], unreadCountOverride: 1 });
    await openInbox();
    expect(screen.getByText("1 unread update")).toBeInTheDocument();
  });
});

describe("SCRUM-280 criterion 4: loading, empty, error-and-retry, and the Inbox button when only children fails", () => {
  it("shows 'Loading inbox…' while the list and count are pending", async () => {
    serve({ inbox: [] });
    server.state.listReply = HANG;
    await openInbox();
    expect(screen.getByText("Loading inbox…")).toBeInTheDocument();
    // level-3 headings are too broad a check here: the preferences panel (unrelated to this fetch)
    // renders its own "Notification preferences" h3 in the same region regardless. Check for inbox
    // rows specifically instead.
    expect(within(inboxRegion()).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows 'No transport updates yet.' and disables Mark all when the inbox is empty", async () => {
    serve({ inbox: [] });
    await openInbox();
    expect(await screen.findByText("No transport updates yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
    expect(screen.getByText("0 unread updates")).toBeInTheDocument();
  });

  it("shows a generic alert after a 500 on the list, then Refresh inbox recovers", async () => {
    serve({ inbox: [inboxEvent({})] });
    server.state.listReply = fail(500, { detail: "java.lang.NullPointerException at InboxService" });
    await openInbox();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not update the inbox/i);
    expect(alert.textContent).not.toMatch(/NullPointer/);

    server.state.listReply = null;
    fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" }));
    await screen.findByText(/^\d+ unread updates?$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a generic alert after a network failure on the list, then Refresh inbox recovers", async () => {
    serve({ inbox: [inboxEvent({})] });
    server.state.listReply = NETWORK;
    await openInbox();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not update the inbox/i);
    expect(alert.textContent).not.toMatch(/Failed to fetch/);

    server.state.listReply = null;
    fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" }));
    await vi.waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  // Known suspect (SCRUM-278 plan R6, ParentHome.tsx:104): the Inbox button is disabled whenever the
  // children fetch isn't "loaded", even though the inbox has nothing to do with the children list.
  it("keeps the Inbox button usable when only the children list fails", async () => {
    serve({ children: 500 });
    show();
    await screen.findByRole("alert"); // "Couldn't load transport details"
    expect(screen.getByRole("button", { name: "Inbox" })).toBeEnabled();
  });
});

describe("SCRUM-280 criterion 5: pickup, drop-off, not-at-the-stop and late wording; no absence event is invented", () => {
  it("shows its own wording for each of the four entry types", async () => {
    serve({ inbox: [
      inboxEvent({ type: "PICKED_UP" }),
      inboxEvent({ type: "DROPPED_OFF" }),
      inboxEvent({ type: "NOT_PRESENT" }),
      inboxEvent({ type: "LATE" }),
    ] });
    await openInbox();
    expect(rowFor("Tarek Mansour: Picked up")).toBeInTheDocument();
    expect(rowFor("Tarek Mansour: Dropped off")).toBeInTheDocument();
    expect(rowFor("Tarek Mansour: Not at the stop")).toBeInTheDocument();
    expect(rowFor("Tarek Mansour: Pickup delayed")).toBeInTheDocument();
  });

  it("reads 'Afternoon run' (not 'Morning run') for an afternoon drop-off", async () => {
    serve({ inbox: [inboxEvent({ type: "DROPPED_OFF", direction: "AFTERNOON" })] });
    await openInbox();
    const row = rowFor("Tarek Mansour: Dropped off");
    expect(within(row).getByText(/Afternoon run/)).toBeInTheDocument();
    expect(within(row).queryByText(/Morning run/)).not.toBeInTheDocument();
  });

  // Jira's SCRUM-280 AC talks about "absence updates", but inbox.md ("When an entry is made") says a
  // parent-reported absence makes NO entry at all; the only entry shaped like an absence is
  // NOT_PRESENT ("not at the stop" — the driver's confirmation the child never boarded). This test is
  // written from the contract: it exercises NOT_PRESENT and does not invent an "absence" event the
  // backend never sends (see SCRUM-278 plan, R9 — Wassim flagged the same wording gap).
  it("shows NOT_PRESENT as 'Not at the stop', the only absence-shaped entry the contract defines", async () => {
    serve({ inbox: [samples.inboxRead()] }); // the read sample is NOT_PRESENT
    await openInbox();
    expect(rowFor("Tarek Mansour: Not at the stop")).toBeInTheDocument();
    expect(screen.queryByText(/\babsence\b/i)).not.toBeInTheDocument();
  });
});

describe("SCRUM-280 criterion 6: a 360px-appropriate inbox, as far as jsdom can check", () => {
  const px = (value: string) => (/^(\d+(?:\.\d+)?)px$/.exec(value.trim()) ? Number.parseFloat(value) : null);

  it("gives every control in the inbox a 44px tap target", async () => {
    serve({ inbox: [inboxEvent({ type: "PICKED_UP" }), samples.inboxRead()] });
    await openInbox();
    // The "Unread only" checkbox's own <input> carries no inline style; its wrapping <label> is the
    // actual 44px tap target (InboxPanel.tsx), so checkbox-wrapping labels are checked instead of the
    // bare input. A plain caption <label> (e.g. the minutes field's "Minutes after planned pickup",
    // from the preferences panel rendered below the inbox) is not itself a tap target and is excluded.
    const controls = [...screen.getByRole("main").querySelectorAll<HTMLElement>("button, a[href], select, label")]
      .filter(control => control.tagName !== "LABEL" || control.querySelector("input[type=checkbox]"));
    expect(controls.length).toBeGreaterThan(3);
    for (const control of controls) {
      expect({ control: control.textContent || control.getAttribute("aria-label"), minHeight: control.style.minHeight })
        .toEqual({ control: control.textContent || control.getAttribute("aria-label"), minHeight: "44px" });
    }
  });

  it("sets no fixed width wider than 360px anywhere on the inbox screen", async () => {
    serve({ inbox: [inboxEvent({})] });
    await openInbox();
    const tooWide = [...document.body.querySelectorAll<HTMLElement>("*")].filter(element =>
      [element.style.width, element.style.minWidth, element.style.flexBasis].some(value => (px(value) ?? 0) > 360));
    expect(tooWide.map(element => element.outerHTML.slice(0, 80))).toEqual([]);
  });
});
