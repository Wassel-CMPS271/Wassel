import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiValidationError } from "@/lib/api/errors";
import type { NewStudentWithAddress } from "@/lib/api/students";
import { AddStudentForm } from "./AddStudentForm";

afterEach(() => {
  cleanup();
});

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Add student" }));
  return screen.getByRole("dialog");
}

function fillForm(
  dialog: HTMLElement,
  overrides: Partial<Record<"firstName" | "lastName" | "grade" | "guardianName" | "guardianPhone" | "address", string>> = {},
) {
  const values = {
    firstName: "Lina",
    lastName: "Daher",
    grade: "Grade 4",
    guardianName: "Rami Daher",
    guardianPhone: "+961 3 123 456",
    address: "Hamra Street, Beirut",
    ...overrides,
  };
  fireEvent.change(within(dialog).getByLabelText("First name"), { target: { value: values.firstName } });
  fireEvent.change(within(dialog).getByLabelText("Last name"), { target: { value: values.lastName } });
  fireEvent.change(within(dialog).getByLabelText("Grade"), { target: { value: values.grade } });
  fireEvent.change(within(dialog).getByLabelText("Guardian name"), { target: { value: values.guardianName } });
  fireEvent.change(within(dialog).getByLabelText("Guardian phone"), { target: { value: values.guardianPhone } });
  fireEvent.change(within(dialog).getByLabelText("Pickup address"), { target: { value: values.address } });
}

function submit(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: "Add student" }));
}

it("adds a student with the trimmed form values and closes the dialog", async () => {
  const onAdd = vi.fn<(data: NewStudentWithAddress) => Promise<void>>().mockResolvedValue(undefined);
  render(<AddStudentForm onAdd={onAdd} />);

  const dialog = openForm();
  fillForm(dialog, { firstName: " Lina ", address: " Hamra Street, Beirut " });
  submit(dialog);

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(onAdd).toHaveBeenCalledWith({
    firstName: "Lina",
    lastName: "Daher",
    grade: "Grade 4",
    guardianName: "Rami Daher",
    guardianPhone: "+961 3 123 456",
    address: "Hamra Street, Beirut",
  });
  expect(screen.getByRole("button", { name: "Add student" })).toHaveFocus();
});

it("shows a validation error next to a missing required field, without calling onAdd", () => {
  const onAdd = vi.fn();
  render(<AddStudentForm onAdd={onAdd} />);

  const dialog = openForm();
  fillForm(dialog, { lastName: "" });
  submit(dialog);

  const lastNameInput = within(dialog).getByLabelText("Last name");
  expect(lastNameInput).toHaveAccessibleDescription("Last name is required.");
  expect(lastNameInput).toHaveAttribute("aria-invalid", "true");
  expect(onAdd).not.toHaveBeenCalled();
  expect(dialog).toBeInTheDocument();
});

it("shows a validation error next to the phone field for an invalid format, without calling onAdd", () => {
  const onAdd = vi.fn();
  render(<AddStudentForm onAdd={onAdd} />);

  const dialog = openForm();
  fillForm(dialog, { guardianPhone: "0312345" });
  submit(dialog);

  const phoneInput = within(dialog).getByLabelText("Guardian phone");
  expect(phoneInput).toHaveAccessibleDescription('Use a format like "+961 3 123 456" or "+961 70 234 567".');
  expect(phoneInput).toHaveAttribute("aria-invalid", "true");
  expect(onAdd).not.toHaveBeenCalled();
});

it("shows a duplicate-student 409 next to the guardian phone field, leaving the dialog open", async () => {
  const onAdd = vi.fn().mockRejectedValue(
    new ApiValidationError({
      guardianPhone: "A student named Lina Daher with guardian phone +961 3 123 456 already exists.",
    }),
  );
  render(<AddStudentForm onAdd={onAdd} />);

  const dialog = openForm();
  fillForm(dialog);
  submit(dialog);

  const phoneInput = await within(dialog).findByLabelText("Guardian phone");
  expect(phoneInput).toHaveAccessibleDescription(
    "A student named Lina Daher with guardian phone +961 3 123 456 already exists.",
  );
  expect(phoneInput).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
