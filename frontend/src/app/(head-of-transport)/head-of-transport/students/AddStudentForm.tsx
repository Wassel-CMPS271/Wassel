"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import type { NewStudent } from "@/lib/api/students";
import { colors, darkTheme, spacing } from "@/styles/tokens";

interface FormErrors {
  firstName?: string;
  lastName?: string;
  grade?: string;
  guardianName?: string;
  guardianPhone?: string;
  form?: string;
}

// Lebanese phone format: +961, then either a 1-digit old prefix or a
// 2-digit mobile prefix, then 3+3 digits (e.g. "+961 3 123 456" or
// "+961 70 234 567").
const LEBANESE_PHONE_PATTERN = /^\+961 \d{1,2} \d{3} \d{3}$/;

interface AddStudentFormProps {
  onAdd: (data: NewStudent) => Promise<void>;
}

export function AddStudentForm({ onAdd }: AddStudentFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (isOpen) firstFieldRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  function resetFields() {
    setFirstName("");
    setLastName("");
    setGrade("");
    setGuardianName("");
    setGuardianPhone("");
    setErrors({});
  }

  function openForm() {
    setIsOpen(true);
  }

  function closeForm() {
    shouldRestoreFocusRef.current = true;
    setIsOpen(false);
    resetFields();
  }

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";
    if (!grade.trim()) next.grade = "Grade is required.";
    if (!guardianName.trim()) next.guardianName = "Guardian name is required.";

    const trimmedPhone = guardianPhone.trim();
    if (!trimmedPhone) {
      next.guardianPhone = "Guardian phone is required.";
    } else if (!LEBANESE_PHONE_PATTERN.test(trimmedPhone)) {
      next.guardianPhone = 'Use a format like "+961 3 123 456" or "+961 70 234 567".';
    }

    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onAdd({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        grade: grade.trim(),
        guardianName: guardianName.trim(),
        guardianPhone: guardianPhone.trim(),
      });
      closeForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setErrors((prev) => ({ ...prev, form: message }));
    } finally {
      setIsSubmitting(false);
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

  return (
    <>
      <Button ref={triggerRef} variant="primary" onClick={openForm}>
        Add student
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
              aria-labelledby="add-student-heading"
              className="w-full"
              style={{ maxWidth: "420px" }}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Card>
                <form onSubmit={handleSubmit} noValidate aria-labelledby="add-student-heading">
                  <h2
                    id="add-student-heading"
                    className="text-lg font-semibold"
                    style={{ marginBottom: spacing.md, color: darkTheme.text.primary }}
                  >
                    Add student
                  </h2>
                  <div className="flex flex-col" style={{ gap: spacing.md }}>
                    <Input
                      ref={firstFieldRef}
                      label="First name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      error={errors.firstName}
                      autoComplete="given-name"
                    />
                    <Input
                      label="Last name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      error={errors.lastName}
                      autoComplete="family-name"
                    />
                    <Input
                      label="Grade"
                      value={grade}
                      onChange={(event) => setGrade(event.target.value)}
                      error={errors.grade}
                      placeholder="e.g. Grade 4"
                    />
                    <Input
                      label="Guardian name"
                      value={guardianName}
                      onChange={(event) => setGuardianName(event.target.value)}
                      error={errors.guardianName}
                      autoComplete="name"
                    />
                    <Input
                      label="Guardian phone"
                      value={guardianPhone}
                      onChange={(event) => setGuardianPhone(event.target.value)}
                      error={errors.guardianPhone}
                      placeholder="e.g. +961 3 123 456"
                      autoComplete="tel"
                    />
                  </div>

                  {errors.form && (
                    <p role="alert" style={{ color: colors.error[500], marginTop: spacing.md }}>
                      {errors.form}
                    </p>
                  )}

                  <div className="flex" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Adding..." : "Add student"}
                    </Button>
                    <Button variant="ghost" type="button" onClick={closeForm} disabled={isSubmitting}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
