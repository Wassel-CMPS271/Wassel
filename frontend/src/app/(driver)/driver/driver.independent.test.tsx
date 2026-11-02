import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { ConfirmationStatus, Run } from "@/lib/api/runs";
import { confirmStudentSample, endRunSample, getDriverTodaySample, startRunSample } from "@/lib/api/runs.sample";
import { day, deferred, instant, run, student } from "@/test-support/driverContract";
import DriverTodayPage from "./page";
import { RunAction } from "./RunAction";

// Temporary boundary only: the features still import runs.sample at the reviewed
// heads. These tests do not exercise or reproduce that client's implementation.
// The separate delivery-gate suite requires the final screen to use real HTTP.
vi.mock("@/lib/api/runs.sample", () => ({
  getDriverTodaySample: vi.fn(), startRunSample: vi.fn(),
  endRunSample: vi.fn(), confirmStudentSample: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

async function show(value = day()) {
  vi.mocked(getDriverTodaySample).mockResolvedValue(value);
  render(<DriverTodayPage />);
  await screen.findByRole("heading", { name: value.runs.find(r => r.state !== "FINISHED")?.route.name ?? /all runs done|no route today|no school today/i });
  // Motion cards start at opacity 0. Keep real visibility assertions and wait
  // for their entrance, rather than mistaking that transient state for a bug.
  await waitFor(() => { for (const item of screen.queryAllByRole("listitem")) expect(item).toBeVisible(); });
}

function row(position = 1) {
  const item = screen.getByText(`Student${position} Independent`).closest("li");
  if (!item) throw new Error("Student must be in an ordered stop row");
  return item;
}

describe("SCRUM-243: Today from acceptance criteria", () => {
  it("announces loading without displaying stop data", () => {
    vi.mocked(getDriverTodaySample).mockReturnValue(new Promise(() => {}));
    render(<DriverTodayPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.queryByRole("list", { name: "Stops" })).not.toBeInTheDocument();
  });

  it.each(["SCHOOL_DAY", "HALF_DAY"] as const)("shows no route on %s, without action buttons", async dayType => {
    await show(day([], { dayType }));
    expect(screen.getByRole("heading", { name: /no route today/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /start run|end run/i })).not.toBeInTheDocument();
  });

  it("distinguishes a holiday from an unassigned driver", async () => {
    await show(day([], { dayType: "HOLIDAY" }));
    expect(screen.getByRole("heading", { name: /no school today/i })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /no route today/i })).not.toBeInTheDocument();
  });

  it("selects the first unfinished run and shows only its ordered students", async () => {
    const finished = run({ state: "FINISHED", endedAt: instant });
    const afternoon = run({ id: "50000000-0000-4000-8000-000000000002", direction: "AFTERNOON", state: "NOT_STARTED", stops: [student(3), student(2), student(1)] });
    await show(day([finished, afternoon]));
    expect(screen.getByText("Afternoon run")).toBeVisible();
    const rows = within(screen.getByRole("list", { name: "Stops" })).getAllByRole("listitem");
    expect(rows.map(r => within(r).getByText(/Student\d Independent/).textContent)).toEqual(["Student3 Independent", "Student2 Independent", "Student1 Independent"]);
    expect(screen.getByText("TEST 250")).toBeVisible();
    expect(screen.getByText("Test Driver")).toBeVisible();
  });

  it("shows completion with no remaining start or confirmation buttons", async () => {
    await show(day([run({ state: "FINISHED", endedAt: instant })]));
    expect(screen.getByRole("heading", { name: /all runs done/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /start run|end run|picked up|dropped off|not present/i })).not.toBeInTheDocument();
  });

  it("marks done and absent rows and highlights the first eligible stop", async () => {
    await show(day([run({ stops: [student(1, { confirmation: { status: "PICKED_UP", at: instant } }), student(2, { absent: true }), student(3), student(4)] })]));
    expect(within(row(1)).getByText(/done.*picked up/i)).toBeVisible();
    expect(within(row(2)).getByText("Absent")).toBeVisible();
    expect(within(row(2)).getByText("Skip")).toBeVisible();
    expect(row(3)).toHaveAttribute("aria-current", "step");
    expect(within(row(3)).getByText("Next stop")).toBeVisible();
    expect(row(4)).not.toHaveAttribute("aria-current");
  });

  it("does not skip an absent student who has a confirmation", async () => {
    await show(day([run({ stops: [student(1, { absent: true, confirmation: { status: "NOT_PRESENT", at: instant } }), student(2)] })]));
    expect(within(row()).queryByText("Skip")).not.toBeInTheDocument();
    expect(within(row()).getByText(/done.*not present/i)).toBeVisible();
    expect(row(2)).toHaveAttribute("aria-current", "step");
  });

  it("skips an all-absent roster including siblings at the same address", async () => {
    const stops = [student(1, { absent: true, address: "Shared address" }), student(2, { absent: true, address: "Shared address" })];
    await show(day([run({ stops, counts: { students: 2, absent: 2, pickedUp: 0, droppedOff: 0, notPresent: 0 } })]));
    expect(screen.getAllByText("Skip")).toHaveLength(2);
    expect(screen.queryByText("Next stop")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/every stop.*done or skipped/i);
  });

  it("does not consider an afternoon pickup completed until dropoff", async () => {
    await show(day([run({ direction: "AFTERNOON", stops: [student(1, { confirmation: { status: "PICKED_UP", at: instant } }), student(2, { confirmation: { status: "DROPPED_OFF", at: instant } })] })]));
    expect(row()).toHaveAttribute("aria-current", "step");
    expect(within(row()).queryByText(/done/i)).not.toBeInTheDocument();
    expect(within(row(2)).getByText(/done.*dropped off/i)).toBeVisible();
  });

  it("shows a load failure in plain words and retries successfully", async () => {
    vi.mocked(getDriverTodaySample).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(day());
    render(<DriverTodayPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByText("Student1 Independent");
    expect(getDriverTodaySample).toHaveBeenCalledTimes(2);
  });
});

describe("SCRUM-244: legal actions and observable state changes", () => {
  it.each(["NOT_STARTED", "IN_PROGRESS", "FINISHED"] as const)("offers only permitted run actions in %s", state => {
    render(<RunAction run={run({ state })} onRunChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Start run" }) !== null).toBe(state === "NOT_STARTED");
    expect(screen.queryByRole("button", { name: "End run" }) !== null).toBe(state === "IN_PROGRESS");
  });

  it.each(["NOT_STARTED", "FINISHED"] as const)("hides student actions in %s", async state => {
    await show(day([run({ state })]));
    for (const label of ["Picked up", "Dropped off", "Not present"]) expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  });

  it.each([
    [null, ["Picked up", "Not present"]],
    ["NOT_PRESENT", ["Picked up"]],
    ["PICKED_UP", ["Dropped off"]],
    ["DROPPED_OFF", []],
  ] as [ConfirmationStatus | null, string[]][])("offers exactly the legal transitions from %s", async (status, labels) => {
    await show(day([run({ stops: [student(1, { confirmation: status ? { status, at: instant } : null })] })]));
    expect(within(row()).queryAllByRole("button").map(b => b.textContent)).toEqual(labels);
  });

  it("allows a late-arriving absent child to be picked up", async () => {
    await show(day([run({ stops: [student(1, { absent: true })] })]));
    expect(within(row()).getByRole("button", { name: "Picked up" })).toBeEnabled();
  });

  it("starts then confirms pickup, dropoff and ends without reloading the day", async () => {
    const initial = run({ state: "NOT_STARTED", startedAt: null });
    const started = run();
    const picked = run({ stops: [student(1, { confirmation: { status: "PICKED_UP", at: instant } })], counts: { students: 1, absent: 0, pickedUp: 1, droppedOff: 0, notPresent: 0 } });
    const dropped = run({ stops: [student(1, { confirmation: { status: "DROPPED_OFF", at: instant } })], counts: { students: 1, absent: 0, pickedUp: 1, droppedOff: 1, notPresent: 0 } });
    vi.mocked(startRunSample).mockResolvedValue(started);
    vi.mocked(confirmStudentSample).mockResolvedValueOnce(picked).mockResolvedValueOnce(dropped);
    vi.mocked(endRunSample).mockResolvedValue({ ...dropped, state: "FINISHED", endedAt: instant });
    await show(day([initial]));
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    await screen.findByRole("button", { name: "End run" });
    fireEvent.click(within(row()).getByRole("button", { name: "Picked up" }));
    await screen.findByText(/done.*picked up/i);
    fireEvent.click(within(row()).getByRole("button", { name: "Dropped off" }));
    await screen.findByText(/done.*dropped off/i);
    fireEvent.click(screen.getByRole("button", { name: "End run" }));
    await screen.findByRole("heading", { name: /all runs done/i });
    expect(getDriverTodaySample).toHaveBeenCalledTimes(1);
    expect(confirmStudentSample).toHaveBeenNthCalledWith(1, initial.id, initial.stops[0].studentId, "PICKED_UP");
    expect(confirmStudentSample).toHaveBeenNthCalledWith(2, initial.id, initial.stops[0].studentId, "DROPPED_OFF");
  });

  it("marks Not present and advances to the next student without a reload", async () => {
    const updated = run({ stops: [student(1, { confirmation: { status: "NOT_PRESENT", at: instant } }), student(2)] });
    vi.mocked(confirmStudentSample).mockResolvedValue(updated);
    await show(day([run({ stops: [student(1), student(2)] })]));
    fireEvent.click(within(row()).getByRole("button", { name: "Not present" }));
    await screen.findByText(/done.*not present/i);
    expect(row(2)).toHaveAttribute("aria-current", "step");
    expect(getDriverTodaySample).toHaveBeenCalledTimes(1);
  });

  it.each(["start", "end"] as const)("prevents double-submit of %s and updates after completion", async action => {
    const gate = deferred<Run>();
    const call = action === "start" ? startRunSample : endRunSample;
    vi.mocked(call).mockReturnValue(gate.promise);
    const onChange = vi.fn();
    render(<RunAction run={run({ state: action === "start" ? "NOT_STARTED" : "IN_PROGRESS", stops: [] })} onRunChange={onChange} />);
    const button = screen.getByRole("button", { name: action === "start" ? "Start run" : "End run" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(call).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    const updated = run({ state: action === "start" ? "IN_PROGRESS" : "FINISHED" });
    await act(async () => gate.resolve(updated));
    expect(onChange).toHaveBeenCalledWith(updated);
  });

  it("prevents duplicate confirmations while leaving other students actionable", async () => {
    const gate = deferred<Run>();
    vi.mocked(confirmStudentSample).mockReturnValue(gate.promise);
    await show(day([run({ stops: [student(1), student(2)] })]));
    const button = within(row()).getByRole("button", { name: "Picked up" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(confirmStudentSample).toHaveBeenCalledTimes(1);
    expect(within(row()).getByRole("button", { name: "Not present" })).toBeDisabled();
    expect(within(row(2)).getByRole("button", { name: "Picked up" })).toBeEnabled();
    await act(async () => gate.resolve(run({ stops: [student(1, { confirmation: { status: "PICKED_UP", at: instant } }), student(2)] })));
  });

  it.each(["start", "end"] as const)("shows a failed %s action and permits an explicit retry", async action => {
    const call = action === "start" ? startRunSample : endRunSample;
    const updated = run({ state: action === "start" ? "IN_PROGRESS" : "FINISHED" });
    vi.mocked(call).mockRejectedValueOnce(new ApiError(503, "internal details")).mockResolvedValueOnce(updated);
    const onChange = vi.fn();
    render(<RunAction run={run({ state: action === "start" ? "NOT_STARTED" : "IN_PROGRESS", stops: [] })} onRunChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: action === "start" ? "Start run" : "End run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong.*try again/i);
    expect(screen.queryByText("internal details")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => {});
    expect(call).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith(updated);
  });

  it("keeps a failed confirmation scoped to its student and retries the same status", async () => {
    const updated = run({ stops: [student(1, { confirmation: { status: "NOT_PRESENT", at: instant } }), student(2)] });
    vi.mocked(confirmStudentSample).mockRejectedValueOnce(new ApiError(409, "This student is no longer on the run")).mockResolvedValueOnce(updated);
    await show(day([run({ stops: [student(1), student(2)] })]));
    fireEvent.click(within(row()).getByRole("button", { name: "Not present" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This student is no longer on the run");
    expect(within(row(2)).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(within(row()).getByRole("button", { name: "Try again" }));
    await screen.findByText(/done.*not present/i);
    expect(vi.mocked(confirmStudentSample).mock.calls[1]).toEqual(vi.mocked(confirmStudentSample).mock.calls[0]);
  });

  it("warns before ending with outstanding stops, supports Cancel and keyboard Escape", async () => {
    render(<RunAction run={run()} onRunChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "End run" }));
    expect(screen.getByRole("button", { name: "Confirm end run" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(endRunSample).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "End run" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Confirm end run" }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "End run" })).toHaveFocus();
  });

  it("does not warn just because all remaining stops are absent", async () => {
    vi.mocked(endRunSample).mockResolvedValue(run({ state: "FINISHED" }));
    render(<RunAction run={run({ stops: [student(1, { absent: true })], counts: { students: 1, absent: 1, pickedUp: 0, droppedOff: 0, notPresent: 0 } })} onRunChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "End run" }));
    expect(screen.queryByRole("button", { name: "Confirm end run" })).not.toBeInTheDocument();
    await act(async () => {});
    expect(endRunSample).toHaveBeenCalledTimes(1);
  });

  it("warns before ending a morning run while children are still on the bus", () => {
    vi.mocked(endRunSample).mockReturnValue(new Promise(() => {}));
    render(<RunAction run={run({ stops: [student(1, { confirmation: { status: "PICKED_UP", at: instant } })], counts: { students: 1, absent: 0, pickedUp: 1, droppedOff: 0, notPresent: 0 } })} onRunChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "End run" }));
    expect(endRunSample, "The contract requires a warning before ending with children onboard").not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm end run" })).toBeVisible();
  });

  it("gives every run and student action at least a 44px touch height", async () => {
    await show();
    for (const button of screen.getAllByRole("button")) expect(Number.parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(44);
  });

  it("keeps run actions operable at a 360px viewport with long route text", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    try {
      const longName = "Independent route with a deliberately long school and neighborhood name";
      const initial = run({ state: "NOT_STARTED", route: { ...run().route, name: longName } });
      vi.mocked(startRunSample).mockResolvedValue(run({ route: initial.route }));
      await show(day([initial]));
      expect(screen.getByRole("heading", { name: longName })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Start run" }));
      expect(await screen.findByRole("button", { name: "End run" })).toBeEnabled();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
    // jsdom cannot measure wrapping or overflow: the report separately records
    // the actual 360px Chromium layout check, and does not claim this does so.
  });

  it("preserves two successful confirmations returned in reverse request order", async () => {
    const first = deferred<Run>(); const second = deferred<Run>();
    vi.mocked(confirmStudentSample).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await show(day([run({ stops: [student(1), student(2)] })]));
    fireEvent.click(within(row()).getByRole("button", { name: "Picked up" }));
    fireEvent.click(within(row(2)).getByRole("button", { name: "Not present" }));
    await act(async () => second.resolve(run({ stops: [student(1), student(2, { confirmation: { status: "NOT_PRESENT", at: instant } })] })));
    await act(async () => first.resolve(run({ stops: [student(1, { confirmation: { status: "PICKED_UP", at: instant } }), student(2)] })));
    expect(within(row()).getByText(/done.*picked up/i)).toBeVisible();
    expect(within(row(2)).getByText(/done.*not present/i)).toBeVisible();
  });
});
