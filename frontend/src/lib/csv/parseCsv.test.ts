// Tests for the CSV tokenizer of the students import (SCRUM-59). `line` is the
// line of the file a record starts on, as docs/contracts/students-import.md
// defines `row`: blank lines are counted, and a record whose quoted cell spans
// several lines has the number of its first line.

import { describe, expect, it } from "vitest";
import { parseCsv } from "./parseCsv";

function records(text: string) {
  const result = parseCsv(text);
  if (!result.ok) throw new Error(`unexpected unclosed quote on line ${result.unclosedQuoteLine}`);
  return result.records;
}

describe("parseCsv", () => {
  it("splits records on commas and numbers each by its line", () => {
    expect(records("a,b,c\n1,2,3\n")).toEqual([
      { line: 1, cells: ["a", "b", "c"] },
      { line: 2, cells: ["1", "2", "3"] },
    ]);
  });

  it.each([
    ["LF", "a,b\n1,2\n3,4"],
    ["CRLF", "a,b\r\n1,2\r\n3,4"],
    ["lone CR", "a,b\r1,2\r3,4"],
  ])("accepts %s line endings", (_name, text) => {
    expect(records(text)).toEqual([
      { line: 1, cells: ["a", "b"] },
      { line: 2, cells: ["1", "2"] },
      { line: 3, cells: ["3", "4"] },
    ]);
  });

  it("strips a leading byte order mark", () => {
    expect(records("﻿firstName,lastName\nLina,Daher")).toEqual([
      { line: 1, cells: ["firstName", "lastName"] },
      { line: 2, cells: ["Lina", "Daher"] },
    ]);
  });

  it("does not make a record of the newline that ends the file", () => {
    expect(records("a\r\n1\r\n")).toEqual([
      { line: 1, cells: ["a"] },
      { line: 2, cells: ["1"] },
    ]);
  });

  it("returns blank lines as records with one empty cell, so they still count", () => {
    expect(records("a\n\n1\r\n\r\n2")).toEqual([
      { line: 1, cells: ["a"] },
      { line: 2, cells: [""] },
      { line: 3, cells: ["1"] },
      { line: 4, cells: [""] },
      { line: 5, cells: ["2"] },
    ]);
  });

  it("keeps a comma inside a quoted cell", () => {
    expect(records('name,grade\n"Bou Saab, Jr.",Grade 5')[1]).toEqual({
      line: 2,
      cells: ["Bou Saab, Jr.", "Grade 5"],
    });
  });

  it('turns "" inside a quoted cell into one quote', () => {
    expect(records('"Rami ""Ray"" Aziz",x')[0].cells).toEqual(['Rami "Ray" Aziz', "x"]);
  });

  it("reads an empty quoted cell as empty", () => {
    expect(records('"",b')[0].cells).toEqual(["", "b"]);
  });

  it("keeps a newline inside a quoted cell and numbers the record by the line it starts on", () => {
    const text = 'a,b\n"line one\nline two",x\r\n"three\r\nlines\rhere",y\nlast,z';
    expect(records(text)).toEqual([
      { line: 1, cells: ["a", "b"] },
      { line: 2, cells: ["line one\nline two", "x"] },
      { line: 4, cells: ["three\r\nlines\rhere", "y"] },
      { line: 7, cells: ["last", "z"] },
    ]);
  });

  it("keeps the spaces around an unquoted cell, for the caller to trim", () => {
    expect(records("a, Grade 5 ,c")[0].cells).toEqual(["a", " Grade 5 ", "c"]);
  });

  it("keeps a quote in the middle of an unquoted cell as it is", () => {
    expect(records('5" tall,b')[0].cells).toEqual(['5" tall', "b"]);
  });

  it("reports an unclosed quote with the line the quote opens on", () => {
    expect(parseCsv('a,b\n1,2\n3,"never closed\n4,5\n6,7')).toEqual({ ok: false, unclosedQuoteLine: 3 });
  });

  it("returns no records for an empty file", () => {
    expect(records("")).toEqual([]);
  });
});
