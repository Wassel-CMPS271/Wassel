// The driver Today screen with the offline confirmation queue active
// (confirmationReplayApi non-null — SCRUM-263 merged). page.test.tsx covers the
// online-only fallback (confirmationReplayApi null) and is unchanged by SCRUM-273;
// this file only proves the *integration*: enqueuing from a tap, showing the
// queue's state on the stop card, reconnecting, End run blocking, and the page
// wiring Retry/Dismiss through to the real queue. Each pill and the GPS card's own
// states are covered in StopCard.test.tsx and GpsSharingCard.test.tsx.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConfirmationReplayInput } from "@/lib/api/confirmationReplay";
import { ApiError } from "@/lib/api/errors";
import { confirmStudent, getDriverToday, type DriverDay, type Run } from "@/lib/api/runs";
import { todayInBeirut } from "@/lib/offline/queue";
import { queueStorageKey } from "@/lib/offline/storage";
import sample from "../../../../../docs/contracts/samples/runs/driver-today.json";
import DriverTodayPage from "./page";

vi.mock("@/lib/api/runs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDriverToday: vi.fn(),
  startRun: vi.fn(),
  endRun: vi.fn(),
  confirmStudent: vi.fn(),
}));

const confirm = vi.fn();
vi.mock("@/lib/api/confirmationReplay", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmationReplayApi: { confirm: (...args: [ConfirmationReplayInput]) => confirm(...args) },
}));

vi.mock("@/lib/api/driverGps", () => ({ driverGpsApi: null }));

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
function savedItems(): Array<{ state: string }> {
  const key = queueStorageKey("driver-1");
  const raw = window.localStorage.getItem(key);
  const items: Array<{ state: string }> = raw === null ? [] : JSON.parse(raw).items;
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

beforeEach(() => {
  vi.mocked(getDriverToday).mockReset().mockResolvedValue(DAY);
  vi.mocked(confirmStudent).mockReset();
  confirm.mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
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

it("shows Saved on phone as soon as a tap is made, before anything is sent", async () => {
  confirm.mockReturnValue(new Promise(() => {})); // never resolves in this test
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
  confirm
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockImplementationOnce(async (input: ConfirmationReplayInput) => runFor(input));
  render(<DriverTodayPage />);
  await flush();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await flush();
  expect(within(card("Dana Fares")).getByText(/Couldn't send/)).toBeInTheDocument();
  expect(confirm).toHaveBeenCalledTimes(1);

  // No extra tap needed: the backoff retries it on its own once it's due. The
  // same key being reused and nothing being sent twice is already covered end
  // to end in queue.test.ts and useOfflineQueue.test.ts; this just checks the
  // page reflects it.
  await act(() => vi.advanceTimersByTimeAsync(2_000));

  expect(confirm).toHaveBeenCalledTimes(2);
  expect(confirm.mock.calls[1][0].clientRequestId).toBe(confirm.mock.calls[0][0].clientRequestId);
  expect(within(card("Dana Fares")).getByText("Done · Picked up")).toBeInTheDocument();
});

it("projects an unsent tap onto the stop at once: the next button changes before anything is sent", async () => {
  confirm.mockReturnValue(new Promise(() => {})); // never resolves in this test
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  // Still unsent (Saved on phone/Sending), but already projected as PICKED_UP:
  // only Dropped off is offered next, and the done/skip count includes it.
  await within(card("Dana Fares")).findByText(/Saved on phone|Sending/);
  expect(within(card("Dana Fares")).queryByRole("button", { name: "Picked up" })).not.toBeInTheDocument();
  expect(within(card("Dana Fares")).getByRole("button", { name: "Dropped off" })).toBeInTheDocument();
});

it("disables End run, with an explanation, while this run has an unsent confirmation", async () => {
  confirm.mockReturnValue(new Promise(() => {}));
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  const endRun = await screen.findByRole("button", { name: "End run" });
  expect(endRun).toBeDisabled();
  expect(
    screen.getByText("End run is disabled until every saved confirmation for this run has been sent or dismissed."),
  ).toBeInTheDocument();
});

it("Try again on the card retries the same item through the real queue", async () => {
  confirm
    .mockImplementationOnce(async () => {
      throw new ApiError(500, "Oops");
    })
    .mockImplementationOnce(async (input: ConfirmationReplayInput) => runFor(input));
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await within(card("Dana Fares")).findByText(/Couldn't send/);

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Try again" }));

  // retry() is async now (it waits for the write lock); the card follows once it lands.
  await within(card("Dana Fares")).findByText("Done · Picked up");
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(confirm.mock.calls[1][0].clientRequestId).toBe(confirm.mock.calls[0][0].clientRequestId);
  expect(savedItems().map((item) => item.state)).toEqual(["synced"]);
});

it("Dismiss on a conflict removes it through the real queue, without resending it", async () => {
  confirm.mockImplementationOnce(async () => {
    throw new ApiError(409, "Not in progress");
  });
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await within(card("Dana Fares")).findByText(/Conflict/);

  fireEvent.click(
    within(card("Dana Fares")).getByRole("button", { name: "Dismiss saved tap for Dana Fares" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm dismiss saved tap for Dana Fares" }));

  // discard() is async now (it waits for the write lock): the conflict goes once it
  // has landed, and storage holds nothing more for this driver.
  await vi.waitFor(() => expect(within(card("Dana Fares")).queryByText(/Conflict/)).not.toBeInTheDocument());
  expect(savedItems()).toEqual([]);

  // Nothing left to send, but this also checks there's no leftover timer
  // quietly resending the discarded item.
  vi.useFakeTimers();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(within(card("Dana Fares")).queryByText(/Conflict/)).not.toBeInTheDocument();
});

it("shows the offline banner once connectivity is reported down, with the saved count", async () => {
  confirm.mockRejectedValueOnce(new TypeError("Failed to fetch"));
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
  expect(confirm).not.toHaveBeenCalled();
});

it("reloads the day in place on a conflict, without the loading skeleton (which would unmount the GPS card)", async () => {
  confirm.mockImplementationOnce(async () => {
    throw new ApiError(409, "Not in progress");
  });
  await renderPage();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await within(card("Dana Fares")).findByText(/Conflict/);

  await vi.waitFor(() => expect(getDriverToday).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Loading today's run…")).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Stops" })).toBeInTheDocument();
});
