"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import type { Student } from "@/lib/api/students";
import { darkTheme, spacing } from "@/styles/tokens";

interface Props {
  student: Student;
  onSave: (studentId: string, address: string) => Promise<void>;
}

export function EditStudentAddressForm({ student, onSave }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [address, setAddress] = useState(student.address ?? "");
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const headingId = `student-${student.id}-address-heading`;

  useEffect(() => {
    if (isOpen) addressRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  function open() {
    setAddress(student.address ?? "");
    setError(undefined);
    setIsOpen(true);
  }

  function close() {
    restoreFocus.current = true;
    setIsOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) {
      setError("Pickup address is required.");
      return;
    }
    setError(undefined);
    setIsSaving(true);
    try {
      await onSave(student.id, trimmed);
      close();
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setError(err.errors.address || "The address was rejected. Check it and try again.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("Your session has expired. Please sign in again.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("You do not have permission to change this address.");
      } else {
        setError("The address could not be saved. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (isSaving) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
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
      <Button
        ref={triggerRef}
        variant="secondary"
        onClick={open}
        aria-label={`Edit pickup address for ${student.firstName} ${student.lastName}`}
      >
        Edit address
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
            onKeyDown={handleKeys}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              className="w-full"
              style={{ maxWidth: "420px" }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Card>
                <form onSubmit={submit} noValidate>
                  <h2 id={headingId} className="text-lg font-semibold" style={{ color: darkTheme.text.primary, marginBottom: spacing.md }}>
                    Edit pickup address
                  </h2>
                  <Input
                    ref={addressRef}
                    label="Pickup address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    error={error}
                    autoComplete="street-address"
                    placeholder="Street, building, area, city"
                  />
                  <div className="flex" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                    <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save address"}</Button>
                    <Button type="button" variant="ghost" onClick={close} disabled={isSaving}>Cancel</Button>
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
