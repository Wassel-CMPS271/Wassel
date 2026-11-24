// SCRUM-278: independent acceptance tests for SCRUM-280 (parent notification preferences, PR #150).
// Every case goes through the production page and layout, the real RoleGuard and the real request()
// client. Only fetch and next/navigation are replaced. Expected values come from
// docs/contracts/samples/inbox/notification-preferences.json and docs/contracts/inbox.md, via
// test-support/parentAcceptance. The preferences form lives inside the Inbox view (InboxPanel renders
// NotificationPreferencesPanel at the bottom), so opening it means opening the Inbox first.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createParentServer, fail, inboxEvent, samples, type ParentServer } from "@/test-support/parentAcceptance.owned";
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

// --- page helpers -----------------------------------------------------------------------------

async function openInbox() {
  show();
  await screen.findByRole("heading", { level: 1, name: "My children" });
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Inbox" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
  await screen.findByRole("heading", { level: 1, name: "Transport updates" });
}
/** Opens the inbox and waits for the preferences panel's own GET to settle. */
async function openPreferences() {
  await openInbox();
  await vi.waitFor(() => expect(screen.queryByText("Loading notification preferences…")).not.toBeInTheDocument());
}
const prefsCard = () => screen.getByRole("heading", { level: 3, name: "Notification preferences" }).parentElement as HTMLElement;
const minutesInput = (card: HTMLElement) => within(card).getByRole("spinbutton", { name: /minutes after planned pickup/i });
const saveButton = (card: HTMLElement) => within(card).getByRole("button", { name: /save preferences/i });

describe("SCRUM-280 criterion 3: preferences are read and saved through the agreed API", () => {
  it("loads the five fields from the server (sample: droppedOff off, 15 minutes)", async () => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    expect(within(card).getByRole("checkbox", { name: "Picked up" })).toBeChecked();
    expect(within(card).getByRole("checkbox", { name: "Dropped off" })).not.toBeChecked();
    expect(within(card).getByRole("checkbox", { name: "Not at the stop" })).toBeChecked();
    expect(within(card).getByRole("checkbox", { name: "Late pickup" })).toBeChecked();
    expect(minutesInput(card)).toHaveValue(15);
  });

  it("saves all five fields at once (JSON.parse(init.body)), including a false value, and shows the saved result", async () => {
    serve({ preferences: samples.preferences() }); // droppedOff: false
    await openPreferences();
    const card = prefsCard();
    fireEvent.click(within(card).getByRole("checkbox", { name: "Dropped off" })); // false -> true
    fireEvent.change(minutesInput(card), { target: { value: "20" } });
    fireEvent.click(saveButton(card));
    await within(card).findByText("Preferences saved.");

    const put = server.requests("/api/parent/notification-preferences").find(r => r.method === "PUT");
    expect(put?.body).toEqual({ pickedUp: true, droppedOff: true, notPresent: true, late: true, lateAfterMinutes: 20 });
    expect(within(card).getByRole("checkbox", { name: "Dropped off" })).toBeChecked();
    expect(minutesInput(card)).toHaveValue(20);
  });

  it("shows the saved values after a reload (unmount + remount against the same stateful server)", async () => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    fireEvent.click(within(card).getByRole("checkbox", { name: "Dropped off" }));
    fireEvent.change(minutesInput(card), { target: { value: "42" } });
    fireEvent.click(saveButton(card));
    await within(card).findByText("Preferences saved.");

    cleanup();
    await openPreferences();
    const reloaded = prefsCard();
    expect(within(reloaded).getByRole("checkbox", { name: "Dropped off" })).toBeChecked();
    expect(minutesInput(reloaded)).toHaveValue(42);
  });

  it("shows a 400's field errors on the right field and leaves the form usable", async () => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    server.state.prefsPutReply = fail(400, {
      errors: { pickedUp: "pickedUp must be true or false", lateAfterMinutes: "Must be a whole number from 5 to 60" },
    });
    fireEvent.click(saveButton(card));
    // Two role="alert" elements appear at once here (the generic paragraph and the minutes field's own
    // error span), so wait on specific text rather than the ambiguous role.
    await within(card).findByText("pickedUp must be true or false");

    // lateAfterMinutes: the Input component links the message via aria-describedby, right next to the field.
    expect(minutesInput(card)).toHaveAccessibleDescription(/Must be a whole number from 5 to 60/);
    // pickedUp: known gap (NotificationPreferencesPanel.tsx:38) — the component only ever reads
    // cause.errors.lateAfterMinutes; every other field's message (here, pickedUp's) is dumped into one
    // generic alert instead of appearing next to the Picked up checkbox, as the criterion requires.
    const pickedUpLabel = within(card).getByRole("checkbox", { name: "Picked up" }).closest("label") as HTMLElement;
    expect(within(pickedUpLabel).queryByText(/pickedUp must be true or false/)).toBeInTheDocument();
    // the form stays usable either way: nothing is disabled, and the fields keep their entered values
    expect(minutesInput(card)).toBeEnabled();
    expect(saveButton(card)).toBeEnabled();
    expect(within(card).getByRole("checkbox", { name: "Picked up" })).toBeEnabled();
  });

  it("401 shows Sign in and hides the choices, and also hides the inbox above it (onAccessDenied)", async () => {
    serve({ inbox: [inboxEvent({})] });
    server.state.prefsFailure = 401;
    await openInbox();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/sign-in has expired/i);
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    // Scoped to the preferences choices specifically: the inbox's own "Unread only" checkbox is a
    // different control and screen.queryByRole("checkbox") without a name would also match that one.
    expect(screen.queryByRole("checkbox", { name: "Picked up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Notification preferences" })).not.toBeInTheDocument();
  });

  it("403 shows 'no access' and hides the choices", async () => {
    serve({ inbox: [] });
    server.state.prefsFailure = 403;
    await openInbox();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/do not have access/i);
    expect(alert.textContent).not.toMatch(/Preferences failure/); // the server's own detail is never shown
    expect(screen.queryByRole("checkbox", { name: "Picked up" })).not.toBeInTheDocument();
  });

  it.each(["4", "61"])("blocks %s minutes on the client, sending no PUT", async minutes => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    fireEvent.change(minutesInput(card), { target: { value: minutes } });
    fireEvent.click(saveButton(card));
    expect(await within(card).findByText("Choose a whole number from 5 to 60.")).toBeInTheDocument();
    expect(server.requests("/api/parent/notification-preferences").some(r => r.method === "PUT")).toBe(false);
  });

  it("ignores a double submit while the first save is in flight", async () => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    const form = saveButton(card).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form); // the submit guard (locked.current) should drop this one
    await within(card).findByText("Preferences saved.");
    expect(server.requests("/api/parent/notification-preferences").filter(r => r.method === "PUT")).toHaveLength(1);
  });

  it("recovers after a failed save: the alert shows, the entered values stay, and resubmitting succeeds", async () => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    server.state.prefsPutReply = fail(500, { detail: "java.lang.NullPointerException" });
    fireEvent.change(minutesInput(card), { target: { value: "30" } });
    fireEvent.click(saveButton(card));
    const alert = await within(card).findByRole("alert");
    expect(alert.textContent).not.toMatch(/NullPointer/);
    expect(minutesInput(card)).toHaveValue(30); // not reverted to the server's last value

    fireEvent.click(saveButton(card)); // retry; prefsPutReply was consumed, so this one saves normally
    await within(card).findByText("Preferences saved.");
    expect(minutesInput(card)).toHaveValue(30);
  });

  // Muting a notification type and generating LATE entries are backend rules (inbox.md "Notification
  // preferences" / "Late alerts"), verified by Wassim's e2e (parent-inbox.e2e.ts) and the backend's own
  // tests (#158's SCRUM-268 work). This UI is tested only for what the server sends it: it must never
  // itself claim a notification was muted, suppressed or created.
  it("never claims to mute, suppress or create a notification itself", async () => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    fireEvent.click(within(card).getByRole("checkbox", { name: "Picked up" })); // turn off
    fireEvent.click(saveButton(card));
    await within(card).findByText("Preferences saved.");
    expect(card.textContent ?? "").not.toMatch(/muted|suppressed|will no longer notify|notification (was )?(sent|created)/i);
  });
});

describe("SCRUM-280 criterion 6: a 360px-appropriate preferences form, as far as jsdom can check", () => {
  const px = (value: string) => (/^(\d+(?:\.\d+)?)px$/.exec(value.trim()) ? Number.parseFloat(value) : null);

  it("gives every control in preferences a 44px tap target", async () => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    // Checkbox <input>s carry no inline style; their wrapping <label> is the real 44px tap target
    // (NotificationPreferencesPanel.tsx), so checkboxes are excluded and their labels checked instead.
    // The minutes field's own plain caption <label> ("Minutes after planned pickup", from the shared
    // Input component) is not itself a tap target — its paired <input> already carries the style — so
    // only checkbox-wrapping labels are kept.
    const controls = [...card.querySelectorAll<HTMLElement>("button, a[href], select, label, input:not([type=checkbox])")]
      .filter(control => control.tagName !== "LABEL" || control.querySelector("input[type=checkbox]"));
    expect(controls.length).toBeGreaterThan(3);
    for (const control of controls) {
      expect({ control: control.textContent || control.getAttribute("aria-label"), minHeight: control.style.minHeight })
        .toEqual({ control: control.textContent || control.getAttribute("aria-label"), minHeight: "44px" });
    }
  });

  it("sets no fixed width wider than 360px anywhere in the preferences form", async () => {
    serve({ preferences: samples.preferences() });
    await openPreferences();
    const card = prefsCard();
    const tooWide = [...card.querySelectorAll<HTMLElement>("*")].filter(element =>
      [element.style.width, element.style.minWidth, element.style.flexBasis].some(value => (px(value) ?? 0) > 360));
    expect(tooWide.map(element => element.outerHTML.slice(0, 80))).toEqual([]);
  });
});
