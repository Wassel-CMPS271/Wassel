import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSchoolTimes, saveSchoolTimes, type SchoolTimes } from "@/lib/api/schoolTimes";
import { ApiValidationError } from "@/lib/api/errors";
import SchoolTimesPage from "./page";

vi.mock("@/lib/api/schoolTimes", () => ({
  getSchoolTimes: vi.fn(),
  saveSchoolTimes: vi.fn(),
}));

const TIMES: SchoolTimes = { arrivalTime: "07:30", dismissalTime: "14:00" };

beforeEach(() => {
  vi.mocked(getSchoolTimes).mockReset();
  vi.mocked(saveSchoolTimes).mockReset();
});

afterEach(() => {
  cleanup();
});

it("shows a loading status while the times load", () => {
  vi.mocked(getSchoolTimes).mockReturnValue(new Promise(() => {}));
  render(<SchoolTimesPage />);

  expect(screen.getByText("Loading school times…")).toHaveAttribute("role", "status");
  expect(screen.queryByLabelText("Arrival time")).not.toBeInTheDocument();
});

it("shows an error with a retry when the times fail to load", async () => {
  vi.mocked(getSchoolTimes)
    .mockRejectedValueOnce(new Error("down"))
    .mockResolvedValueOnce(TIMES);
  render(<SchoolTimesPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't load the school times. Please try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByLabelText("Arrival time")).toHaveValue("07:30");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getSchoolTimes).toHaveBeenCalledTimes(2);
});

it("saves the arrival and dismissal times and confirms it", async () => {
  vi.mocked(getSchoolTimes).mockResolvedValue({ arrivalTime: null, dismissalTime: null });
  vi.mocked(saveSchoolTimes).mockResolvedValue(TIMES);
  render(<SchoolTimesPage />);
  await screen.findByText("No times are set yet. Choose both below and save.");

  fireEvent.change(screen.getByLabelText("Arrival time"), { target: { value: "07:30" } });
  fireEvent.change(screen.getByLabelText("Dismissal time"), { target: { value: "14:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save times" }));

  const toast = await screen.findByText("School times saved.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
  expect(saveSchoolTimes).toHaveBeenCalledWith({ arrivalTime: "07:30", dismissalTime: "14:00" });
  expect(screen.queryByText("No times are set yet. Choose both below and save.")).not.toBeInTheDocument();
});

// The backend's only rule today (dismissal after arrival) is also checked by
// the form, so it can't be reached from the page. Dismissal stays after
// arrival here so the form's own check passes, and the message stands in for
// any field error the backend sends: it can only have come from saveSchoolTimes.
it("shows a backend validation error next to the dismissal field", async () => {
  vi.mocked(getSchoolTimes).mockResolvedValue(TIMES);
  vi.mocked(saveSchoolTimes).mockRejectedValue(
    new ApiValidationError({ dismissalTime: "Dismissal time must be at least 30 minutes after arrival time." }),
  );
  render(<SchoolTimesPage />);
  await screen.findByLabelText("Arrival time");

  fireEvent.change(screen.getByLabelText("Dismissal time"), { target: { value: "07:45" } });
  fireEvent.click(screen.getByRole("button", { name: "Save times" }));

  const dismissalInput = screen.getByLabelText("Dismissal time");
  await waitFor(() =>
    expect(dismissalInput).toHaveAccessibleDescription(
      "Dismissal time must be at least 30 minutes after arrival time.",
    ),
  );
  expect(dismissalInput).toHaveValue("07:45");
  expect(screen.queryByText("School times saved.")).not.toBeInTheDocument();
  expect(dismissalInput).toHaveAttribute("aria-invalid", "true");
});
