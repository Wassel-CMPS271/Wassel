"use client";

// Sample CSV a caller might paste into a test file to try this flow:
//
//   firstName,lastName,grade,guardianName,guardianPhone
//   Zeina,Fakhoury,Grade 3,Nabil Fakhoury,+961 3 222 111
//   Hadi,"Bou Saab, Jr.",Grade 5,Lina Bou Saab,+961 70 333 222
//   ,Aziz,Grade 2,Samir Aziz,+961 71 444 333
//   Zeina,Fakhoury,Grade 3,Nabil Fakhoury,+961 3 222 111
//
// Column order doesn't matter as long as the header row names each of
// firstName, lastName, grade, guardianName, guardianPhone (extra columns
// are ignored). The row above with no firstName demonstrates a
// missing-field row, and the repeated Zeina/Fakhoury row demonstrates an
// in-file duplicate. Reading the file and its checks live in
// lib/students/importFile.ts; every row is numbered by its line in the file.

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ImportRow, StudentImport } from "@/lib/api/students";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  checkRowLimit,
  problemList,
  readImportFile,
  type ImportProblem,
  type SkippedRow,
} from "@/lib/students/importFile";
import { colors, darkTheme, radius, spacing, typography } from "@/styles/tokens";

type PreviewRow = ImportRow | SkippedRow;

function isSkipped(row: PreviewRow): row is SkippedRow {
  return "errors" in row;
}

// "Row 5 · Rami Aziz — Guardian phone: Use a format like …"
function problemText(problem: ImportProblem): string {
  const head = problem.name ? `Row ${problem.row} · ${problem.name}` : `Row ${problem.row}`;
  const body = problem.messages.join("; ");
  return `${head} — ${problem.kind === "notSent" ? `Not sent: ${body}` : body}`;
}

type Step = "select" | "preview" | "results";

interface ImportStudentsFormProps {
  onImport: (rows: ImportRow[]) => Promise<StudentImport>;
}

export function ImportStudentsForm({ onImport }: ImportStudentsFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [fileName, setFileName] = useState<string | undefined>();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [selectError, setSelectError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [outcome, setOutcome] = useState<StudentImport | undefined>();

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
    setSkipped([]);
    setSelectError(undefined);
    setSubmitError(undefined);
    setIsImporting(false);
    setOutcome(undefined);
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

    // Cleared on every path below, success included: without this, picking
    // the same file again (e.g. after fixing it) fires no change event.
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSelectError("Please choose a .csv file.");
      return;
    }

    try {
      const read = readImportFile(await file.text());
      if (!read.ok) {
        setSelectError(read.error);
        return;
      }
      // The limit counts the rows that would be sent, not the lines of the file.
      const limitError = checkRowLimit(read.rows);
      if (limitError) {
        setSelectError(limitError);
        return;
      }
      setSelectError(undefined);
      setFileName(file.name);
      setRows(read.rows);
      setSkipped(read.skipped);
      setStep("preview");
    } catch {
      setSelectError("Couldn't read that file. Please try again.");
    }
  }

  function backToSelect() {
    setStep("select");
    setRows([]);
    setSkipped([]);
    setSubmitError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const previewRows: PreviewRow[] = [...rows, ...skipped].sort((a, b) => a.row - b.row);

  async function handleImport() {
    if (rows.length === 0) return;
    setIsImporting(true);
    setSubmitError(undefined);
    try {
      // Only the rows that passed the preview's checks are sent.
      setOutcome(await onImport(rows));
      setStep("results");
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  // Escape closes the dialog, except while importing (Cancel is disabled then
  // too, so the results never land in a closed form); Tab is trapped to the
  // focusable elements inside the panel so focus can't leave it while it's open.
  function handleOverlayKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isImporting) closeForm();
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

  const problems = outcome ? problemList(rows, outcome.result.results, skipped, outcome.notSent) : [];
  const createdCount = outcome?.result.created ?? 0;
  const rejectedCount = outcome?.result.rejected ?? 0;
  const notSentCount = outcome?.notSent.length ?? 0;

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
                {/* Mounted for every step, so its text change is announced; a
                    live region that appears together with its text often isn't. */}
                <p role="status" className="sr-only">
                  {outcome
                    ? `${createdCount} student${createdCount === 1 ? "" : "s"} added. ${problems.length} row${problems.length === 1 ? "" : "s"} not imported.`
                    : ""}
                </p>

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
                      ignored):{" "}
                      {IMPORT_FIELDS.map((field, i) => (
                        <span key={field}>
                          <strong>{field}</strong>
                          {i < IMPORT_FIELDS.length - 1 ? ", " : "."}
                        </span>
                      ))}{" "}
                      Up to {MAX_IMPORT_ROWS} students at a time.
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
                      {previewRows.length} row{previewRows.length === 1 ? "" : "s"} found — {rows.length} valid,{" "}
                      {skipped.length} invalid (skipped).
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
                            {["Row", "Name", "Grade", "Guardian", "Status"].map((heading) => (
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
                          {previewRows.map((row) => {
                            const invalid = isSkipped(row);
                            const textColor = invalid ? darkTheme.text.muted : darkTheme.text.primary;
                            const secondaryColor = invalid ? darkTheme.text.muted : darkTheme.text.secondary;
                            // The parser keeps cells as written; trim them for display only.
                            const firstName = row.firstName.trim();
                            const grade = row.grade.trim();
                            const guardianName = row.guardianName.trim();
                            const guardianPhone = row.guardianPhone.trim();
                            return (
                              <tr
                                key={row.row}
                                style={{
                                  backgroundColor: invalid ? "rgba(255, 255, 255, 0.03)" : "transparent",
                                }}
                              >
                                <td className="whitespace-nowrap" style={{ padding: spacing.sm, color: secondaryColor }}>
                                  Row {row.row}
                                </td>
                                <td style={{ padding: spacing.sm, color: textColor }}>
                                  {firstName || <span style={{ color: darkTheme.text.muted }}>—</span>}{" "}
                                  {row.lastName.trim()}
                                </td>
                                <td style={{ padding: spacing.sm, color: secondaryColor }}>
                                  {grade || <span style={{ color: darkTheme.text.muted }}>—</span>}
                                </td>
                                <td style={{ padding: spacing.sm, color: secondaryColor }}>
                                  {guardianName || <span style={{ color: darkTheme.text.muted }}>—</span>}
                                  {guardianPhone ? ` · ${guardianPhone}` : ""}
                                </td>
                                <td style={{ padding: spacing.sm }}>
                                  {invalid ? (
                                    <span className="text-xs font-medium" style={{ color: colors.error[500] }}>
                                      Invalid: {Object.values(row.errors).join("; ")}
                                    </span>
                                  ) : (
                                    <span className="text-xs font-medium" style={{ color: colors.success[500] }}>
                                      Valid
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
                      <p role="alert" className="text-sm" style={{ color: colors.error[500], marginTop: spacing.md }}>
                        {submitError}
                      </p>
                    )}

                    <div className="flex flex-wrap" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                      <Button
                        type="button"
                        onClick={handleImport}
                        disabled={isImporting || rows.length === 0}
                      >
                        {isImporting
                          ? "Importing..."
                          : rows.length === 0
                            ? "No valid rows to import"
                            : `Import ${rows.length} student${rows.length === 1 ? "" : "s"}`}
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
                        {createdCount} student{createdCount === 1 ? "" : "s"} added.
                      </p>
                      <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
                        Created: {createdCount} · Rejected: {rejectedCount} · Skipped: {skipped.length} · Not sent:{" "}
                        {notSentCount}
                      </p>

                      {notSentCount > 0 && (
                        <p className="text-sm" style={{ color: colors.warning[500] }}>
                          The import stopped before every row was sent. A row marked as possibly saved may
                          already be in the roster, so check the roster before importing this file again.
                        </p>
                      )}

                      {problems.length > 0 && (
                        <div>
                          <h3
                            id="import-problems-heading"
                            className="text-sm font-medium"
                            style={{ color: colors.error[500] }}
                          >
                            Rows not imported ({problems.length})
                          </h3>
                          <ul aria-labelledby="import-problems-heading" style={{ margin: 0, paddingLeft: spacing.lg }}>
                            {problems.map((problem) => (
                              <li key={problem.row} className="text-sm" style={{ color: darkTheme.text.secondary }}>
                                {problemText(problem)}
                              </li>
                            ))}
                          </ul>
                        </div>
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
