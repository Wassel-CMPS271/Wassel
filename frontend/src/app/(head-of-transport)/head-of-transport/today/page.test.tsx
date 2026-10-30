import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAbsentStudents, getRunsDay } from "@/lib/api/runsSample";
import type { AbsentStudent, RunsDay } from "@/lib/api/runs";
import runsSample from "@/lib/api/__fixtures__/runs/hot-runs.json";
import absencesSample from "@/lib/api/__fixtures__/runs/hot-absences.json";
import TodayPage from "./page";

vi.mock("@/lib/api/runsSample", () => ({
  getRunsDay: vi.fn(),
  getAbsentStudents: vi.fn(),
}));

const RUNS = runsSample as RunsDay;
const ABSENT = absencesSample as AbsentStudent[];
const SAMPLE_DATE = "Thursday 22 October 2026 · Half day";

beforeEach(() => {
  vi.mocked(getRunsDay).mockReset().mockResolvedValue(RUNS);
  vi.mocked(getAbsentStudents).mockReset().mockResolvedValue(ABSENT);
});

afterEach(() => {
  cleanup();
});

function rowFor(routeName: string, run: "Morning" | "Afternoon") {
  const row = screen
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByText(routeName) && within(candidate).queryByText(run));
  if (!row) throw new Error(`no row for ${routeName} ${run}`);
  return row;
}

it("shows a loading status first", () => {
  vi.mocked(getRunsDay).mockReturnValue(new Promise(() => {}));
  vi.mocked(getAbsentStudents).mockReturnValue(new Promise(() => {}));
  render(<TodayPage />);

  expect(screen.getByRole("status")).toHaveTextContent("Loading today's runs");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("shows the date, and marks a half day", async () => {
  render(<TodayPage />);

  expect(await screen.findByText(SAMPLE_DATE)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
});

it("lists every run with route, driver, morning or afternoon, state and progress", async () => {
  render(<TodayPage />);
  await screen.findByText(SAMPLE_DATE);

  const table = screen.getByRole("table", { name: "Runs for the day" });
  expect(within(table).getAllByRole("row")).toHaveLength(RUNS.runs.length + 1);
  for (const run of RUNS.runs) {
    expect(within(table).getAllByText(run.route.name).length).toBeGreaterThan(0);
  }

  // A finished morning run: 3 of the 3 students who are not absent were picked up (1 absent).
  const morning = rowFor("Hamra morning run", "Morning");
  expect(within(morning).getByText("Karim Haddad")).toBeInTheDocument();
  expect(within(morning).getByText("Finished")).toBeInTheDocument();
  expect(within(morning).getByText("3 of 3 picked up")).toBeInTheDocument();
  expect(within(morning).getByText(", 1 absent")).toBeInTheDocument();
});

it("measures an afternoon run by students dropped off, not picked up", async () => {
  render(<TodayPage />);
  await screen.findByText(SAMPLE_DATE);

  const afternoon = RUNS.runs.find((run) => run.direction === "AFTERNOON" && run.state === "IN_PROGRESS");
  if (!afternoon) throw new Error("the sample has no afternoon run in progress");
  const total = afternoon.counts.students - afternoon.counts.absent;
  const row = rowFor(afternoon.route.name, "Afternoon");

  expect(within(row).getByText("In progress")).toBeInTheDocument();
  expect(within(row).getByText(`${afternoon.counts.droppedOff} of ${total} dropped off`)).toBeInTheDocument();
});

it("shows all three states", async () => {
  render(<TodayPage />);
  await screen.findByText(SAMPLE_DATE);

  expect(screen.getAllByText("Not started").length).toBeGreaterThan(0);
  expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Finished").length).toBeGreaterThan(0);
});

it("lists the absent students with their route and stop, and says when one has no route", async () => {
  render(<TodayPage />);
  await screen.findByText(SAMPLE_DATE);

  const table = screen.getByRole("table", { name: "Students absent for the day" });
  const tarek = within(table).getByText("Tarek Mansour").closest("tr") as HTMLElement;
  expect(within(tarek).getByText("Hamra morning run")).toBeInTheDocument();
  expect(within(tarek).getByText("Stop 3")).toBeInTheDocument();

  const layla = within(table).getByText("Layla Mansour").closest("tr") as HTMLElement;
  expect(within(layla).getByText("No route")).toBeInTheDocument();
  expect(within(layla).getByText("None")).toBeInTheDocument();
});

it("shows a clear message on a holiday instead of an empty table", async () => {
  vi.mocked(getRunsDay).mockResolvedValue({ date: "2026-10-24", dayType: "HOLIDAY", runs: [] });
  vi.mocked(getAbsentStudents).mockResolvedValue([]);
  render(<TodayPage />);

  expect(await screen.findByText("No runs today. The school is closed (a holiday or the weekend).")).toBeInTheDocument();
  expect(screen.getByText("Saturday 24 October 2026")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByText("No students are absent today.")).toBeInTheDocument();
});

it("says so when a school day has no runs yet", async () => {
  vi.mocked(getRunsDay).mockResolvedValue({ date: "2026-10-22", dayType: "SCHOOL_DAY", runs: [] });
  render(<TodayPage />);

  expect(await screen.findByText("No runs have been created for today yet.")).toBeInTheDocument();
});

it("reloads both lists when Refresh is pressed, and disables the button while it loads", async () => {
  render(<TodayPage />);
  await screen.findByText(SAMPLE_DATE);
  expect(getRunsDay).toHaveBeenCalledTimes(1);

  vi.mocked(getRunsDay).mockResolvedValue({ ...RUNS, runs: [RUNS.runs[0]] });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  expect(screen.getByRole("button", { name: "Refreshing..." })).toBeDisabled();
  await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2 + ABSENT.length + 1));
  expect(getRunsDay).toHaveBeenCalledTimes(2);
  expect(getAbsentStudents).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
});

it("shows an error when loading fails, and Refresh tries again", async () => {
  vi.mocked(getRunsDay).mockRejectedValueOnce(new Error("offline"));
  render(<TodayPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load today's runs. Please try again.");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  expect(await screen.findByText(SAMPLE_DATE)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
