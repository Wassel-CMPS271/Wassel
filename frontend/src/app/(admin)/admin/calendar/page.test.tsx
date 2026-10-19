import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addHoliday, getHolidays, type Holiday } from "@/lib/api/holidays";
import { addHalfDay, getHalfDays, type HalfDay } from "@/lib/api/halfDays";
import { ApiValidationError } from "@/lib/api/errors";
import HolidayCalendarPage from "./page";

vi.mock("@/lib/api/holidays", () => ({
  getHolidays: vi.fn(),
  addHoliday: vi.fn(),
}));

vi.mock("@/lib/api/halfDays", () => ({
  getHalfDays: vi.fn(),
  addHalfDay: vi.fn(),
}));

const HOLIDAY: Holiday = { id: "h-1", date: "2026-12-25", name: "Christmas" };
const HALF_DAY: HalfDay = { id: "d-1", date: "2026-12-24" };
// calendarDateParts formats "2026-12-24" as this in en-GB, UTC.
const HALF_DAY_FULL_DATE = "Thursday, 24 December 2026";

function holidayForm() {
  return screen.getByRole("heading", { name: "Add holiday" }).closest("form")!;
}

function halfDayForm() {
  return screen.getByRole("heading", { name: "Mark half-day" }).closest("form")!;
}

beforeEach(() => {
  vi.mocked(getHolidays).mockReset();
  vi.mocked(addHoliday).mockReset();
  vi.mocked(getHalfDays).mockReset().mockResolvedValue([]);
  vi.mocked(addHalfDay).mockReset();
});

afterEach(() => {
  cleanup();
});

it("shows a loading status while the holidays load", () => {
  vi.mocked(getHolidays).mockReturnValue(new Promise(() => {}));
  render(<HolidayCalendarPage />);

  expect(screen.getByText("Loading holidays…")).toHaveAttribute("role", "status");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows an error with a retry when the holidays fail to load", async () => {
  vi.mocked(getHolidays).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([HOLIDAY]);
  render(<HolidayCalendarPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't load the holidays. Please try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Christmas")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getHolidays).toHaveBeenCalledTimes(2);
});

it("shows an error with a retry when the half-days fail to load", async () => {
  vi.mocked(getHolidays).mockResolvedValue([]);
  vi.mocked(getHalfDays).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([HALF_DAY]);
  render(<HolidayCalendarPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't load the half-days. Please try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText(HALF_DAY_FULL_DATE)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getHalfDays).toHaveBeenCalledTimes(2);
});

it("adds a holiday to the list, resets the form and confirms it", async () => {
  vi.mocked(getHolidays).mockResolvedValue([]);
  vi.mocked(addHoliday).mockResolvedValue(HOLIDAY);
  render(<HolidayCalendarPage />);
  await screen.findByText("No holidays yet");

  const form = holidayForm();
  fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-12-25" } });
  fireEvent.change(within(form).getByLabelText("Holiday name"), { target: { value: "Christmas" } });
  fireEvent.click(within(form).getByRole("button", { name: "Add holiday" }));

  expect(await screen.findByText("Christmas")).toBeInTheDocument();
  expect(addHoliday).toHaveBeenCalledWith({ date: "2026-12-25", name: "Christmas" });
  expect(within(form).getByLabelText("Holiday name")).toHaveValue("");
  const toast = await screen.findByText("Christmas added to the calendar.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

it("shows a backend validation error next to the holiday date field", async () => {
  vi.mocked(getHolidays).mockResolvedValue([]);
  vi.mocked(addHoliday).mockRejectedValue(
    new ApiValidationError({ date: "A holiday is already set for that date." }),
  );
  render(<HolidayCalendarPage />);
  await screen.findByText("No holidays yet");

  const form = holidayForm();
  fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-12-25" } });
  fireEvent.change(within(form).getByLabelText("Holiday name"), { target: { value: "Christmas" } });
  fireEvent.click(within(form).getByRole("button", { name: "Add holiday" }));

  const dateInput = within(form).getByLabelText("Date");
  await waitFor(() => expect(dateInput).toHaveAccessibleDescription("A holiday is already set for that date."));
  expect(dateInput).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("No holidays yet")).toBeInTheDocument();
});

// NOT BUILT (SCRUM-223): the calendar has no way to delete a holiday.
// The backend endpoint exists (DELETE /api/admin/school-calendar/holidays/{id},
// SCRUM-214, PR #62), but holidays.ts has no delete call and HolidayListItem
// has no Delete control, so the missing piece is the frontend. (Half-days
// can't be deleted either, but there the backend has no endpoint.)
it.skip("deletes a holiday after confirming, and announces it", async () => {
  vi.mocked(getHolidays).mockResolvedValue([HOLIDAY]);
  render(<HolidayCalendarPage />);
  await screen.findByText("Christmas");

  fireEvent.click(screen.getByRole("button", { name: "Delete Christmas" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete Christmas" }));

  await waitFor(() => expect(screen.queryByText("Christmas")).not.toBeInTheDocument());
  expect(await screen.findByText("No holidays yet")).toBeInTheDocument();
});

it("adds a half-day to the list, resets the form and confirms it", async () => {
  vi.mocked(getHolidays).mockResolvedValue([]);
  vi.mocked(addHalfDay).mockResolvedValue(HALF_DAY);
  render(<HolidayCalendarPage />);
  await screen.findByText("No half-days yet");

  const form = halfDayForm();
  fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-12-24" } });
  fireEvent.click(within(form).getByRole("button", { name: "Mark half-day" }));

  expect(await screen.findByText(HALF_DAY_FULL_DATE)).toBeInTheDocument();
  expect(addHalfDay).toHaveBeenCalledWith({ date: "2026-12-24" });
  expect(within(form).getByLabelText("Date")).toHaveValue("");
  const toast = await screen.findByText("Half-day added to the calendar.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

it("shows a backend validation error next to the half-day date field", async () => {
  vi.mocked(getHolidays).mockResolvedValue([]);
  vi.mocked(addHalfDay).mockRejectedValue(
    new ApiValidationError({ date: "That date is a holiday, so it can't also be a half-day." }),
  );
  render(<HolidayCalendarPage />);
  await screen.findByText("No half-days yet");

  const form = halfDayForm();
  fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-12-25" } });
  fireEvent.click(within(form).getByRole("button", { name: "Mark half-day" }));

  const dateInput = within(form).getByLabelText("Date");
  await waitFor(() =>
    expect(dateInput).toHaveAccessibleDescription("That date is a holiday, so it can't also be a half-day."),
  );
  expect(dateInput).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("No half-days yet")).toBeInTheDocument();
});
