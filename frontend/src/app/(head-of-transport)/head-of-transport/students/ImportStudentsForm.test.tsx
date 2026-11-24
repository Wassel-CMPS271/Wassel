import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { importStudents, type ImportRow, type StudentImport } from "@/lib/api/students";
import { ImportStudentsForm } from "./ImportStudentsForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HEADER = "firstName,lastName,grade,guardianName,guardianPhone";
const STUDENTS_URL = "http://localhost:8080/api/head-of-transport/students";

// One answer per POST, in order: "created" echoes the body back as a Student,
// an Error is a network failure.
type Answer = "created" | { status: number; body?: unknown } | Error;

function stubBackend(answers: Answer[]) {
  let calls = 0;
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const answer = answers[calls++];
    if (answer === undefined) throw new Error("more requests than answers");
    if (answer instanceof Error) throw answer;
    if (answer === "created") {
      const body = JSON.parse(init.body as string);
      const student = {
        id: `st-${calls}`, ...body, status: "active", address: null, latitude: null, longitude: null,
        route: null, parentUserId: null, createdAt: "2026-11-20T09:30:00Z",
      };
      return { ok: true, status: 201, json: async () => student };
    }
    return { ok: answer.status < 300, status: answer.status, json: async () => answer.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function postedBodies(fetchMock: ReturnType<typeof stubBackend>) {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
}

// The real API call behind a spy, so the tests can check what the form passed.
function realImport() {
  return vi.fn<(rows: ImportRow[]) => Promise<StudentImport>>(importStudents);
}

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
  return screen.getByRole("dialog");
}

function selectFile(dialog: HTMLElement, content: string, filename = "students.csv") {
  const file = new File([content], filename, { type: "text/csv" });
  const input = within(dialog).getByLabelText("CSV file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function previewLines(dialog: HTMLElement) {
  const [, ...bodyRows] = within(within(dialog).getByRole("table")).getAllByRole("row");
  return bodyRows.map((row) => within(row).getAllByRole("cell")[0].textContent);
}

function problemItems(dialog: HTMLElement) {
  const list = within(dialog).getByRole("list", { name: /Rows not imported/ });
  return within(list).getAllByRole("listitem").map((item) => item.textContent);
}

const VALID_CSV =
  `${HEADER}\n` +
  "Lina,Daher,Grade 4,Rami Daher,+961 3 123 456\n" +
  "Hadi,Bou Saab,Grade 5,Lina Bou Saab,+961 70 333 222\n";

const LINA: ImportRow = {
  row: 2, firstName: "Lina", lastName: "Daher", grade: "Grade 4", guardianName: "Rami Daher", guardianPhone: "+961 3 123 456",
};
const HADI: ImportRow = {
  row: 3, firstName: "Hadi", lastName: "Bou Saab", grade: "Grade 5", guardianName: "Lina Bou Saab", guardianPhone: "+961 70 333 222",
};

it("previews a valid file's rows and imports them, showing the result and letting the user close", async () => {
  const fetchMock = stubBackend(["created", "created"]);
  const onImport = realImport();
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(dialog, VALID_CSV);

  expect(await within(dialog).findByText("Preview: students.csv")).toBeInTheDocument();
  expect(within(dialog).getByText("2 rows found — 2 valid, 0 invalid (skipped).")).toBeInTheDocument();
  expect(previewLines(dialog)).toEqual(["Row 2", "Row 3"]);

  fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 students" }));
  expect(onImport).toHaveBeenCalledWith([LINA, HADI]);

  expect(await within(dialog).findByText("Import complete")).toBeInTheDocument();
  expect(within(dialog).getByText("2 students added.")).toBeInTheDocument();
  expect(within(dialog).getByText("Created: 2 · Rejected: 0 · Skipped: 0 · Not sent: 0")).toBeInTheDocument();
  expect(within(dialog).queryByRole("list")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.every(([url]) => url === STUDENTS_URL)).toBe(true);

  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("lists a row the server rejected with its line, name, field label and the server's message", async () => {
  stubBackend([
    "created",
    {
      status: 409,
      body: { detail: "Student already exists", errors: { guardianPhone: "A student named Hadi Bou Saab with guardian phone +961 70 333 222 already exists." } },
    },
  ]);
  render(<ImportStudentsForm onImport={realImport()} />);

  const dialog = openForm();
  selectFile(dialog, VALID_CSV);
  await within(dialog).findByText("Preview: students.csv");
  fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 students" }));

  await within(dialog).findByText("Import complete");
  expect(within(dialog).getByText("1 student added.")).toBeInTheDocument();
  expect(within(dialog).getByText("Created: 1 · Rejected: 1 · Skipped: 0 · Not sent: 0")).toBeInTheDocument();
  expect(problemItems(dialog)).toEqual([
    "Row 3 · Hadi Bou Saab — Guardian phone: A student named Hadi Bou Saab with guardian phone +961 70 333 222 already exists.",
  ]);
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

it("flags a row with missing fields as invalid in the preview, without sending it", async () => {
  const fetchMock = stubBackend(["created"]);
  const onImport = realImport();
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(
    dialog,
    `${HEADER}\n` +
      ",Daher,Grade 4,Rami Daher,+961 3 123 456\n" +
      "Hadi,Bou Saab,Grade 5,Lina Bou Saab,+961 70 333 222\n",
  );

  await within(dialog).findByText("Preview: students.csv");
  expect(within(dialog).getByText("2 rows found — 1 valid, 1 invalid (skipped).")).toBeInTheDocument();
  expect(within(dialog).getByText("Invalid: First name is required")).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Import 1 student" }));
  expect(onImport).toHaveBeenCalledWith([HADI]);
  await within(dialog).findByText("Import complete");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(problemItems(dialog)).toEqual(["Row 2 · Daher — First name: First name is required"]);
});

it("reads quoted cells with commas and escaped quotes, and sends them as one value", async () => {
  const fetchMock = stubBackend(["created"]);
  render(<ImportStudentsForm onImport={realImport()} />);

  const dialog = openForm();
  selectFile(dialog, `${HEADER}\n"Hadi","Bou Saab, Jr.",Grade 5,"Lina ""Lulu"" Bou Saab",+961 70 333 222\n`);

  await within(dialog).findByText("Preview: students.csv");
  expect(within(dialog).getByText("1 row found — 1 valid, 0 invalid (skipped).")).toBeInTheDocument();
  expect(within(dialog).getByText("Hadi Bou Saab, Jr.")).toBeInTheDocument();
  expect(within(dialog).getByText('Lina "Lulu" Bou Saab · +961 70 333 222')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Import 1 student" }));
  await within(dialog).findByText("Import complete");
  expect(postedBodies(fetchMock)).toEqual([
    { firstName: "Hadi", lastName: "Bou Saab, Jr.", grade: "Grade 5", guardianName: 'Lina "Lulu" Bou Saab', guardianPhone: "+961 70 333 222" },
  ]);
});

it("numbers a row after a blank line by its line in the file", async () => {
  render(<ImportStudentsForm onImport={realImport()} />);

  const dialog = openForm();
  selectFile(dialog, `${HEADER}\n\nLina,Daher,Grade 4,Rami Daher,+961 3 123 456\n`);

  await within(dialog).findByText("Preview: students.csv");
  expect(previewLines(dialog)).toEqual(["Row 3"]);
});

it("blocks a file with more than 500 rows to send, without calling onImport, and lets the user pick another file", async () => {
  const onImport = vi.fn();
  render(<ImportStudentsForm onImport={onImport} />);
  const tooMany = Array.from({ length: 501 }, (_, i) => `Student${i},Daher,Grade 4,Rami Daher,+961 3 123 456`);

  const dialog = openForm();
  selectFile(dialog, [HEADER, ...tooMany].join("\n"));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "This file has 501 students to import. Import at most 500 at a time.",
  );
  expect(within(dialog).queryByText(/^Preview:/)).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();

  selectFile(dialog, VALID_CSV, "smaller.csv");
  expect(await within(dialog).findByText("Preview: smaller.csv")).toBeInTheDocument();
  expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
});

it("clears the file input after an error, so picking the same file again (e.g. once it's fixed) is read", async () => {
  const onImport = vi.fn();
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  const input = within(dialog).getByLabelText("CSV file") as HTMLInputElement;
  // A browser input only fires "change" again for the same path if its value
  // was reset after the first pick; jsdom can't model that, so this checks
  // directly that the input's value is cleared on the error path.
  const valueSetter = vi.spyOn(input, "value", "set");

  const tooMany = Array.from({ length: 501 }, (_, i) => `Student${i},Daher,Grade 4,Rami Daher,+961 3 123 456`);
  selectFile(dialog, [HEADER, ...tooMany].join("\n"), "big.csv");
  await within(dialog).findByRole("alert");
  expect(valueSetter).toHaveBeenCalledWith("");

  // The user fixes the file (same name, now under the limit) and picks it again.
  selectFile(dialog, VALID_CSV, "big.csv");
  expect(await within(dialog).findByText("Preview: big.csv")).toBeInTheDocument();
});

it("shows one list sorted by line that mixes skipped, rejected and not-sent rows, with a note that the import stopped", async () => {
  const fetchMock = stubBackend([
    "created",
    { status: 400, body: { detail: "Validation failed", errors: { guardianPhone: 'Use a format like "+961 3 123 456" or "+961 70 234 567"' } } },
    new TypeError("Failed to fetch"),
  ]);
  render(<ImportStudentsForm onImport={realImport()} />);

  const dialog = openForm();
  selectFile(
    dialog,
    [
      HEADER,
      "Lina,Daher,Grade 4,Rami Daher,+961 3 123 456",
      "Rami,Aziz,Grade 2,Samir Aziz,03 444 333",
      "Nour,Haddad,,Karim Haddad,+961 3 555 666",
      "Hadi,Bou Saab,Grade 5,Lina Bou Saab,+961 70 333 222",
      "Zeina,Fakhoury,Grade 3,Nabil Fakhoury,+961 3 222 111",
    ].join("\n"),
  );
  await within(dialog).findByText("Preview: students.csv");
  fireEvent.click(within(dialog).getByRole("button", { name: "Import 4 students" }));

  await within(dialog).findByText("Import complete");
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(within(dialog).getByText("Created: 1 · Rejected: 1 · Skipped: 1 · Not sent: 2")).toBeInTheDocument();
  expect(problemItems(dialog)).toEqual([
    'Row 3 · Rami Aziz — Guardian phone: Use a format like "+961 3 123 456" or "+961 70 234 567"',
    "Row 4 · Nour Haddad — Grade: Grade is required",
    "Row 5 · Hadi Bou Saab — Not sent: The import stopped here. This row may or may not have been saved.",
    "Row 6 · Zeina Fakhoury — Not sent: The import stopped at row 5.",
  ]);
  expect(
    within(dialog).getByText(/The import stopped before every row was sent\. A row marked as possibly saved may already be in the roster/),
  ).toBeInTheDocument();
});

it("does not show the stopped note when every row got an answer", async () => {
  stubBackend(["created", { status: 409, body: { errors: { guardianPhone: "Taken" } } }]);
  render(<ImportStudentsForm onImport={realImport()} />);

  const dialog = openForm();
  selectFile(dialog, VALID_CSV);
  await within(dialog).findByText("Preview: students.csv");
  fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 students" }));

  await within(dialog).findByText("Import complete");
  expect(within(dialog).queryByText(/The import stopped/)).not.toBeInTheDocument();
});

it("numbers rows by file line through a BOM, CRLF, blank lines and a quoted newline, in the preview and the results", async () => {
  stubBackend([
    { status: 409, body: { errors: { guardianPhone: "A student named Lina Daher with guardian phone +961 3 123 456 already exists." } } },
    { status: 400, body: { errors: { guardianPhone: 'Use a format like "+961 3 123 456" or "+961 70 234 567"' } } },
  ]);
  render(<ImportStudentsForm onImport={realImport()} />);

  // Line 1 blank, the header on line 2, Lina on lines 3-4, line 5 blank, Hadi on line 6.
  const dialog = openForm();
  selectFile(
    dialog,
    `﻿\r\n${HEADER}\r\nLina,Daher,"Grade\r\n4",Rami Daher,+961 3 123 456\r\n\r\nHadi,Bou Saab,Grade 5,Lina Bou Saab,03 444 333\r\n`,
  );

  await within(dialog).findByText("Preview: students.csv");
  expect(previewLines(dialog)).toEqual(["Row 3", "Row 6"]);
  fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 students" }));

  await within(dialog).findByText("Import complete");
  expect(problemItems(dialog)).toEqual([
    "Row 3 · Lina Daher — Guardian phone: A student named Lina Daher with guardian phone +961 3 123 456 already exists.",
    'Row 6 · Hadi Bou Saab — Guardian phone: Use a format like "+961 3 123 456" or "+961 70 234 567"',
  ]);
});

it("sends nothing for a file whose rows are all skipped, and says there is nothing to import", async () => {
  const fetchMock = stubBackend([]);
  const onImport = realImport();
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(dialog, `${HEADER}\n,Daher,Grade 4,Rami Daher,+961 3 123 456\nHadi,,Grade 5,Lina Bou Saab,+961 70 333 222\n`);

  await within(dialog).findByText("Preview: students.csv");
  expect(within(dialog).getByText("2 rows found — 0 valid, 2 invalid (skipped).")).toBeInTheDocument();
  const button = within(dialog).getByRole("button", { name: "No valid rows to import" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onImport).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps the dialog open on Escape while an import is running", async () => {
  let finish: (outcome: StudentImport) => void = () => {};
  const onImport = vi.fn(() => new Promise<StudentImport>((resolve) => { finish = resolve; }));
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(dialog, VALID_CSV);
  await within(dialog).findByText("Preview: students.csv");
  fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 students" }));
  await within(dialog).findByRole("button", { name: "Importing..." });

  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  finish({ result: { created: 0, rejected: 0, results: [] }, notSent: [] });
  expect(await within(dialog).findByText("Import complete")).toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("announces the outcome through a status region that is already in the dialog before the import", async () => {
  stubBackend(["created", { status: 409, body: { errors: { guardianPhone: "Taken" } } }]);
  render(<ImportStudentsForm onImport={realImport()} />);

  const dialog = openForm();
  selectFile(dialog, VALID_CSV);
  await within(dialog).findByText("Preview: students.csv");
  const status = within(dialog).getByRole("status");
  expect(status).toHaveTextContent("");

  fireEvent.click(within(dialog).getByRole("button", { name: "Import 2 students" }));
  await within(dialog).findByText("Import complete");
  expect(within(dialog).getByRole("status")).toBe(status);
  expect(status).toHaveTextContent("1 student added. 1 row not imported.");
});

it("reads the contract's sample file into request.json's six rows and shows response-partial.json's problems", async () => {
  // docs/contracts/samples/students-import/request.json: header on line 1, a blank line 4.
  const csv = [
    HEADER,
    "Zeina,Fakhoury,Grade 3,Nabil Fakhoury,+961 3 222 111",
    "Hadi,Bou Saab, Grade 5 ,Lina Bou Saab,+961 70 333 222",
    "",
    "Rami,Aziz,Grade 2,Samir Aziz,03 444 333",
    "zeina,FAKHOURY,Grade 3,Nabil Fakhoury,+961 3 222 111",
    "Tarek,Mansour,4,Maya Mansour,+961 3 411 001",
    ",Khoury,  ,Joseph Khoury,+961 71 555 444",
  ].join("\n");
  // response-partial.json's answers for rows 2, 3, 5 and 7; row 6 is a repeat and is never sent.
  const fetchMock = stubBackend([
    "created",
    "created",
    { status: 400, body: { errors: { guardianPhone: 'Use a format like "+961 3 123 456" or "+961 70 234 567"' } } },
    { status: 409, body: { errors: { guardianPhone: "A student named Tarek Mansour with guardian phone +961 3 411 001 already exists." } } },
  ]);
  const onImport = realImport();
  render(<ImportStudentsForm onImport={onImport} />);

  const dialog = openForm();
  selectFile(dialog, csv);

  await within(dialog).findByText("Preview: students.csv");
  expect(previewLines(dialog)).toEqual(["Row 2", "Row 3", "Row 5", "Row 6", "Row 7", "Row 8"]);
  expect(within(dialog).getByText("6 rows found — 5 valid, 1 invalid (skipped).")).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Import 5 students" }));
  expect(onImport.mock.calls[0][0].map((row) => row.row)).toEqual([2, 3, 5, 6, 7]);

  await within(dialog).findByText("Import complete");
  expect(postedBodies(fetchMock).map((body) => body.firstName)).toEqual(["Zeina", "Hadi", "Rami", "Tarek"]);
  expect(within(dialog).getByText("2 students added.")).toBeInTheDocument();
  expect(within(dialog).getByText("Created: 2 · Rejected: 3 · Skipped: 1 · Not sent: 0")).toBeInTheDocument();
  expect(problemItems(dialog)).toEqual([
    'Row 5 · Rami Aziz — Guardian phone: Use a format like "+961 3 123 456" or "+961 70 234 567"',
    "Row 6 · zeina FAKHOURY — Guardian phone: Same student and guardian phone as row 2.",
    "Row 7 · Tarek Mansour — Guardian phone: A student named Tarek Mansour with guardian phone +961 3 411 001 already exists.",
    "Row 8 · Khoury — First name: First name is required; Grade: Grade is required",
  ]);
});
