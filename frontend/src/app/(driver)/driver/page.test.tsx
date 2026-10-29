import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { ConfirmationStatus, DriverDay, Run } from "@/lib/api/runs";
import {
  confirmStudentSample,
  endRunSample,
  getDriverTodaySample,
  startRunSample,
} from "@/lib/api/runs.sample";
import sample from "../../../../../docs/contracts/samples/runs/driver-today.json";
import DriverTodayPage from "./page";

vi.mock("@/lib/api/runs.sample", () => ({
  getDriverTodaySample: vi.fn(),
  startRunSample: vi.fn(),
  endRunSample: vi.fn(),
  confirmStudentSample: vi.fn(),
}));

const DAY = sample as unknown as DriverDay;

beforeEach(() => {
  vi.mocked(getDriverTodaySample).mockReset();
  vi.mocked(startRunSample).mockReset();
  vi.mocked(endRunSample).mockReset();
  vi.mocked(confirmStudentSample).mockReset();
});

afterEach(() => {
  cleanup();
});

function card(name: string) {
  return screen.getByText(name).closest("li")!;
}

it("shows a loading status while today's run loads", () => {
  vi.mocked(getDriverTodaySample).mockReturnValue(new Promise(() => {}));
  render(<DriverTodayPage />);

  expect(screen.getByText("Loading today's run…")).toHaveAttribute("role", "status");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows only the current run's stops, with done, skip and next states", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  render(<DriverTodayPage />);

  expect(await screen.findByRole("heading", { name: "Hamra morning run" })).toBeInTheDocument();
  expect(screen.getByText("Morning run")).toBeInTheDocument();
  expect(screen.getByText("A 123456")).toBeInTheDocument();
  expect(screen.getByText("Karim Haddad")).toBeInTheDocument();
  expect(screen.getByText(/2 of 4 stops done · 1 to skip/)).toBeInTheDocument();

  // Four stops: the morning run's, not the afternoon's as well.
  expect(within(screen.getByRole("list", { name: "Stops" })).getAllByRole("listitem")).toHaveLength(
    4,
  );

  expect(within(card("Rami Nasr")).getByText("Done · Picked up")).toBeInTheDocument();
  expect(within(card("Salma Khoury")).getByText("Done · Not present")).toBeInTheDocument();
  expect(within(card("Tarek Mansour")).getByText("Skip")).toBeInTheDocument();
  expect(within(card("Tarek Mansour")).getByText("Absent")).toBeInTheDocument();
  expect(card("Dana Fares")).toHaveAttribute("aria-current", "step");
  expect(within(card("Dana Fares")).getByText("Next stop")).toBeInTheDocument();
});

it("shows an absent stop with a confirmation as done, not skip", async () => {
  const [morning] = DAY.runs;
  const stops = morning.stops.map((stop) =>
    stop.position === 3
      ? { ...stop, confirmation: { status: "NOT_PRESENT" as const, at: "2026-10-21T04:20:00Z" } }
      : stop,
  );
  vi.mocked(getDriverTodaySample).mockResolvedValue({ ...DAY, runs: [{ ...morning, stops }] });
  render(<DriverTodayPage />);

  await screen.findByRole("heading", { name: "Hamra morning run" });
  expect(within(card("Tarek Mansour")).getByText("Done · Not present")).toBeInTheDocument();
  expect(within(card("Tarek Mansour")).queryByText("Skip")).not.toBeInTheDocument();
  expect(card("Dana Fares")).toHaveAttribute("aria-current", "step");
});

it("moves to the afternoon run once the morning run is finished", async () => {
  const [morning, afternoon] = DAY.runs;
  vi.mocked(getDriverTodaySample).mockResolvedValue({
    ...DAY,
    runs: [{ ...morning, state: "FINISHED" }, afternoon],
  });
  render(<DriverTodayPage />);

  expect(await screen.findByText("Afternoon run")).toBeInTheDocument();
  expect(card("Dana Fares")).toHaveAttribute("aria-current", "step");
  expect(within(card("Tarek Mansour")).getByText("Skip")).toBeInTheDocument();
});

it("shows an error when loading fails and loads again on Try again", async () => {
  vi.mocked(getDriverTodaySample)
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(DAY);
  render(<DriverTodayPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Something went wrong. Please try again.",
  );
  expect(screen.getByRole("heading", { name: "Couldn't load today's run" })).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByRole("heading", { name: "Hamra morning run" })).toBeInTheDocument();
  expect(getDriverTodaySample).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "Stops" })).getAllByRole("listitem")).toHaveLength(
    4,
  );
  expect(card("Dana Fares")).toHaveAttribute("aria-current", "step");
});

it("says when every run is finished", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue({
    ...DAY,
    runs: DAY.runs.map((run) => ({ ...run, state: "FINISHED" as const })),
  });
  render(<DriverTodayPage />);

  expect(await screen.findByRole("heading", { name: "All runs done" })).toBeInTheDocument();
});

it("says when it's a holiday", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue({ ...DAY, dayType: "HOLIDAY", runs: [] });
  render(<DriverTodayPage />);

  expect(await screen.findByRole("heading", { name: "No school today" })).toBeInTheDocument();
});

it("says when the driver has no route", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue({ ...DAY, runs: [] });
  render(<DriverTodayPage />);

  expect(await screen.findByRole("heading", { name: "No route today" })).toBeInTheDocument();
});

it("shows End run, not Start run, while the run is in progress", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  render(<DriverTodayPage />);

  expect(await screen.findByRole("button", { name: "End run" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start run" })).not.toBeInTheDocument();
});

it("starts the run and shows End run without reloading the day", async () => {
  const [morning, afternoon] = DAY.runs;
  const notStarted = { ...morning, state: "NOT_STARTED" as const, startedAt: null };
  vi.mocked(getDriverTodaySample).mockResolvedValue({ ...DAY, runs: [notStarted, afternoon] });
  let resolveStart!: (run: typeof morning) => void;
  vi.mocked(startRunSample).mockReturnValue(new Promise((resolve) => (resolveStart = resolve)));
  render(<DriverTodayPage />);

  const start = await screen.findByRole("button", { name: "Start run" });
  fireEvent.click(start);
  fireEvent.click(start);

  expect(start).toBeDisabled();
  expect(startRunSample).toHaveBeenCalledTimes(1);
  expect(startRunSample).toHaveBeenCalledWith(morning.id);

  resolveStart({ ...morning, state: "IN_PROGRESS" });

  expect(await screen.findByRole("button", { name: "End run" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Start run" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Hamra morning run" })).toBeInTheDocument();
  expect(getDriverTodaySample).toHaveBeenCalledTimes(1);
});

it("ends the run and moves on to the next one", async () => {
  const [morning] = DAY.runs;
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  vi.mocked(endRunSample).mockResolvedValue({ ...morning, state: "FINISHED" });
  render(<DriverTodayPage />);

  fireEvent.click(await screen.findByRole("button", { name: "End run" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm end run" }));

  expect(await screen.findByText("Afternoon run")).toBeInTheDocument();
  expect(endRunSample).toHaveBeenCalledWith(morning.id);
  expect(screen.getByRole("button", { name: "Start run" })).toBeEnabled();
  expect(getDriverTodaySample).toHaveBeenCalledTimes(1);
});

it("shows the error next to the button and retries the same action", async () => {
  const [morning] = DAY.runs;
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  vi.mocked(endRunSample)
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({ ...morning, state: "FINISHED" });
  render(<DriverTodayPage />);

  fireEvent.click(await screen.findByRole("button", { name: "End run" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm end run" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Something went wrong. Please try again.",
  );
  // The rest of the page stays: this isn't the full-page load error.
  expect(screen.getByRole("heading", { name: "Hamra morning run" })).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Stops" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Afternoon run")).toBeInTheDocument();
  expect(endRunSample).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("shows the backend's message when the action is refused", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  vi.mocked(endRunSample).mockRejectedValue(new ApiError(409, "This run can't be ended"));
  render(<DriverTodayPage />);

  fireEvent.click(await screen.findByRole("button", { name: "End run" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm end run" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("This run can't be ended");
  expect(screen.getByRole("button", { name: "End run" })).toBeEnabled();
});

it("asks before ending a run with stops left, and ends it only on Confirm", async () => {
  const [morning] = DAY.runs;
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  vi.mocked(endRunSample).mockResolvedValue({ ...morning, state: "FINISHED" });
  render(<DriverTodayPage />);

  fireEvent.click(await screen.findByRole("button", { name: "End run" }));

  // Tarek Mansour (absent, skip) counts as settled; only Dana Fares (next) doesn't.
  expect(screen.getByText("1 stop isn't confirmed yet. End the run anyway?")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm end run" })).toHaveFocus();
  expect(screen.queryByRole("button", { name: "End run" })).not.toBeInTheDocument();
  expect(endRunSample).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.getByRole("button", { name: "End run" })).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Confirm end run" })).not.toBeInTheDocument();
  expect(endRunSample).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "End run" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Confirm end run" }), { key: "Escape" });

  expect(screen.getByRole("button", { name: "End run" })).toHaveFocus();
  expect(endRunSample).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "End run" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm end run" }));

  expect(endRunSample).toHaveBeenCalledTimes(1);
  expect(endRunSample).toHaveBeenCalledWith(morning.id);
  // Focus goes back to the run button, which now starts the afternoon run.
  expect(await screen.findByRole("button", { name: "Start run" })).toHaveFocus();
});

it("ends a run with every stop done straight away, without asking", async () => {
  const [morning, afternoon] = DAY.runs;
  const stops = morning.stops.map((stop) => ({
    ...stop,
    confirmation: stop.confirmation ?? {
      status: "PICKED_UP" as const,
      at: "2026-10-21T04:30:00Z",
    },
  }));
  const allDone = { ...morning, stops };
  vi.mocked(getDriverTodaySample).mockResolvedValue({ ...DAY, runs: [allDone, afternoon] });
  vi.mocked(endRunSample).mockResolvedValue({ ...allDone, state: "FINISHED" });
  render(<DriverTodayPage />);

  fireEvent.click(await screen.findByRole("button", { name: "End run" }));

  expect(screen.queryByRole("button", { name: "Confirm end run" })).not.toBeInTheDocument();
  expect(endRunSample).toHaveBeenCalledTimes(1);
  expect(endRunSample).toHaveBeenCalledWith(morning.id);
  expect(await screen.findByText("Afternoon run")).toBeInTheDocument();
});

function buttonNames(name: string) {
  return within(card(name))
    .queryAllByRole("button")
    .map((button) => button.textContent);
}

// The morning run with one stop's confirmation set, as the server returns it.
function withConfirmation(studentId: string, status: ConfirmationStatus): Run {
  const [morning] = DAY.runs;
  return {
    ...morning,
    stops: morning.stops.map((s) =>
      s.studentId === studentId ? { ...s, confirmation: { status, at: "2026-10-21T05:00:00Z" } } : s,
    ),
  };
}

function stopId(name: string) {
  return DAY.runs[0].stops.find((s) => `${s.firstName} ${s.lastName}` === name)!.studentId;
}

it("offers only the confirmations each stop can still take", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  render(<DriverTodayPage />);
  await screen.findByRole("list", { name: "Stops" });

  expect(buttonNames("Dana Fares")).toEqual(["Picked up", "Not present"]);
  expect(buttonNames("Tarek Mansour")).toEqual(["Picked up", "Not present"]);
  expect(buttonNames("Rami Nasr")).toEqual(["Dropped off"]);
  expect(buttonNames("Salma Khoury")).toEqual(["Picked up"]);
  expect(within(card("Dana Fares")).getByRole("group")).toHaveAccessibleName("Confirm Dana Fares");
});

it("offers no confirmations before the run is started", async () => {
  const [morning, afternoon] = DAY.runs;
  const notStarted = { ...morning, state: "NOT_STARTED" as const, startedAt: null };
  vi.mocked(getDriverTodaySample).mockResolvedValue({ ...DAY, runs: [notStarted, afternoon] });
  render(<DriverTodayPage />);
  await screen.findByRole("button", { name: "Start run" });

  for (const name of ["Dana Fares", "Tarek Mansour", "Rami Nasr", "Salma Khoury"]) {
    expect(buttonNames(name)).toEqual([]);
  }
});

it("confirms a stop, locking only that stop while it saves", async () => {
  const [morning] = DAY.runs;
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  let resolveConfirm!: (run: Run) => void;
  vi.mocked(confirmStudentSample).mockReturnValue(
    new Promise((resolve) => (resolveConfirm = resolve)),
  );
  render(<DriverTodayPage />);
  await screen.findByRole("list", { name: "Stops" });

  const pickedUp = within(card("Dana Fares")).getByRole("button", { name: "Picked up" });
  fireEvent.click(pickedUp);
  fireEvent.click(pickedUp);

  expect(confirmStudentSample).toHaveBeenCalledTimes(1);
  expect(confirmStudentSample).toHaveBeenCalledWith(morning.id, stopId("Dana Fares"), "PICKED_UP");
  expect(within(card("Dana Fares")).getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(within(card("Dana Fares")).getByRole("button", { name: "Not present" })).toBeDisabled();
  expect(within(card("Tarek Mansour")).getByRole("button", { name: "Picked up" })).toBeEnabled();
  expect(within(card("Rami Nasr")).getByRole("button", { name: "Dropped off" })).toBeEnabled();

  resolveConfirm(withConfirmation(stopId("Dana Fares"), "PICKED_UP"));

  expect(await within(card("Dana Fares")).findByText("Done · Picked up")).toBeInTheDocument();
  expect(buttonNames("Dana Fares")).toEqual(["Dropped off"]);
  expect(getDriverTodaySample).toHaveBeenCalledTimes(1);
});

it("activates the button that replaces a confirmed one with Enter or Space, not just a click", async () => {
  const user = userEvent.setup();
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  vi.mocked(confirmStudentSample)
    .mockResolvedValueOnce(withConfirmation(stopId("Dana Fares"), "PICKED_UP"))
    .mockResolvedValueOnce(withConfirmation(stopId("Dana Fares"), "DROPPED_OFF"))
    .mockResolvedValueOnce(withConfirmation(stopId("Tarek Mansour"), "NOT_PRESENT"))
    .mockResolvedValueOnce(withConfirmation(stopId("Tarek Mansour"), "PICKED_UP"));
  render(<DriverTodayPage />);
  await screen.findByRole("list", { name: "Stops" });

  // Picked up (mouse) leaves only Dropped off, and focus moves to it.
  await user.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  const droppedOff = await within(card("Dana Fares")).findByRole("button", { name: "Dropped off" });
  expect(droppedOff).toHaveFocus();

  await user.keyboard("{Enter}");

  expect(confirmStudentSample).toHaveBeenLastCalledWith(
    DAY.runs[0].id,
    stopId("Dana Fares"),
    "DROPPED_OFF",
  );
  expect(await within(card("Dana Fares")).findByText("Done · Dropped off")).toBeInTheDocument();

  // Same story with Space: Not present leaves only Picked up, and Space activates it.
  await user.click(within(card("Tarek Mansour")).getByRole("button", { name: "Not present" }));
  const pickedUp = await within(card("Tarek Mansour")).findByRole("button", { name: "Picked up" });
  expect(pickedUp).toHaveFocus();

  await user.keyboard(" ");

  expect(confirmStudentSample).toHaveBeenLastCalledWith(
    DAY.runs[0].id,
    stopId("Tarek Mansour"),
    "PICKED_UP",
  );
  expect(await within(card("Tarek Mansour")).findByText("Done · Picked up")).toBeInTheDocument();
});

it("shows a failed confirmation on its own stop and retries the same status", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  vi.mocked(confirmStudentSample)
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(withConfirmation(stopId("Dana Fares"), "NOT_PRESENT"));
  render(<DriverTodayPage />);
  await screen.findByRole("list", { name: "Stops" });

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Not present" }));

  expect(await within(card("Dana Fares")).findByRole("alert")).toHaveTextContent(
    "Something went wrong. Please try again.",
  );
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(within(card("Dana Fares")).getByRole("button", { name: "Not present" })).toBeEnabled();
  expect(within(card("Tarek Mansour")).getByRole("button", { name: "Picked up" })).toBeEnabled();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Try again" }));

  expect(await within(card("Dana Fares")).findByText("Done · Not present")).toBeInTheDocument();
  expect(confirmStudentSample).toHaveBeenCalledTimes(2);
  expect(confirmStudentSample).toHaveBeenLastCalledWith(
    DAY.runs[0].id,
    stopId("Dana Fares"),
    "NOT_PRESENT",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps a stop confirmed meanwhile when an older answer arrives later", async () => {
  vi.mocked(getDriverTodaySample).mockResolvedValue(DAY);
  let resolveDana!: (run: Run) => void;
  vi.mocked(confirmStudentSample)
    .mockReturnValueOnce(new Promise((resolve) => (resolveDana = resolve)))
    .mockResolvedValueOnce(withConfirmation(stopId("Tarek Mansour"), "PICKED_UP"));
  render(<DriverTodayPage />);
  await screen.findByRole("list", { name: "Stops" });

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  fireEvent.click(within(card("Tarek Mansour")).getByRole("button", { name: "Picked up" }));
  expect(await within(card("Tarek Mansour")).findByText("Done · Picked up")).toBeInTheDocument();

  // Dana's answer was built before Tarek's confirmation.
  resolveDana(withConfirmation(stopId("Dana Fares"), "PICKED_UP"));

  expect(await within(card("Dana Fares")).findByText("Done · Picked up")).toBeInTheDocument();
  expect(within(card("Tarek Mansour")).getByText("Done · Picked up")).toBeInTheDocument();
});
