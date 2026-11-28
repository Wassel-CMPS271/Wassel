// SCRUM-246: independent acceptance tests for SCRUM-249 (parent absences, PR #147), written from the Jira
// acceptance criteria and docs/contracts/runs.md ("Absence", "Absences", "Errors") + samples/runs/absences.json,
// not from the code. Every case starts from the production home page inside the production layout, with the
// real RoleGuard and the real request() client. Only fetch, next/navigation and the Date clock are replaced.
// Control names ("Absence date", "Cancel absence", ...) were read off the rendered screen, as a user sees them.
//
//   A1 a parent picks a child and reports either one day or a date range
//   A2 past dates cannot be picked ("today" is the calendar date in Asia/Beirut)
//   A3 upcoming absences are listed for each child, with a Cancel button and a confirmation step
//   A4 after reporting or cancelling, the list updates without a page reload
//   A5 server errors (for example, an overlapping absence) are shown in plain words
//   A6 works on a phone screen
//   A7 uses the real endpoints
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createParentHomeServer, fail, HANG, LAYLA_ID, problems, samples, TAREK_ID,
  type ParentHomeServer,
} from "@/test-support/parentScreensContract";
import ParentLayout from "./layout";
import ParentPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/parent" }));

// Clocks, worked out by hand. Asia/Beirut is UTC+3 until 25 Oct 2026.
//   2026-10-20T09:00:00Z = 20 Oct 12:00 in Beirut -> today 2026-10-20
//   2026-10-20T22:30:00Z = 21 Oct 01:30 in Beirut -> today 2026-10-21 (still 20 Oct in UTC)
const NOON_20_OCT = { instant: "2026-10-20T09:00:00Z", today: "2026-10-20" };
const LATE_20_OCT_UTC = { instant: "2026-10-20T22:30:00Z", today: "2026-10-21" };

const TAREK = "Tarek Mansour";
const LAYLA = "Layla Mansour";
const SAMPLE_RANGE_ID = "60000000-0000-4000-8000-000000000001"; // Tarek, 2026-10-21 to 2026-10-23
const SAMPLE_DAY_ID = "60000000-0000-4000-8000-000000000002"; //   Tarek, 2026-11-02

let server: ParentHomeServer;
function serve(clock: { instant: string; today: string }, initial: Parameters<typeof createParentHomeServer>[0] = {}) {
  vi.setSystemTime(new Date(clock.instant));
  server = createParentHomeServer({ today: clock.today, ...initial });
  vi.stubGlobal("fetch", server.fetch);
  return server;
}

const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const absencePath = (childId: string) => new RegExp(`^/api/parent/children/${childId}/absences(/|$)`);
const posts = () => server.requests(/\/absences$/, "POST");
const deletes = () => server.requests(/\/absences\/[^/]+$/, "DELETE");

/** Home page -> the child's absences, the way a parent gets there (A1 "a parent picks a child"). */
async function openAbsences(name: string) {
  render(<ParentLayout><ParentPage /></ParentLayout>);
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`absences for ${name}`, "i") }));
  return screen.findByRole("heading", { name: new RegExp(`absences for ${name}`, "i") });
}
/** Waits for the absence list to have been answered. */
async function listLoaded(childId: string) {
  await waitFor(() => expect(server.requests(absencePath(childId), "GET")).toHaveLength(1));
}
/**
 * The listed absences: the list items inside the child's absences panel, none when it is not open.
 * No button is involved, so a row whose Cancel button is swapped for its confirmation step still counts.
 */
function rows(): HTMLElement[] {
  const panel = screen.queryByRole("region", { name: /^Absences for / });
  return panel ? within(panel).queryAllByRole("listitem") : [];
}
const rowWith = (text: string) => rows().find(row => squash(row.textContent).includes(text));
/** The Cancel buttons on screen, or in one row. A row in its confirmation step has none. */
const cancelButtons = (row?: HTMLElement) => (row ? within(row) : screen).queryAllByRole("button", { name: "Cancel absence" });

function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Report absence" }));
const chooseRange = () => fireEvent.click(screen.getByLabelText("Report a date range"));

/** An on-screen message must be plain words: no status code, no JSON, no exception text. */
function expectPlainWords(text: string) {
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toMatch(/\b(400|404|409|500)\b|[{}]|Conflict|ProblemDetail|TypeError|ApiError|undefined/);
}

beforeEach(() => {
  router.replace.mockReset();
  // Only Date is faked: timers and promises stay real, so fetch and Testing Library's waitFor work as usual.
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SCRUM-249 parent absences (independent, SCRUM-246)", () => {
  describe("A3 upcoming list and empty state", () => {
    it("A3: lists the child's upcoming absences from the contract sample, each with its own Cancel button", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      // absences.json: a range 2026-10-21..2026-10-23 and a single day 2026-11-02, ordered by fromDate.
      const [first, second] = rows();
      expect(squash(first.textContent)).toContain("2026-10-21");
      expect(squash(first.textContent)).toContain("2026-10-23");
      expect(squash(second.textContent)).toContain("2026-11-02");
      for (const row of rows()) {
        const buttons = cancelButtons(row);
        expect(buttons).toHaveLength(1);
        expect(buttons[0]).toBeEnabled();
      }
    });

    it("A3/empty: a child with no upcoming absences gets an empty-state message and no Cancel buttons", async () => {
      serve(NOON_20_OCT, { absences: [] });
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      expect(await screen.findByText(/no (upcoming )?absences/i)).toBeVisible();
      expect(rows()).toHaveLength(0);
    });
  });

  describe("A1 + A4 + A7 reporting", () => {
    it("A1/A4/A7: reports one day through the real endpoint and the list updates without a page reload", async () => {
      serve(NOON_20_OCT);
      const heading = await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));

      setDate("Absence date", "2026-10-27");
      submit();

      await waitFor(() => expect(rowWith("2026-10-27")).toBeDefined());
      expect(posts()).toHaveLength(1);
      const [post] = posts();
      expect(post.path).toBe(`/api/parent/children/${TAREK_ID}/absences`);
      expect(post.credentials).toBe("include");
      // runs.md: toDate is optional and defaults to fromDate, so a single day may send it or not, but equal.
      expect((post.body as Record<string, unknown>).fromDate).toBe("2026-10-27");
      expect([undefined, "2026-10-27"]).toContain((post.body as Record<string, unknown>).toDate);
      expect(server.absencesOf(TAREK_ID).map(a => [a.fromDate, a.toDate])).toContainEqual(["2026-10-27", "2026-10-27"]);
      expect(rows()).toHaveLength(3);
      // No page reload: the children were fetched once and the screen was not rebuilt.
      expect(server.requests("/api/parent/children", "GET")).toHaveLength(1);
      expect(heading.isConnected).toBe(true);
      // A7: nothing went to any other child's absences.
      expect(server.requests(absencePath(LAYLA_ID))).toHaveLength(0);
    });

    it("A1/A4: reports an inclusive date range with both dates sent", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      chooseRange();
      setDate("Start date", "2026-10-26");
      setDate("End date", "2026-10-28");
      submit();

      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(posts()[0].body).toEqual({ fromDate: "2026-10-26", toDate: "2026-10-28" });
      await waitFor(() => {
        const row = rowWith("2026-10-26");
        expect(row).toBeDefined();
        expect(squash(row!.textContent)).toContain("2026-10-28");
      });
      expect(server.requests("/api/parent/children", "GET")).toHaveLength(1);
    });

    it("A1: a child with no route can be reported absent too (runs.md: with or without a route)", async () => {
      serve(NOON_20_OCT);
      await openAbsences(LAYLA);
      await listLoaded(LAYLA_ID);
      setDate("Absence date", "2026-10-27");
      submit();

      await waitFor(() => expect(rowWith("2026-10-27")).toBeDefined());
      expect(posts().map(p => p.path)).toEqual([`/api/parent/children/${LAYLA_ID}/absences`]);
      expect(server.requests(absencePath(TAREK_ID))).toHaveLength(0);
    });

    it("A1: an exact repeat (server 200 with the existing absence) does not add a second row", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      setDate("Absence date", "2026-11-02");
      submit();

      await waitFor(() => expect(posts()).toHaveLength(1));
      await waitFor(() => expect(screen.getByRole("button", { name: "Report absence" })).toBeEnabled());
      expect(rows().filter(row => squash(row.textContent).includes("2026-11-02"))).toHaveLength(1);
      expect(rows()).toHaveLength(2);
    });
  });

  describe("A2 past dates cannot be picked", () => {
    it("A2: the date pickers start at today and a past day is refused before anything is sent", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      expect(screen.getByLabelText("Absence date")).toHaveAttribute("min", "2026-10-20");

      setDate("Absence date", "2026-10-19");
      submit();

      expect(await screen.findByText(/past|today|earlier|before/i)).toBeVisible();
      expect(posts()).toHaveLength(0);
      expect(rowWith("2026-10-19")).toBeUndefined();
    });

    it("A2: in range mode both pickers start at today, and a past start is refused", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      chooseRange();
      expect(screen.getByLabelText("Start date")).toHaveAttribute("min", "2026-10-20");
      expect(screen.getByLabelText("End date")).toHaveAttribute("min", "2026-10-20");

      setDate("Start date", "2026-10-18");
      setDate("End date", "2026-10-22");
      submit();

      expect(await screen.findByText(/past|today|earlier|before/i)).toBeVisible();
      expect(posts()).toHaveLength(0);
    });

    it("A2/Asia/Beirut: at 22:30 UTC on 20 Oct it is already 21 Oct in Beirut, so 20 Oct is refused", async () => {
      serve(LATE_20_OCT_UTC);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      expect(screen.getByLabelText("Absence date")).toHaveAttribute("min", "2026-10-21");

      setDate("Absence date", "2026-10-20");
      submit();

      expect(await screen.findByText(/past|today|earlier|before/i)).toBeVisible();
      expect(posts()).toHaveLength(0);
    });

    it("A2: a range whose end is before its start is refused before anything is sent", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      chooseRange();
      setDate("Start date", "2026-10-28");
      setDate("End date", "2026-10-26");
      submit();

      // Scoped to the alert: the form's hint ("…morning and afternoon transport…") also contains "after".
      const alert = await screen.findByRole("alert");
      expect(squash(alert.textContent)).toMatch(/before|after/i);
      expect(posts()).toHaveLength(0);
    });
  });

  describe("A3 cancel confirmation step", () => {
    it("A3: Cancel asks for confirmation first, moves focus into it, and sends nothing yet", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      const row = rowWith("2026-10-21")!;
      fireEvent.click(within(row).getByRole("button", { name: "Cancel absence" }));

      const confirm = await within(row).findByRole("button", { name: "Confirm cancellation" });
      expect(within(row).getByRole("button", { name: "Keep absence" })).toBeVisible();
      expect(cancelButtons(row)).toHaveLength(0);
      await waitFor(() => expect(document.activeElement).toBe(confirm));
      expect(deletes()).toHaveLength(0);
    });

    it.each([
      ["Keep absence", () => fireEvent.click(screen.getByRole("button", { name: "Keep absence" }))],
      ["Escape", () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })],
    ])("A3: backing out with %s keeps the absence, sends no DELETE and returns focus to Cancel", async (_, backOut) => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      fireEvent.click(within(rowWith("2026-10-21")!).getByRole("button", { name: "Cancel absence" }));
      const confirm = await screen.findByRole("button", { name: "Confirm cancellation" });
      await waitFor(() => expect(document.activeElement).toBe(confirm));

      backOut();

      await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm cancellation" })).toBeNull());
      expect(rows()).toHaveLength(2);
      expect(deletes()).toHaveLength(0);
      const [cancel] = cancelButtons(rowWith("2026-10-21")!);
      expect(cancel).toBeDefined();
      await waitFor(() => expect(document.activeElement).toBe(cancel));
    });

    it("A3/A4/A7: confirming sends one DELETE for that absence and the row disappears without a page reload", async () => {
      serve(NOON_20_OCT);
      const heading = await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      fireEvent.click(within(rowWith("2026-10-21")!).getByRole("button", { name: "Cancel absence" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm cancellation" }));

      await waitFor(() => expect(rows()).toHaveLength(1));
      expect(rowWith("2026-10-21")).toBeUndefined();
      expect(rowWith("2026-11-02")).toBeDefined();
      expect(deletes().map(d => d.path)).toEqual([`/api/parent/children/${TAREK_ID}/absences/${SAMPLE_RANGE_ID}`]);
      expect(deletes()[0].credentials).toBe("include");
      expect(server.absencesOf(TAREK_ID).map(a => a.id)).toEqual([SAMPLE_DAY_ID]);
      expect(server.requests("/api/parent/children", "GET")).toHaveLength(1);
      expect(heading.isConnected).toBe(true);
    });
  });

  describe("A5 server errors in plain words", () => {
    it("A5: an overlapping absence (409) shows the server's reason in plain words and changes nothing", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      setDate("Absence date", "2026-10-22"); // inside the sample's 21-23 Oct
      submit();

      const reason = problems.overlap(samples.absences()[0]);
      const message = await screen.findByText(reason, { exact: false });
      expect(message).toBeVisible();
      expectPlainWords(squash(message.textContent));
      expect(posts()).toHaveLength(1);
      expect(rows()).toHaveLength(2);
      expect(rowWith("2026-10-22")).toBeUndefined();
    });

    it("A5: a server error (500) while reporting gives a plain message and adds no row", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      server.once("POST", /\/absences$/, fail(500, { detail: "Internal Server Error" }));
      setDate("Absence date", "2026-10-27");
      submit();

      const alert = await screen.findByRole("alert");
      expectPlainWords(squash(alert.textContent));
      expect(rows()).toHaveLength(2);
      expect(rowWith("2026-10-27")).toBeUndefined();
    });

    it("A5: a server error (500) while loading the list gives a plain message and shows no absences", async () => {
      serve(NOON_20_OCT);
      server.once("GET", absencePath(TAREK_ID), fail(500, { detail: "Internal Server Error" }));
      await openAbsences(TAREK);

      const alert = await screen.findByRole("alert");
      expectPlainWords(squash(alert.textContent));
      expect(rows()).toHaveLength(0);
      // The failure must be the real endpoint's answer, not some other request failing.
      expect(server.requests(absencePath(TAREK_ID), "GET")).toHaveLength(1);
    });

    it("A5: a cancel the server refuses (409, already ended) shows its reason in plain words and keeps the row", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      server.once("DELETE", /\/absences\/[^/]+$/, fail(409, { detail: problems.endedBeforeToday }));
      fireEvent.click(within(rowWith("2026-10-21")!).getByRole("button", { name: "Cancel absence" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm cancellation" }));

      // Everything but the message is already right, so this case fails only on the missing reason.
      await waitFor(() => expect(deletes()).toHaveLength(1));
      const row = rowWith("2026-10-21");
      expect(row).toBeDefined();
      const step = within(row!).getByRole("group", { name: /^Confirm cancellation / });
      await waitFor(() => expect(within(step).getByRole("button", { name: "Confirm cancellation" })).toBeEnabled());
      expect(within(step).getByRole("button", { name: "Keep absence" })).toBeVisible();
      const message = await screen.findByText(problems.endedBeforeToday, { exact: false });
      expect(message).toBeVisible();
      expectPlainWords(squash(message.textContent));
    });

    it("A5: cancelling an absence that is already gone (404) is explained in plain words", async () => {
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      // Cancelled meanwhile from another device: the backend no longer has it (runs.md: 404).
      server.state.absences = server.state.absences.filter(a => a.id !== SAMPLE_RANGE_ID);
      fireEvent.click(within(rowWith("2026-10-21")!).getByRole("button", { name: "Cancel absence" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm cancellation" }));

      await waitFor(() => expect(deletes()).toHaveLength(1));
      const alert = await screen.findByRole("alert");
      expectPlainWords(squash(alert.textContent));
    });
  });

  describe("A6 phone screen", () => {
    it("A6: at 360 px every absence control is a labelled native control", async () => {
      // jsdom has no layout engine: overflow and tap-target sizes are only verifiable in a real browser.
      vi.stubGlobal("innerWidth", 360);
      window.dispatchEvent(new Event("resize"));
      serve(NOON_20_OCT);
      await openAbsences(TAREK);
      await listLoaded(TAREK_ID);
      await waitFor(() => expect(rows()).toHaveLength(2));
      expect(screen.getByLabelText("Absence date").tagName).toBe("INPUT");
      expect(screen.getByLabelText("Report a date range").tagName).toBe("INPUT");
      expect(screen.getByRole("button", { name: "Report absence" }).tagName).toBe("BUTTON");
      for (const row of rows()) expect(cancelButtons(row).map(button => button.tagName)).toEqual(["BUTTON"]);
    });
  });

  it("loading: shows a loading state while the list is on its way", async () => {
    serve(NOON_20_OCT);
    server.once("GET", absencePath(TAREK_ID), HANG);
    await openAbsences(TAREK);
    expect(await screen.findByText(/loading/i)).toBeVisible();
    expect(rows()).toHaveLength(0);
    expect(server.requests(absencePath(TAREK_ID), "GET")).toHaveLength(1);
  });
});
