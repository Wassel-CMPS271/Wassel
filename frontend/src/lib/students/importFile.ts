// Reads a students CSV into the rows of the import request, and lists the rows
// that did not make it (SCRUM-59, docs/contracts/students-import.md).
//
// The header row names the five columns in any order and letter case; extra
// columns are ignored. `row` is the line of the file a record starts on, so
// "Row 7" in a message is line 7 of the file. A line whose cells are all empty
// (Excel writes `,,,,`) is blank: it is not a row, but it is counted.
//
// The preview checks each row the way single create does, so a row the server
// would refuse for a missing or too-long value is skipped before any request.
// The phone's format is left to the server.

import type { ImportRow, NotSentRow, RowResult } from "@/lib/api/students";
import { parseCsv } from "@/lib/csv/parseCsv";

export const IMPORT_FIELDS = ["firstName", "lastName", "grade", "guardianName", "guardianPhone"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  firstName: "First name",
  lastName: "Last name",
  grade: "Grade",
  guardianName: "Guardian name",
  guardianPhone: "Guardian phone",
};

// An ImportRow's values are the cells as written; the server trims them.
export type SkippedRow = ImportRow & { errors: Partial<Record<ImportField, string>> };

// `kind` says where the row stopped: the server rejected it, the preview
// skipped it, or the import stopped before it had an answer.
export interface ImportProblem {
  row: number;
  name: string;
  kind: "rejected" | "skipped" | "notSent";
  messages: string[];
}

export type ImportFileResult =
  | { ok: true; rows: ImportRow[]; skipped: SkippedRow[] }
  | { ok: false; error: string };

export const MAX_IMPORT_ROWS = 500;

// The varchar sizes of the students table (V1__baseline_schema.sql).
const MAX_LENGTH: Record<ImportField, number> = {
  firstName: 100,
  lastName: 100,
  grade: 50,
  guardianName: 100,
  guardianPhone: 30,
};

const PHONE_FORMAT_MESSAGE = 'Use a format like "+961 3 123 456" or "+961 70 234 567"';

export function readImportFile(text: string): ImportFileResult {
  const parsed = parseCsv(text);
  if (!parsed.ok) {
    return { ok: false, error: `Line ${parsed.unclosedQuoteLine} has a quote (") that is never closed.` };
  }

  const records = parsed.records.filter((record) => record.cells.some((cell) => cell.trim() !== ""));
  if (records.length === 0) return { ok: false, error: "The file is empty." };

  const [header, ...data] = records;
  const headerCells = header.cells.map((cell) => cell.trim().toLowerCase());
  const columnIndex = {} as Record<ImportField, number>;
  for (const field of IMPORT_FIELDS) {
    const index = headerCells.indexOf(field.toLowerCase());
    if (index === -1) return { ok: false, error: `Missing required column: ${FIELD_LABELS[field]}.` };
    columnIndex[field] = index;
  }

  if (data.length === 0) return { ok: false, error: "The file has a header row but no data rows." };

  const rows: ImportRow[] = [];
  const skipped: SkippedRow[] = [];
  for (const record of data) {
    const importRow = { row: record.line } as ImportRow;
    for (const field of IMPORT_FIELDS) importRow[field] = record.cells[columnIndex[field]] ?? "";
    const errors = checkRow(importRow);
    if (Object.keys(errors).length === 0) rows.push(importRow);
    else skipped.push({ ...importRow, errors });
  }
  return { ok: true, rows, skipped };
}

// One message per field, and "is required" wins over the length check.
function checkRow(importRow: ImportRow): Partial<Record<ImportField, string>> {
  const errors: Partial<Record<ImportField, string>> = {};
  for (const field of IMPORT_FIELDS) {
    const value = importRow[field].trim();
    if (value === "") {
      errors[field] = `${FIELD_LABELS[field]} is required`;
    } else if (value.length > MAX_LENGTH[field]) {
      // The contract gives a long phone the format message, which already caps it.
      errors[field] = field === "guardianPhone"
        ? PHONE_FORMAT_MESSAGE
        : `${FIELD_LABELS[field]} must be ${MAX_LENGTH[field]} characters or fewer`;
    }
  }
  return errors;
}

// Counts the rows that would be sent, not the lines of the file.
export function checkRowLimit(rows: readonly ImportRow[]): string | undefined {
  if (rows.length <= MAX_IMPORT_ROWS) return undefined;
  return `This file has ${rows.length} students to import. Import at most ${MAX_IMPORT_ROWS} at a time.`;
}

// Every row that did not make it, sorted by row: the server's rejected rows
// and the rows with no answer (both named from the rows that were sent), and
// the rows the preview skipped. A field message is "<Label>: <message>", in
// field order; a row with no answer keeps its message as it is.
export function problemList(
  sent: readonly ImportRow[],
  results: readonly RowResult[],
  skipped: readonly SkippedRow[],
  notSent: readonly NotSentRow[],
): ImportProblem[] {
  const sentByRow = new Map(sent.map((importRow) => [importRow.row, importRow]));
  const problems: ImportProblem[] = [];
  for (const result of results) {
    if (result.status !== "rejected") continue;
    problems.push({ row: result.row, name: nameOf(sentByRow.get(result.row)), kind: "rejected", messages: messagesOf(result.errors) });
  }
  for (const skippedRow of skipped) {
    problems.push({ row: skippedRow.row, name: nameOf(skippedRow), kind: "skipped", messages: messagesOf(skippedRow.errors) });
  }
  for (const { row, message } of notSent) {
    problems.push({ row, name: nameOf(sentByRow.get(row)), kind: "notSent", messages: [message] });
  }
  return problems.sort((a, b) => a.row - b.row);
}

function nameOf(importRow: ImportRow | undefined): string {
  if (!importRow) return "";
  return `${importRow.firstName.trim()} ${importRow.lastName.trim()}`.trim();
}

function messagesOf(errors: Record<string, string | undefined>): string[] {
  const known = IMPORT_FIELDS.filter((field) => errors[field]).map((field) => `${FIELD_LABELS[field]}: ${errors[field]}`);
  const unknown = Object.keys(errors)
    .filter((key) => !(IMPORT_FIELDS as readonly string[]).includes(key) && errors[key])
    .map((key) => `${key}: ${errors[key]}`);
  return [...known, ...unknown];
}
