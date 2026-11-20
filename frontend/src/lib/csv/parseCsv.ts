// A small RFC 4180 CSV tokenizer for the students import (SCRUM-59). Cells are
// split on commas; a cell that starts with `"` is quoted, may hold commas and
// line breaks, and writes a quote as `""`. Line breaks are CRLF, LF or a lone
// CR. A leading byte order mark is dropped.
//
// Each record keeps `line`, the line of the file it starts on (1-based), which
// is the `row` of docs/contracts/students-import.md. Blank lines come back as a
// record with one empty cell, so nothing is renumbered; deciding what counts
// as blank is the caller's job. Cells are returned as written, spaces included.

export interface CsvRecord {
  line: number;
  cells: string[];
}

export type CsvParseResult =
  | { ok: true; records: CsvRecord[] }
  // The line the unclosed quote opens on, which may be after the record's first line.
  | { ok: false; unclosedQuoteLine: number };

export function parseCsv(text: string): CsvParseResult {
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const records: CsvRecord[] = [];

  let line = 1;
  let recordLine = 1;
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let quoteLine = 0;
  // Whether anything has been read since the last record ended, so the line
  // break that ends the file does not make an extra empty record.
  let pending = false;

  function endRecord() {
    cells.push(cell);
    records.push({ line: recordLine, cells });
    cells = [];
    cell = "";
    pending = false;
  }

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n" || (char === "\r" && input[i + 1] !== "\n")) line++;
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === "") {
      quoted = true;
      quoteLine = line;
      pending = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
      pending = true;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += char;
      pending = true;
    }
  }

  if (quoted) return { ok: false, unclosedQuoteLine: quoteLine };
  if (pending) endRecord();
  return { ok: true, records };
}
