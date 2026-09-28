"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import {
  addStudent,
  getStudents,
  importStudents,
  type ImportRowResult,
  type NewStudent,
  type Student,
} from "@/lib/api/students";
import { AddStudentForm } from "./AddStudentForm";
import { ImportStudentsForm } from "./ImportStudentsForm";
import { StudentListItem } from "./StudentListItem";
import { StudentListSkeleton } from "./StudentListSkeleton";
import { ToastViewport, useToastQueue } from "@/components/ui/Toast";
import { StudentIcon } from "@/components/ui/icons";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const { toasts, pushToast } = useToastQueue();

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getStudents();
      setStudents(data);
      setLoadError(undefined);
    } catch {
      const message = "Couldn't load students. Please try again.";
      setLoadError(message);
      pushToast(message);
    } finally {
      setIsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  async function handleAdd(data: NewStudent) {
    const student = await addStudent(data);
    setStudents((prev) => [...prev, student]);
    pushToast(`${student.firstName} ${student.lastName} added.`);
  }

  async function handleImport(rows: NewStudent[]): Promise<ImportRowResult[]> {
    const results = await importStudents(rows);
    const added = results
      .filter((result): result is Extract<ImportRowResult, { status: "success" }> => result.status === "success")
      .map((result) => result.student);
    if (added.length > 0) {
      setStudents((prev) => [...prev, ...added]);
      pushToast(`${added.length} student${added.length === 1 ? "" : "s"} imported.`);
    }
    return results;
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto flex flex-col"
        style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "768px" }}
      >
        <header className="flex items-start justify-between flex-wrap" style={{ gap: spacing.md }}>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
              Students
            </h1>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              Maintain the student list and each guardian&apos;s contact details.
            </p>
          </div>
          <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
            <ImportStudentsForm onImport={handleImport} />
            <AddStudentForm onAdd={handleAdd} />
          </div>
        </header>

        <section aria-labelledby="student-list-heading">
          <div className="flex items-center" style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center flex-shrink-0 rounded-full"
              style={{ width: "24px", height: "24px", backgroundColor: "rgba(18, 183, 106, 0.14)" }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2" fill={colors.success[500]} />
                <circle cx="7" cy="7" r="5" stroke={colors.success[500]} strokeOpacity="0.5" fill="none" />
              </svg>
            </span>
            <h2
              id="student-list-heading"
              className="text-lg font-semibold"
              style={{ color: darkTheme.text.primary }}
            >
              Roster
            </h2>
          </div>
          <div
            aria-hidden="true"
            style={{
              height: "1px",
              background: `linear-gradient(90deg, ${darkTheme.surface.cardBorder}, transparent)`,
              marginBottom: spacing.md,
            }}
          />

          {isLoading && (
            <>
              <span className="sr-only" role="status">
                Loading students…
              </span>
              <StudentListSkeleton />
            </>
          )}

          {loadError && (
            <p role="alert" style={{ color: colors.error[500] }}>
              {loadError}
            </p>
          )}

          {!isLoading && !loadError && students.length === 0 && (
            <div
              className="flex flex-col items-center text-center"
              style={{
                padding: spacing.xl,
                border: `1px dashed ${darkTheme.surface.cardBorder}`,
                borderRadius: radius.lg,
                backgroundColor: "rgba(20, 22, 29, 0.5)",
              }}
            >
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center"
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: radius.full,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: darkTheme.text.muted,
                  marginBottom: spacing.md,
                }}
              >
                <StudentIcon size={24} />
              </span>
              <p
                className="text-sm font-medium"
                style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
              >
                No students yet
              </p>
              <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: "320px" }}>
                Students will show up here once they&apos;ve been added.
              </p>
            </div>
          )}

          {!isLoading && !loadError && students.length > 0 && (
            <ul
              role="list"
              className="flex flex-col"
              style={{ gap: spacing.sm, padding: 0, margin: 0 }}
            >
              <AnimatePresence initial={false}>
                {students.map((student) => (
                  <StudentListItem key={student.id} student={student} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </main>

      <ToastViewport toasts={toasts} />
    </MotionConfig>
  );
}
