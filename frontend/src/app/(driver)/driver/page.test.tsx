import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DriverDay } from "@/lib/api/runs";
import { getDriverTodaySample } from "@/lib/api/runs.sample";
import sample from "../../../../../docs/contracts/samples/runs/driver-today.json";
import DriverTodayPage from "./page";

vi.mock("@/lib/api/runs.sample", () => ({
  getDriverTodaySample: vi.fn(),
}));

const DAY = sample as unknown as DriverDay;

beforeEach(() => {
  vi.mocked(getDriverTodaySample).mockReset();
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
