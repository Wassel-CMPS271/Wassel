import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ImportRowResult, NewStudent } from "@/lib/api/students";
import { ImportStudentsForm } from "./ImportStudentsForm";

afterEach(() => {
  cleanup();
});

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
  return screen.getByRole("dialog");
}

function selectFile(dialog: HTMLElement, content: string, filename = "students.csv") {
  const file = new File([content], filename, { type: "text/csv" });
  const input = within(dialog).getByLabelText("CSV file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

const VALID_CSV =
  "firstName,lastName,grade,guardianName,guardianPhone\n" +
  "Lina,Daher,Grade 4,Rami Daher,+961 3 123 456\n" +
  "Hadi,Bou Saab,Grade 5,Lina Bou Saab,+961 70 333 222\n";

it("previews a valid file's rows and imports them, showing the result and letting the user close", async () => {
  const lina: NewStudent = {
    firstName: "Lina", lastName: "Daher", grade: "Grade 4", guardianName: "Rami Daher", guardianPhone: "+961 3 123 456",
  };
  const hadi: NewStudent = {
    firstName: "Hadi", lastName: "Bou Saab", grade: "Grade 5", guardianName: "Lina Bou Saab", guardianPhone: "+961 70 333 222",
  };
  const results: ImportRowResult[] = [
    { status: "success", row: lina, student: { id: "st-1", ...lina, status: "active", address: null, latitude: null, longitude: null, route: null, parentUserId: null, createdAt: "" } },
    { status: "success", row: hadi, student: { id: "st-2", ...hadi, status: "active", address: null, latitude: null, longitude: null, route: null, parentUserId: null, createdAt: "" } },
  ];
  const onImport = vi.fn<(rows: NewStudent[]) => Promise<ImportRowResult[]>>().mockResolvedValue(results);
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(dialog, VALID_CSV);

  expect(await within(dialog).findByText("Preview: students.csv")).toBeInTheDocument();
  expect(within(dialog).getByText("2 rows found — 2 valid, 0 invalid (skipped).")).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 students" }));
  expect(onImport).toHaveBeenCalledWith([lina, hadi]);

  expect(await within(dialog).findByText("Import complete")).toBeInTheDocument();
  expect(within(dialog).getByText("2 students added.")).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("shows per-row errors after importing, grouped by reason", async () => {
  const lina: NewStudent = {
    firstName: "Lina", lastName: "Daher", grade: "Grade 4", guardianName: "Rami Daher", guardianPhone: "+961 3 123 456",
  };
  const hadi: NewStudent = {
    firstName: "Hadi", lastName: "Bou Saab", grade: "Grade 5", guardianName: "Lina Bou Saab", guardianPhone: "+961 70 333 222",
  };
  const results: ImportRowResult[] = [
    { status: "success", row: lina, student: { id: "st-1", ...lina, status: "active", address: null, latitude: null, longitude: null, route: null, parentUserId: null, createdAt: "" } },
    { status: "error", row: hadi, reason: "duplicate_existing", message: "A student named Hadi Bou Saab with guardian phone +961 70 333 222 already exists." },
  ];
  const onImport = vi.fn<(rows: NewStudent[]) => Promise<ImportRowResult[]>>().mockResolvedValue(results);
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(dialog, VALID_CSV);
  await within(dialog).findByText("Preview: students.csv");
  fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 students" }));

  await within(dialog).findByText("Import complete");
  expect(within(dialog).getByText("1 student added.")).toBeInTheDocument();
  expect(within(dialog).getByText("1 already in the roster")).toBeInTheDocument();
  expect(
    within(dialog).getByText(
      "Hadi Bou Saab — A student named Hadi Bou Saab with guardian phone +961 70 333 222 already exists.",
    ),
  ).toBeInTheDocument();
});

it("shows a header error for an empty file, without calling onImport", async () => {
  const onImport = vi.fn();
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(dialog, "");

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("The file is empty.");
  expect(within(dialog).queryByText(/^Preview:/)).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});

it("shows a header error for a file missing a required column, without calling onImport", async () => {
  const onImport = vi.fn();
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(dialog, "firstName,lastName,grade,guardianName\nLina,Daher,Grade 4,Rami Daher\n");

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Missing required column: Guardian phone.");
  expect(onImport).not.toHaveBeenCalled();
});

it("flags a row with missing fields as invalid in the preview, without blocking the valid rows", async () => {
  const onImport = vi.fn<(rows: NewStudent[]) => Promise<ImportRowResult[]>>().mockResolvedValue([]);
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(
    dialog,
    "firstName,lastName,grade,guardianName,guardianPhone\n" +
      ",Daher,Grade 4,Rami Daher,+961 3 123 456\n" +
      "Hadi,Bou Saab,Grade 5,Lina Bou Saab,+961 70 333 222\n",
  );

  await within(dialog).findByText("Preview: students.csv");
  expect(within(dialog).getByText("2 rows found — 1 valid, 1 invalid (skipped).")).toBeInTheDocument();
  expect(within(dialog).getByText(/Invalid: Missing First name/)).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Import 1 student" }));
  expect(onImport).toHaveBeenCalledWith([
    { firstName: "Hadi", lastName: "Bou Saab", grade: "Grade 5", guardianName: "Lina Bou Saab", guardianPhone: "+961 70 333 222" },
  ]);
});
