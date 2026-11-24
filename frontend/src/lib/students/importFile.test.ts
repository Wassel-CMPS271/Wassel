// Tests for reading a students CSV into the rows of the import request
// (SCRUM-59, docs/contracts/students-import.md). `row` is the line of the file
// the record starts on; the preview's own checks skip a row before any request.

import { describe, expect, it } from "vitest";
import type { ImportRow, RowResult, Student } from "@/lib/api/students";
import {
  FIELD_LABELS,
  MAX_IMPORT_ROWS,
  checkRowLimit,
  problemList,
  readImportFile,
  type SkippedRow,
} from "./importFile";

const HEADER = "firstName,lastName,grade,guardianName,guardianPhone";

function read(text: string) {
  const result = readImportFile(text);
  if (!result.ok) throw new Error(`unexpected error: ${result.error}`);
  return result;
}

function errorOf(text: string) {
  const result = readImportFile(text);
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    row: 2,
    firstName: "Lina",
    lastName: "Daher",
    grade: "Grade 4",
    guardianName: "Rami Daher",
    guardianPhone: "+961 3 123 456",
    ...overrides,
  };
}

function csvLine(r: ImportRow) {
  return [r.firstName, r.lastName, r.grade, r.guardianName, r.guardianPhone].join(",");
}

// The file the contract's samples/students-import/request.json was read from:
// the header on line 1, rows 2 and 3, a blank line 4, then rows 5 to 8.
const REQUEST_SAMPLE_CSV = [
  HEADER,
  "Zeina,Fakhoury,Grade 3,Nabil Fakhoury,+961 3 222 111",
  "Hadi,Bou Saab, Grade 5 ,Lina Bou Saab,+961 70 333 222",
  "",
  "Rami,Aziz,Grade 2,Samir Aziz,03 444 333",
  "zeina,FAKHOURY,Grade 3,Nabil Fakhoury,+961 3 222 111",
  "Tarek,Mansour,4,Maya Mansour,+961 3 411 001",
  ",Khoury,  ,Joseph Khoury,+961 71 555 444",
].join("\n");

// samples/students-import/request.json, `students`.
const REQUEST_SAMPLE_ROWS: ImportRow[] = [
  { row: 2, firstName: "Zeina", lastName: "Fakhoury", grade: "Grade 3", guardianName: "Nabil Fakhoury", guardianPhone: "+961 3 222 111" },
  { row: 3, firstName: "Hadi", lastName: "Bou Saab", grade: " Grade 5 ", guardianName: "Lina Bou Saab", guardianPhone: "+961 70 333 222" },
  { row: 5, firstName: "Rami", lastName: "Aziz", grade: "Grade 2", guardianName: "Samir Aziz", guardianPhone: "03 444 333" },
  { row: 6, firstName: "zeina", lastName: "FAKHOURY", grade: "Grade 3", guardianName: "Nabil Fakhoury", guardianPhone: "+961 3 222 111" },
  { row: 7, firstName: "Tarek", lastName: "Mansour", grade: "4", guardianName: "Maya Mansour", guardianPhone: "+961 3 411 001" },
  { row: 8, firstName: "", lastName: "Khoury", grade: "  ", guardianName: "Joseph Khoury", guardianPhone: "+961 71 555 444" },
];

describe("readImportFile", () => {
  it("reads the contract's sample file into request.json's rows, skipping row 8 as the preview does", () => {
    const { rows, skipped } = read(REQUEST_SAMPLE_CSV);
    expect(rows).toEqual(REQUEST_SAMPLE_ROWS.slice(0, 5));
    expect(skipped).toEqual([
      { ...REQUEST_SAMPLE_ROWS[5], errors: { firstName: "First name is required", grade: "Grade is required" } },
    ]);
  });

  it("numbers rows by file line across a byte order mark and CRLF endings", () => {
    const { rows } = read(`﻿${HEADER}\r\n${csvLine(row())}\r\n\r\n${csvLine(row({ firstName: "Hadi" }))}\r\n`);
    expect(rows.map((r) => [r.row, r.firstName])).toEqual([[2, "Lina"], [4, "Hadi"]]);
  });

  it("numbers rows by file line with lone CR endings", () => {
    const { rows } = read(`${HEADER}\r${csvLine(row())}\r${csvLine(row({ firstName: "Hadi" }))}`);
    expect(rows.map((r) => r.row)).toEqual([2, 3]);
  });

  it("reads quoted cells with commas, escaped quotes and newlines, numbering a record by its first line", () => {
    const text = [
      HEADER,
      '"Hadi","Bou Saab, Jr.","Grade 5","Lina ""Lulu"" Bou Saab","+961 70 333 222"',
      '"Zeina","Fakhoury","Grade',
      '3","Nabil Fakhoury","+961 3 222 111"',
      csvLine(row()),
    ].join("\n");
    expect(read(text).rows).toEqual([
      row({ row: 2, firstName: "Hadi", lastName: "Bou Saab, Jr.", grade: "Grade 5", guardianName: 'Lina "Lulu" Bou Saab', guardianPhone: "+961 70 333 222" }),
      row({ row: 3, firstName: "Zeina", lastName: "Fakhoury", grade: "Grade\n3", guardianName: "Nabil Fakhoury", guardianPhone: "+961 3 222 111" }),
      row({ row: 5 }),
    ]);
  });

  it("treats a line of only empty cells as blank: not a row, not skipped, but counted", () => {
    const { rows, skipped } = read(`${HEADER}\n,,,,\n  , ,\t,,\n${csvLine(row())}`);
    expect(skipped).toEqual([]);
    expect(rows).toEqual([row({ row: 4 })]);
  });

  it("matches the header in any letter case and order, around spaces, ignoring extra columns", () => {
    const text = " GUARDIANPHONE ,Notes,grade,FirstName,lastname,GuardianName\n+961 3 123 456,x,Grade 4,Lina,Daher,Rami Daher";
    expect(read(text).rows).toEqual([row()]);
  });

  it("finds the header on the first line that is not blank", () => {
    expect(read(`\n\n${HEADER}\n${csvLine(row())}`).rows).toEqual([row({ row: 4 })]);
  });

  it("reads a row with fewer cells than the header as missing the rest", () => {
    expect(read(`${HEADER}\nLina,Daher,Grade 4`).skipped).toEqual([
      {
        row: 2, firstName: "Lina", lastName: "Daher", grade: "Grade 4", guardianName: "", guardianPhone: "",
        errors: { guardianName: "Guardian name is required", guardianPhone: "Guardian phone is required" },
      },
    ]);
  });

  it("refuses an empty file", () => {
    expect(errorOf("")).toBe("The file is empty.");
    expect(errorOf("\n , ,\n")).toBe("The file is empty.");
  });

  it("names the first required column the header lacks", () => {
    expect(errorOf("firstName,lastName,grade,guardianName\nLina,Daher,Grade 4,Rami Daher")).toBe(
      "Missing required column: Guardian phone.",
    );
  });

  it("refuses a header with no data rows, blank lines not counting as rows", () => {
    expect(errorOf(`${HEADER}\n\n,,,,\n`)).toBe("The file has a header row but no data rows.");
  });

  it("refuses a file with an unclosed quote, naming the line the quote opens on", () => {
    expect(errorOf(`${HEADER}\n${csvLine(row())}\n"Hadi,Bou Saab,Grade 5,Lina Bou Saab,+961 70 333 222\n${csvLine(row())}`)).toBe(
      'Line 3 has a quote (") that is never closed.',
    );
  });
});

describe("readImportFile's checks of each row", () => {
  function skippedErrors(r: ImportRow) {
    return read(`${HEADER}\n${csvLine(r)}`).skipped.map((s) => s.errors);
  }

  // All five blank would be a blank line, so one cell stays filled each time.
  it("gives each blank field its 'is required' message only", () => {
    expect(skippedErrors(row({ firstName: " ", lastName: "", grade: "", guardianPhone: "  " }))).toEqual([
      {
        firstName: "First name is required",
        lastName: "Last name is required",
        grade: "Grade is required",
        guardianPhone: "Guardian phone is required",
      },
    ]);
    expect(skippedErrors(row({ guardianName: "\t" }))).toEqual([{ guardianName: "Guardian name is required" }]);
  });

  it.each([
    ["firstName", 100, "First name must be 100 characters or fewer"],
    ["lastName", 100, "Last name must be 100 characters or fewer"],
    ["guardianName", 100, "Guardian name must be 100 characters or fewer"],
    ["grade", 50, "Grade must be 50 characters or fewer"],
  ] as const)("accepts a %s of %i characters and refuses one more", (field, max, message) => {
    expect(skippedErrors(row({ [field]: "a".repeat(max) }))).toEqual([]);
    expect(skippedErrors(row({ [field]: "a".repeat(max + 1) }))).toEqual([{ [field]: message }]);
  });

  it("measures the length after trimming, as the server does", () => {
    expect(skippedErrors(row({ firstName: `  ${"a".repeat(100)}  ` }))).toEqual([]);
  });

  it("refuses a guardian phone over 30 characters with the contract's format message", () => {
    expect(skippedErrors(row({ guardianPhone: "+961 3 123 456" }))).toEqual([]);
    expect(skippedErrors(row({ guardianPhone: "1".repeat(30) }))).toEqual([]);
    expect(skippedErrors(row({ guardianPhone: "1".repeat(31) }))).toEqual([
      { guardianPhone: 'Use a format like "+961 3 123 456" or "+961 70 234 567"' },
    ]);
  });

  it("leaves the phone format itself to the server", () => {
    expect(skippedErrors(row({ guardianPhone: "03 444 333" }))).toEqual([]);
  });

  it("reports every failing field of a row together", () => {
    expect(skippedErrors(row({ firstName: "", grade: "g".repeat(51) }))).toEqual([
      { firstName: "First name is required", grade: "Grade must be 50 characters or fewer" },
    ]);
  });
});

describe("checkRowLimit", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => row({ row: i + 2 }));

  it("allows up to 500 rows", () => {
    expect(MAX_IMPORT_ROWS).toBe(500);
    expect(checkRowLimit(rows(1))).toBeUndefined();
    expect(checkRowLimit(rows(500))).toBeUndefined();
  });

  it("refuses 501 rows with a message naming the count", () => {
    expect(checkRowLimit(rows(501))).toBe("This file has 501 students to import. Import at most 500 at a time.");
  });

  it("counts the rows that would be sent, not the lines of the file", () => {
    const good = Array.from({ length: 500 }, (_, i) => csvLine(row({ firstName: `S${i}` })));
    const bad = Array.from({ length: 20 }, () => csvLine(row({ firstName: "" })));
    const { rows: sendable, skipped } = read([HEADER, ...good, "", ...bad].join("\n"));
    expect(skipped).toHaveLength(20);
    expect(checkRowLimit(sendable)).toBeUndefined();

    const { rows: tooMany } = read([HEADER, ...good, csvLine(row({ firstName: "One more" }))].join("\n"));
    expect(checkRowLimit(tooMany)).toBe("This file has 501 students to import. Import at most 500 at a time.");
  });
});

describe("problemList", () => {
  // Row 2's student in samples/students-import/response-partial.json.
  const STUDENT: Student = {
    id: "5c1e8a40-2b7d-4f19-9c3a-6d2f0e8b4a11",
    firstName: "Zeina",
    lastName: "Fakhoury",
    grade: "Grade 3",
    guardianName: "Nabil Fakhoury",
    guardianPhone: "+961 3 222 111",
    status: "active",
    address: null,
    latitude: null,
    longitude: null,
    route: null,
    parentUserId: null,
    createdAt: "2026-11-20T09:30:00Z",
  };

  // samples/students-import/response-partial.json, without row 8: the frontend never sends it.
  const PARTIAL_RESULTS: RowResult[] = [
    { row: 2, status: "created", student: STUDENT },
    { row: 3, status: "created", student: { ...STUDENT, id: "9a4d2f17-6e3b-4c85-b1f0-2e7a9c3d5b22", firstName: "Hadi", lastName: "Bou Saab" } },
    { row: 5, status: "rejected", errors: { guardianPhone: 'Use a format like "+961 3 123 456" or "+961 70 234 567"' } },
    { row: 6, status: "rejected", errors: { guardianPhone: "Same student and guardian phone as row 2." } },
    { row: 7, status: "rejected", errors: { guardianPhone: "A student named Tarek Mansour with guardian phone +961 3 411 001 already exists." } },
  ];

  it("lists the server's rejected rows and the preview's skipped rows together, sorted by row", () => {
    const { rows, skipped } = read(REQUEST_SAMPLE_CSV);
    const shuffled = [PARTIAL_RESULTS[4], PARTIAL_RESULTS[0], PARTIAL_RESULTS[2], PARTIAL_RESULTS[3], PARTIAL_RESULTS[1]];
    expect(problemList(rows, shuffled, skipped, [])).toEqual([
      { row: 5, name: "Rami Aziz", kind: "rejected", messages: ['Guardian phone: Use a format like "+961 3 123 456" or "+961 70 234 567"'] },
      { row: 6, name: "zeina FAKHOURY", kind: "rejected", messages: ["Guardian phone: Same student and guardian phone as row 2."] },
      { row: 7, name: "Tarek Mansour", kind: "rejected", messages: ["Guardian phone: A student named Tarek Mansour with guardian phone +961 3 411 001 already exists."] },
      { row: 8, name: "Khoury", kind: "skipped", messages: ["First name: First name is required", "Grade: Grade is required"] },
    ]);
  });

  it("puts a skipped row between rejected rows by its number", () => {
    const sent = [row({ row: 2 }), row({ row: 9 })];
    const skipped: SkippedRow[] = [{ ...row({ row: 4, lastName: "" }), errors: { lastName: "Last name is required" } }];
    const results: RowResult[] = [
      { row: 9, status: "rejected", errors: { grade: "Grade is required" } },
      { row: 2, status: "rejected", errors: { firstName: "First name is required" } },
    ];
    expect(problemList(sent, results, skipped, []).map((p) => p.row)).toEqual([2, 4, 9]);
  });

  it("mixes rows with no answer in by number, named from the rows sent, keeping their message as it is", () => {
    const sent = [row({ row: 2 }), row({ row: 6, firstName: "Hadi" }), row({ row: 9, firstName: "Zeina" })];
    const skipped: SkippedRow[] = [{ ...row({ row: 3, grade: "" }), errors: { grade: "Grade is required" } }];
    const results: RowResult[] = [{ row: 2, status: "rejected", errors: { guardianPhone: "Taken" } }];
    const notSent = [
      { row: 9, message: "The import stopped at row 6." },
      { row: 6, message: "The import stopped here. This row may or may not have been saved." },
    ];
    expect(problemList(sent, results, skipped, notSent)).toEqual([
      { row: 2, name: "Lina Daher", kind: "rejected", messages: ["Guardian phone: Taken"] },
      { row: 3, name: "Lina Daher", kind: "skipped", messages: ["Grade: Grade is required"] },
      { row: 6, name: "Hadi Daher", kind: "notSent", messages: ["The import stopped here. This row may or may not have been saved."] },
      { row: 9, name: "Zeina Daher", kind: "notSent", messages: ["The import stopped at row 6."] },
    ]);
  });

  it("orders a row's messages by field and keeps an unknown key as it is", () => {
    const results = [{ row: 2, status: "rejected" as const, errors: { guardianPhone: "p", other: "o", firstName: "f" } }];
    expect(problemList([row()], results, [], [])[0].messages).toEqual(["First name: f", "Guardian phone: p", "other: o"]);
  });

  it("is empty when every row was created", () => {
    expect(problemList([row()], [{ row: 2, status: "created", student: STUDENT }], [], [])).toEqual([]);
  });

  it("labels every field", () => {
    expect(FIELD_LABELS).toEqual({
      firstName: "First name",
      lastName: "Last name",
      grade: "Grade",
      guardianName: "Guardian name",
      guardianPhone: "Guardian phone",
    });
  });
});
