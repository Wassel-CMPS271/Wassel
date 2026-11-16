// The driver Today screen with the offline confirmation queue, which every tap goes
// through. page.test.tsx covers the online-only fallback a tap takes when it can't
// be saved on the phone; this file only proves the *integration*: enqueuing from a
// tap, showing the queue's state on the stop card, reconnecting, End run blocking,
// a 404/409 dropping the tap and reloading the day, the page wiring Retry/Dismiss
// through to the real queue, and a 401 pausing the queue and sending the driver to
// sign in, then draining the same items with the same keys once they're back. The
// confirmationReplayApi here is the real client against a stubbed fetch
// (test-support/confirmationBackend.ts, the client.test.ts pattern), not a module
// mock, so these tests also exercise request() and the backend's own clientRequestId
// rules; each pill and the GPS card's own states in StopCard.test.tsx and
// GpsSharingCard.test.tsx.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { me } from "@/lib/api/auth";
import type { ConfirmationReplayInput } from "@/lib/api/confirmationReplay";
import { ApiError } from "@/lib/api/errors";
import {
  confirmStudent,
  getDriverToday,
  type ConfirmationStatus,
  type DriverDay,
  type Run,
} from "@/lib/api/runs";
import { todayInBeirut } from "@/lib/offline/queue";
import { queueStorageKey } from "@/lib/offline/storage";
import { stubConfirmationBackend, type ConfirmationCall } from "@/test-support/confirmationBackend";
import sample from "../../../../../docs/contracts/samples/runs/driver-today.json";
import DriverTodayPage from "./page";

vi.mock("@/lib/api/runs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDriverToday: vi.fn(),
  startRun: vi.fn(),
  endRun: vi.fn(),
  confirmStudent: vi.fn(),
}));

vi.mock("@/lib/api/driverGps", () => ({ driverGpsApi: null }));

vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  me: vi.fn(),
}));

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

vi.mock("@/components/auth/RoleGuard", () => ({
  useCurrentUser: () => ({ id: "driver-1", email: "karim@wassel.local", role: "DRIVER", schoolId: "s-1" }),
}));

// The fixture's own date is fixed ("2026-10-21"); the queue treats anything but
// the real "today" in Beirut as stale and refuses to send it (queue.ts), so
// every run's date is moved to today for these tests.
const TODAY = todayInBeirut();
const DAY: DriverDay = {
  ...(sample as unknown as DriverDay),
  date: TODAY,
  runs: (sample as unknown as DriverDay).runs.map((run) => ({ ...run, date: TODAY })),
};

// Everything saved on the phone for this driver: the queue key and any pending key
// enqueue() wrote that hasn't been merged yet.
function savedItems(): Array<{ state: string; clientRequestId: string }> {
  const key = queueStorageKey("driver-1");
  const raw = window.localStorage.getItem(key);
  const items: Array<{ state: string; clientRequestId: string }> = raw === null ? [] : JSON.parse(raw).items;
  for (let i = 0; i < window.localStorage.length; i++) {
    const other = window.localStorage.key(i)!;
    if (other.startsWith(`${key}.pending.`)) items.push(JSON.parse(window.localStorage.getItem(other)!).item);
  }
  return items;
}

function card(name: string) {
  return screen.getByText(name).closest("li")!;
}

function runFor(input: ConfirmationReplayInput): Run {
  const [morning] = DAY.runs;
  return {
    ...morning,
    stops: morning.stops.map((stop) =>
      stop.studentId === input.studentId
        ? { ...stop, confirmation: { status: input.status, at: "2026-10-21T05:00:00Z" } }
        : stop,
    ),
  };
}

// Bridges the stubbed backend's raw call (url/body) to the test's own runFor(), so a
// call the test doesn't script is applied as the real server would: 200 with the run
// as it is now.
function runForCall(call: ConfirmationCall): Run {
  return runFor({
    runId: call.runId,
    studentId: call.studentId,
    status: call.body.status as ConfirmationStatus,
    clientRequestId: call.body.clientRequestId ?? "",
  });
}

let backend: ReturnType<typeof stubConfirmationBackend>;

beforeEach(() => {
  vi.mocked(getDriverToday).mockReset().mockResolvedValue(DAY);
  vi.mocked(confirmStudent).mockReset();
  vi.mocked(me).mockReset().mockRejectedValue(new ApiError(401));
  backend = stubConfirmationBackend({ runFor: runForCall });
  replace.mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderPage() {
  render(<DriverTodayPage />);
  await screen.findByRole("list", { name: "Stops" });
}

// Lets a promise chain settle without moving the clock — for use once fake
// timers are active, where findBy/waitFor's real-timer polling would just hang.
async function flush() {
  await act(async () => {});
}

// Lets the drain a tap started (it sends nothing behind a failed item) finish, so a
// Try again right after starts a drain of its own rather than joining that one.
async function settleDrain() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

it("shows Saved on phone as soon as a tap is made, before anything is sent", async () => {
  backend.reply("stall"); // never resolves in this test
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  expect(await within(card("Dana Fares")).findByText(/Saved on phone|Sending/)).toBeInTheDocument();
});

it("reconnects and sends exactly once, with the same key, ending up Done", async () => {
  // Fake timers from the start, so the failed attempt's own backoff timer is
  // one this test can advance: switching to fake timers only after it's
  // already been scheduled as a real one (findBy/waitFor needs real timers to
  // poll with) wouldn't let advanceTimersByTimeAsync reach it.
  vi.useFakeTimers();
  backend.reply("network"); // the second (retried) attempt is unscripted: applied as a 200
  render(<DriverTodayPage />);
  await flush();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await flush();
  expect(within(card("Dana Fares")).getByText(/Couldn't send/)).toBeInTheDocument();
  expect(backend.calls).toHaveLength(1);

  // No extra tap needed: the backoff retries it on its own once it's due. The
  // same key being reused and nothing being sent twice is already covered end
  // to end in queue.test.ts and useOfflineQueue.test.ts; this just checks the
  // page reflects it.
  await act(() => vi.advanceTimersByTimeAsync(2_000));

  expect(backend.calls).toHaveLength(2);
  expect(backend.calls[1].body.clientRequestId).toBe(backend.calls[0].body.clientRequestId);
  expect(within(card("Dana Fares")).getByText("Done · Picked up")).toBeInTheDocument();
});

it("projects an unsent tap onto the stop at once: the next button changes before anything is sent", async () => {
  backend.reply("stall"); // never resolves in this test
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  // Still unsent (Saved on phone/Sending), but already projected as PICKED_UP:
  // only Dropped off is offered next, and the done/skip count includes it.
  await within(card("Dana Fares")).findByText(/Saved on phone|Sending/);
  expect(within(card("Dana Fares")).queryByRole("button", { name: "Picked up" })).not.toBeInTheDocument();
  expect(within(card("Dana Fares")).getByRole("button", { name: "Dropped off" })).toBeInTheDocument();
});

it("disables End run, with an explanation, while this run has an unsent confirmation", async () => {
  backend.reply("stall");
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  const endRun = await screen.findByRole("button", { name: "End run" });
  expect(endRun).toBeDisabled();
  expect(
    screen.getByText("End run is disabled until every saved confirmation for this run has been sent or dismissed."),
  ).toBeInTheDocument();
});

it("Try again on the card retries the same item through the real queue", async () => {
  backend.reply({ status: 500, body: { detail: "Oops" } }); // the retry is unscripted: applied as a 200
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await within(card("Dana Fares")).findByText(/Couldn't send/);

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Try again" }));

  // retry() is async now (it waits for the write lock); the card follows once it lands.
  await within(card("Dana Fares")).findByText("Done · Picked up");
  expect(backend.calls).toHaveLength(2);
  expect(backend.calls[1].body.clientRequestId).toBe(backend.calls[0].body.clientRequestId);
  expect(savedItems().map((item) => item.state)).toEqual(["synced"]);
});

it("Dismiss on a refused tap (422) removes it through the real queue, without resending it", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  backend.reply({ status: 422, body: { detail: "clientRequestId was already used for a different confirmation" } });
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await within(card("Dana Fares")).findByText(/Couldn't send/);
  // The same key would be refused again, so there is no Try again.
  expect(within(card("Dana Fares")).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "End run" })).toBeDisabled();

  fireEvent.click(
    within(card("Dana Fares")).getByRole("button", { name: "Dismiss saved tap for Dana Fares" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm dismiss saved tap for Dana Fares" }));

  // discard() is async (it waits for the write lock): the item goes once it has
  // landed, and storage holds nothing more for this driver.
  await vi.waitFor(() =>
    expect(within(card("Dana Fares")).queryByText(/Couldn't send/)).not.toBeInTheDocument(),
  );
  expect(savedItems()).toEqual([]);

  // Nothing left to send, but this also checks there's no leftover timer
  // quietly resending the discarded item.
  vi.useFakeTimers();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(backend.calls).toHaveLength(1);
  vi.mocked(console.error).mockRestore();
});

it("drops a tap the server refuses with a 409, reloads the day and shows the server's detail", async () => {
  backend.reply({ status: 409, body: { detail: "Student is NOT_PRESENT, so they cannot be marked PICKED_UP" } });
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  expect(await within(card("Dana Fares")).findByRole("alert")).toHaveTextContent(
    "Student is NOT_PRESENT, so they cannot be marked PICKED_UP",
  );
  expect(getDriverToday).toHaveBeenCalledTimes(2);
  expect(savedItems()).toEqual([]);
  // Nothing unsent is left for this run, so End run is offered again.
  expect(screen.getByRole("button", { name: "End run" })).toBeEnabled();
  // The stop is back to what the server holds, and a new tap clears the notice.
  backend.reply("stall");
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  expect(within(card("Dana Fares")).queryByText(/cannot be marked/)).not.toBeInTheDocument();
});

it("shows no failure for a 409 when the reloaded stop already has the tapped status", async () => {
  const [morning, ...rest] = DAY.runs;
  const dana = morning.stops.find((s) => s.firstName === "Dana")!;
  const recorded: DriverDay = {
    ...DAY,
    runs: [
      {
        ...morning,
        stops: morning.stops.map((s) =>
          s.studentId === dana.studentId
            ? { ...s, confirmation: { status: "PICKED_UP" as const, at: "2026-10-21T05:00:00Z" } }
            : s,
        ),
      },
      ...rest,
    ],
  };
  vi.mocked(getDriverToday).mockResolvedValueOnce(DAY).mockResolvedValueOnce(recorded);
  backend.reply({ status: 409, body: { detail: "Run is FINISHED, so it cannot be confirmed" } });
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  await vi.waitFor(() => expect(getDriverToday).toHaveBeenCalledTimes(2));
  expect(await within(card("Dana Fares")).findByText("Done · Picked up")).toBeInTheDocument();
  expect(within(card("Dana Fares")).queryByText(/cannot be confirmed/)).not.toBeInTheDocument();
  expect(savedItems()).toEqual([]);
});

it("sends the next tap after a refused move (409 while the run is still in progress), with its own key", async () => {
  // Offline: Not present, then Picked up, both saved. Back online, the first is refused.
  backend.reply("network");
  await renderPage();
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Not present" }));
  await within(card("Dana Fares")).findByText(/Couldn't send/);
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await settleDrain();

  // The retried Not present 409s; the Picked up behind it is unscripted: applied as a 200.
  backend.reply({ status: 409, body: { detail: "Student is PICKED_UP, so they cannot be marked NOT_PRESENT" } });
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Try again" }));

  await vi.waitFor(() => expect(savedItems().map((item) => item.state)).toEqual(["synced"]));
  expect(backend.calls.map((call) => call.body.status)).toEqual(["NOT_PRESENT", "NOT_PRESENT", "PICKED_UP"]);
  expect(backend.calls[2].body.clientRequestId).not.toBe(backend.calls[1].body.clientRequestId);
  // The refused tap's detail, and nothing about later taps: none was dropped.
  const notice = within(card("Dana Fares")).getByText(/cannot be marked NOT_PRESENT/);
  expect(notice).not.toHaveTextContent(/not sent/);
});

it("says how many later taps weren't sent when a 409 comes back for a run that is no longer in progress", async () => {
  const finished: DriverDay = {
    ...DAY,
    runs: DAY.runs.map((run, i) => (i === 0 ? { ...run, state: "FINISHED" as const } : run)),
  };
  backend.reply("network");
  await renderPage();
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await within(card("Dana Fares")).findByText(/Couldn't send/);
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Dropped off" }));
  await settleDrain();

  vi.mocked(getDriverToday).mockResolvedValue(finished);
  backend.reply({ status: 409, body: { detail: "Run is FINISHED, so it cannot be confirmed" } });
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Try again" }));

  // The finished run has left the screen, so the notice is on the page, by name. It's
  // a page-level notice (not a stop's own), so it keeps role="status".
  const notice = await screen.findByText(
    "Run is FINISHED, so it cannot be confirmed. 1 later tap for Dana Fares was not sent.",
  );
  expect(notice).toHaveAttribute("role", "status");
  expect(backend.calls).toHaveLength(2);
  expect(savedItems()).toEqual([]);
});

it("shows the server's detail on the page when a 404 comes back for a run the reloaded day no longer has", async () => {
  const [, afternoon] = DAY.runs;
  const reassigned: DriverDay = { ...DAY, runs: [afternoon] };
  backend.reply({ status: 404, body: { detail: "Run not found" } });
  await renderPage();
  vi.mocked(getDriverToday).mockResolvedValue(reassigned);

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  const notice = await screen.findByText("Run not found");
  expect(notice).toHaveAttribute("role", "status");
  expect(notice.closest("li")).toBeNull();
  expect(getDriverToday).toHaveBeenCalledTimes(2);
  expect(savedItems()).toEqual([]);
});

it("never sends a tap directly while an older saved tap for the same stop is unsent", async () => {
  vi.useFakeTimers();
  backend.reply("network");
  vi.mocked(confirmStudent).mockImplementation(async (runId, studentId, status) =>
    runFor({ runId, studentId, status, clientRequestId: "unused" }),
  );
  render(<DriverTodayPage />);
  await flush();
  // Saved on the phone, not sent yet (offline).
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await flush();
  expect(within(card("Dana Fares")).getByText(/Couldn't send/)).toBeInTheDocument();

  // Storage then fails: Dropped off can't be saved, and mustn't overtake Picked up.
  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Dropped off" }));
  await flush();
  setItem.mockRestore();

  expect(confirmStudent).not.toHaveBeenCalled();
  expect(within(card("Dana Fares")).getByText(/an earlier saved tap for this stop hasn't been sent yet/)).toBeInTheDocument();
  // Another stop, with nothing saved, still goes straight out.
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  fireEvent.click(within(card("Rami Nasr")).getByRole("button", { name: "Dropped off" }));
  await flush();
  vi.mocked(Storage.prototype.setItem).mockRestore();
  expect(confirmStudent).toHaveBeenCalledTimes(1);
  expect(confirmStudent).toHaveBeenCalledWith(DAY.runs[0].id, DAY.runs[0].stops[0].studentId, "DROPPED_OFF");
});

it("shows the offline banner once connectivity is reported down, with the saved count", async () => {
  backend.reply("network");
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await within(card("Dana Fares")).findByText(/Couldn't send/);

  const banners = screen.getAllByRole("status");
  expect(banners.some((el) => /You're offline/.test(el.textContent ?? ""))).toBe(true);
});

it("sends a tap straight to the server when it can't be saved on the phone (storage full)", async () => {
  vi.mocked(confirmStudent).mockImplementation(async (runId, studentId, status) =>
    runFor({ runId, studentId, status, clientRequestId: "unused" }),
  );
  await renderPage();
  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  await within(card("Dana Fares")).findByText("Done · Picked up");
  setItem.mockRestore();
  expect(confirmStudent).toHaveBeenCalledWith(DAY.runs[0].id, expect.any(String), "PICKED_UP");
  expect(backend.calls).toHaveLength(0);
});

it("reloads the day in place on a 404, without the loading skeleton (which would unmount the GPS card)", async () => {
  backend.reply({ status: 404, body: { detail: "Student is not on this run" } });
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await within(card("Dana Fares")).findByText("Student is not on this run");

  await vi.waitFor(() => expect(getDriverToday).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Loading today's run…")).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Stops" })).toBeInTheDocument();
});

describe("a 401 (the session expired)", () => {
  function savedKeys(): string[] {
    return savedItems().map((item) => item.clientRequestId);
  }

  it("pauses the queue, keeps the tap saved and sends the driver to /login?expired=1", async () => {
    backend.reply({ status: 401 });
    await renderPage();

    fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login?expired=1"));
    expect(me).toHaveBeenCalledTimes(1);
    expect(savedItems()).toEqual([expect.objectContaining({ state: "queued" })]);
    expect(savedKeys()).toEqual([backend.calls[0].body.clientRequestId]);
    const banner = screen.getByText(/Your session expired/).closest("[role=status]") as HTMLElement;
    expect(banner).toHaveTextContent("Your session expired.");
    expect(within(banner).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/login?expired=1",
    );
    // Still shown as done on the card: nothing was lost.
    expect(within(card("Dana Fares")).queryByRole("button", { name: "Picked up" })).not.toBeInTheDocument();
  });

  it("never resumes on the 30-second connectivity tick", async () => {
    vi.useFakeTimers();
    backend.reply({ status: 401 }); // the queue stays paused, so no further call happens
    // /me can't answer either, so the page stays here, paused, rather than redirecting.
    vi.mocked(me).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<DriverTodayPage />);
    await flush();

    fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
    await flush();
    expect(backend.calls).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(5 * 30_000));

    expect(backend.calls).toHaveLength(1);
    expect(savedItems()).toEqual([expect.objectContaining({ state: "queued" })]);
    // The tick asks /me again instead (it couldn't answer the first time).
    expect(vi.mocked(me).mock.calls.length).toBeGreaterThan(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("checks /me again on the tick after it couldn't answer, and redirects once it says signed out", async () => {
    vi.useFakeTimers();
    backend.reply({ status: 401 }); // the queue stays paused, so no further call happens
    vi.mocked(me).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValue(new ApiError(401));
    render(<DriverTodayPage />);
    await flush();

    fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
    await flush();
    expect(replace).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(replace).toHaveBeenCalledWith("/login?expired=1");
    expect(backend.calls).toHaveLength(1);
  });

  it("resumes once on its own when /me says the session is still fine (a stray 401), with the same key", async () => {
    backend.reply({ status: 401 }); // the resend is unscripted: applied as a 200
    vi.mocked(me).mockResolvedValue({ id: "driver-1", email: "karim@wassel.local", role: "DRIVER", schoolId: "s-1" });
    await renderPage();

    fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

    await within(card("Dana Fares")).findByText("Done · Picked up");
    expect(backend.calls).toHaveLength(2);
    expect(backend.calls[1].body.clientRequestId).toBe(backend.calls[0].body.clientRequestId);
    expect(replace).not.toHaveBeenCalled();
  });

  it("after signing in again, /driver drains the saved taps by itself, with the same keys, each sent once", async () => {
    backend.reply({ status: 401 });
    await renderPage();
    fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login?expired=1"));
    const [key] = savedKeys();
    expect(backend.calls).toHaveLength(1);
    cleanup(); // Left for /login.

    // Signed in again: TwoFactorForm sends a driver to /driver, a new page. The same
    // backend (and its stubbed fetch) carries over, so its calls keep accumulating.
    await renderPage();

    await within(card("Dana Fares")).findByText("Done · Picked up");
    expect(backend.calls.map((call) => call.body.clientRequestId)).toEqual([key, key]);
    await vi.waitFor(() => expect(savedItems().every((item) => item.state === "synced")).toBe(true));

    // Nothing is sent a second time: not on another visit, not on a tick.
    cleanup();
    await renderPage();
    await flush();
    expect(backend.calls).toHaveLength(2);
  });

  it("a 401 on another driver call (a tap sent directly, storage full) pauses the queue and redirects too", async () => {
    vi.mocked(confirmStudent).mockRejectedValue(new ApiError(401));
    await renderPage();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });

    fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login?expired=1"));
    setItem.mockRestore();
    expect(screen.getByText(/Your session expired/)).toBeInTheDocument();
    expect(backend.calls).toHaveLength(0);
  });
});
