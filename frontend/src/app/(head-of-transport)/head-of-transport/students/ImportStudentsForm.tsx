"use client";

// Sample CSV a caller might paste into a test file to try this flow:
//
//   firstName,lastName,grade,guardianName,guardianPhone
//   Zeina,Fakhoury,Grade 3,Nabil Fakhoury,+961 3 222 111
//   Hadi,Bou Saab,Grade 5,Lina Bou Saab,+961 70 333 222
//   ,Aziz,Grade 2,Samir Aziz,+961 71 444 333
//   Zeina,Fakhoury,Grade 3,Nabil Fakhoury,+961 3 222 111
//
// Column order doesn't matter as long as the header row names each of
// firstName, lastName, grade, guardianName, guardianPhone (extra columns
// are ignored). The row above with no firstName demonstrates a
// missing-field row, and the repeated Zeina/Fakhoury row demonstrates an
// in-batch duplicate.

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ImportErrorReason, ImportRowResult, NewStudent } from "@/lib/api/students";
import { colors, darkTheme, radius, spacing, typography } from "@/styles/tokens";

const REQUIRED_COLUMNS = ["firstName", "lastName", "grade", "guardianName", "guardianPhone"] as const;
type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

const COLUMN_LABELS: Record<RequiredColumn, string> = {
  firstName: "First name",
  lastName: "Last name",
  grade: "Grade",
  guardianName: "Guardian name",
  guardianPhone: "Guardian phone",
};

interface ParsedRow {
  rowNumber: number;
  values: Record<RequiredColumn, string>;
  isValid: boolean;
  reason?: string;
}

function parseStudentsCsv(text: string): { rows: ParsedRow[]; headerError?: string } {
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], headerError: "The file is empty." };
  }

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const columnIndex = {} as Record<RequiredColumn, number>;
  for (const column of REQUIRED_COLUMNS) {
    const idx = header.indexOf(column.toLowerCase());
    if (idx === -1) {
      return { rows: [], headerError: `Missing required column: ${COLUMN_LABELS[column]}.` };
    }
    columnIndex[column] = idx;
  }

  if (lines.length === 1) {
    return { rows: [], headerError: "The file has a header row but no data rows." };
  }

  const rows: ParsedRow[] = lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const values = {} as Record<RequiredColumn, string>;
    for (const column of REQUIRED_COLUMNS) {
      values[column] = cells[columnIndex[column]] ?? "";
    }
    const missing = REQUIRED_COLUMNS.filter((column) => !values[column]);
    return {
      rowNumber: i + 1,
      values,
      isValid: missing.length === 0,
      reason: missing.length > 0 ? `Missing ${missing.map((c) => COLUMN_LABELS[c]).join(", ")}` : undefined,
    };
  });

  return { rows };
}

const REASON_LABELS: Record<ImportErrorReason, string> = {
  missing_fields: "Missing required fields",
  duplicate_in_batch: "Duplicate within this file",
  duplicate_existing: "Already in the roster",
};

type Step = "select" | "preview" | "results";

interface ImportStudentsFormProps {
  onImport: (rows: NewStudent[]) => Promise<ImportRowResult[]>;
}

export function ImportStudentsForm({ onImport }: ImportStudentsFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [fileName, setFileName] = useState<string | undefined>();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selectError, setSelectError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ImportRowResult[]>([]);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    if (step === "select") fileInputRef.current?.focus();
    if (step === "preview") previewHeadingRef.current?.focus();
    if (step === "results") resultsHeadingRef.current?.focus();
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  function resetAll() {
    setStep("select");
    setFileName(undefined);
    setRows([]);
    setSelectError(undefined);
    setSubmitError(undefined);
    setIsImporting(false);
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openForm() {
    setIsOpen(true);
  }

  function closeForm() {
    shouldRestoreFocusRef.current = true;
    setIsOpen(false);
    resetAll();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSelectError("Please choose a .csv file.");
      return;
    }

    try {
      const text = await file.text();
      const { rows: parsedRows, headerError } = parseStudentsCsv(text);
      if (headerError) {
        setSelectError(headerError);
        return;
      }
      setSelectError(undefined);
      setFileName(file.name);
      setRows(parsedRows);
      setStep("preview");
    } catch {
      setSelectError("Couldn't read that file. Please try again.");
    }
  }

  function backToSelect() {
    setStep("select");
    setRows([]);
    setSubmitError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const validRows = rows.filter((row) => row.isValid);
  const invalidRows = rows.filter((row) => !row.isValid);

  async function handleImport() {
    if (validRows.length === 0) return;
    setIsImporting(true);
    setSubmitError(undefined);
    try {
      const newStudents: NewStudent[] = validRows.map((row) => ({ ...row.values }));
      const importResults = await onImport(newStudents);
      setResults(importResults);
      setStep("results");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  // Escape closes the dialog; Tab is trapped to the focusable elements
  // inside the panel so focus can't leave it while it's open.
  function handleOverlayKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeForm();
      return;
    }
    if (event.key !== "Tab") return;

    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  type ImportRowError = Extract<ImportRowResult, { status: "error" }>;
  const successCount = results.filter((r) => r.status === "success").length;
  const errorsByReason: Record<ImportErrorReason, ImportRowError[]> = {
    missing_fields: [],
    duplicate_in_batch: [],
    duplicate_existing: [],
  };
  for (const result of results) {
    if (result.status === "error") errorsByReason[result.reason].push(result);
  }

  return (
    <>
      <Button ref={triggerRef} variant="secondary" onClick={openForm}>
        Import CSV
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(5, 6, 10, 0.72)", padding: spacing.lg }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onKeyDown={handleOverlayKeyDown}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="import-students-heading"
              className="w-full"
              style={{ maxWidth: "560px" }}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Card style={{ maxHeight: "85vh", overflowY: "auto" }}>
                {step === "select" && (
                  <div>
                    <h2
                      id="import-students-heading"
                      className="text-lg font-semibold"
                      style={{ marginBottom: spacing.sm, color: darkTheme.text.primary }}
                    >
                      Import students from CSV
                    </h2>
                    <p className="text-sm" style={{ color: darkTheme.text.secondary, marginBottom: spacing.md }}>
                      The file needs a header row with these columns (any order, extra columns are
                      ignored): <strong>firstName</strong>, <strong>lastName</strong>,{" "}
                      <strong>grade</strong>, <strong>guardianName</strong>,{" "}
                      <strong>guardianPhone</strong>.
                    </p>

                    <div className="flex flex-col" style={{ gap: spacing.xs }}>
                      <label
                        htmlFor="student-csv-input"
                        className="text-sm font-medium"
                        style={{ color: darkTheme.text.secondary }}
                      >
                        CSV file
                      </label>
                      <input
                        ref={fileInputRef}
                        id="student-csv-input"
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        aria-describedby={selectError ? "student-csv-error" : undefined}
                        aria-invalid={Boolean(selectError)}
                        className="text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          borderRadius: radius.md,
                          padding: spacing.sm,
                          border: `1px solid ${selectError ? colors.error[500] : darkTheme.surface.inputBorder}`,
                          backgroundColor: darkTheme.surface.input,
                          color: darkTheme.text.primary,
                          fontFamily: typography.fontFamily.serif,
                        }}
                      />
                      {selectError && (
                        <span id="student-csv-error" role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                          {selectError}
                        </span>
                      )}
                    </div>

                    <div className="flex" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                      <Button variant="ghost" type="button" onClick={closeForm}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {step === "preview" && (
                  <div>
                    <h2
                      ref={previewHeadingRef}
                      tabIndex={-1}
                      id="import-students-heading"
                      className="text-lg font-semibold focus:outline focus:outline-2 focus:outline-offset-2"
                      style={{ marginBottom: spacing.xs, color: darkTheme.text.primary, outlineColor: colors.primary[400] }}
                    >
                      Preview: {fileName}
                    </h2>
                    <p className="text-sm" style={{ color: darkTheme.text.secondary, marginBottom: spacing.md }}>
                      {rows.length} row{rows.length === 1 ? "" : "s"} found — {validRows.length} valid,{" "}
                      {invalidRows.length} invalid (skipped).
                    </p>

                    <div
                      style={{
                        maxHeight: "280px",
                        overflowY: "auto",
                        border: `1px solid ${darkTheme.surface.cardBorder}`,
                        borderRadius: radius.md,
                      }}
                    >
                      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                        <caption className="sr-only">Parsed student rows from the CSV file</caption>
                        <thead>
                          <tr>
                            {["Name", "Grade", "Guardian", "Status"].map((heading) => (
                              <th
                                key={heading}
                                scope="col"
                                className="text-left font-medium"
                                style={{
                                  padding: spacing.sm,
                                  color: darkTheme.text.secondary,
                                  borderBottom: `1px solid ${darkTheme.surface.cardBorder}`,
                                  position: "sticky",
                                  top: 0,
                                  backgroundColor: darkTheme.surface.card,
                                }}
                              >
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const textColor = row.isValid ? darkTheme.text.primary : darkTheme.text.muted;
                            const secondaryColor = row.isValid ? darkTheme.text.secondary : darkTheme.text.muted;
                            return (
                              <tr
                                key={row.rowNumber}
                                style={{
                                  backgroundColor: row.isValid ? "transparent" : "rgba(255, 255, 255, 0.03)",
                                }}
                              >
                                <td style={{ padding: spacing.sm, color: textColor }}>
                                  {row.values.firstName || <span style={{ color: darkTheme.text.muted }}>—</span>}{" "}
                                  {row.values.lastName}
                                </td>
                                <td style={{ padding: spacing.sm, color: secondaryColor }}>
                                  {row.values.grade || <span style={{ color: darkTheme.text.muted }}>—</span>}
                                </td>
                                <td style={{ padding: spacing.sm, color: secondaryColor }}>
                                  {row.values.guardianName || <span style={{ color: darkTheme.text.muted }}>—</span>}
                                  {row.values.guardianPhone ? ` · ${row.values.guardianPhone}` : ""}
                                </td>
                                <td style={{ padding: spacing.sm }}>
                                  {row.isValid ? (
                                    <span className="text-xs font-medium" style={{ color: colors.success[500] }}>
                                      Valid
                                    </span>
                                  ) : (
                                    <span className="text-xs font-medium" style={{ color: colors.error[500] }}>
                                      Invalid: {row.reason}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {submitError && (
                      <p role="alert" style={{ color: colors.error[500], marginTop: spacing.md }}>
                        {submitError}
                      </p>
                    )}

                    <div className="flex flex-wrap" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                      <Button
                        type="button"
                        onClick={handleImport}
                        disabled={isImporting || validRows.length === 0}
                      >
                        {isImporting
                          ? "Importing..."
                          : validRows.length === 0
                            ? "No valid rows to import"
                            : `Import ${validRows.length} student${validRows.length === 1 ? "" : "s"}`}
                      </Button>
                      <Button variant="ghost" type="button" onClick={backToSelect} disabled={isImporting}>
                        Choose a different file
                      </Button>
                      <Button variant="ghost" type="button" onClick={closeForm} disabled={isImporting}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {step === "results" && (
                  <div>
                    <h2
                      ref={resultsHeadingRef}
                      tabIndex={-1}
                      id="import-students-heading"
                      className="text-lg font-semibold focus:outline focus:outline-2 focus:outline-offset-2"
                      style={{ marginBottom: spacing.md, color: darkTheme.text.primary, outlineColor: colors.primary[400] }}
                    >
                      Import complete
                    </h2>

                    <div className="flex flex-col" style={{ gap: spacing.sm }}>
                      <p className="text-sm" style={{ color: colors.success[500] }}>
                        {successCount} student{successCount === 1 ? "" : "s"} added.
                      </p>

                      {(Object.keys(errorsByReason) as ImportErrorReason[]).map((reason) => {
                        const group = errorsByReason[reason];
                        if (group.length === 0) return null;
                        return (
                          <div key={reason}>
                            <p className="text-sm font-medium" style={{ color: colors.error[500] }}>
                              {group.length} {REASON_LABELS[reason].toLowerCase()}
                            </p>
                            <ul style={{ margin: 0, paddingLeft: spacing.lg }}>
                              {group.map((result, i) => (
                                <li key={i} className="text-sm" style={{ color: darkTheme.text.secondary }}>
                                  {result.row.firstName} {result.row.lastName} — {result.message}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}

                      {invalidRows.length > 0 && (
                        <p className="text-sm" style={{ color: darkTheme.text.muted }}>
                          {invalidRows.length} additional row{invalidRows.length === 1 ? "" : "s"} skipped
                          before import due to missing required columns.
                        </p>
                      )}
                    </div>

                    <div className="flex" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                      <Button type="button" onClick={closeForm}>
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
