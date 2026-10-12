"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import type { NewDriver } from "@/lib/api/drivers";
import { colors, darkTheme, spacing } from "@/styles/tokens";

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  form?: string;
}

// Lebanese phone format: +961, then either a 1-digit old prefix or a
// 2-digit mobile prefix, then 3+3 digits (e.g. "+961 3 123 456" or
// "+961 70 234 567").
const LEBANESE_PHONE_PATTERN = /^\+961 \d{1,2} \d{3} \d{3}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AddDriverFormProps {
  onAdd: (data: NewDriver) => Promise<void>;
}

export function AddDriverForm({ onAdd }: AddDriverFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
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
    setPhone("");
    setEmail("");
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

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      next.phone = "Phone number is required.";
    } else if (!LEBANESE_PHONE_PATTERN.test(trimmedPhone)) {
      next.phone = 'Use a format like "+961 3 123 456" or "+961 70 234 567".';
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      next.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      next.email = "Enter a valid email address.";
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
        phone: phone.trim(),
        email: email.trim(),
      });
      closeForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      const lower = message.toLowerCase();
      if (lower.includes("email")) {
        setErrors((prev) => ({ ...prev, email: message }));
      } else if (lower.includes("phone")) {
        setErrors((prev) => ({ ...prev, phone: message }));
      } else {
        setErrors((prev) => ({ ...prev, form: message }));
      }
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
        Add driver
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
              aria-labelledby="add-driver-heading"
              className="w-full"
              style={{ maxWidth: "420px" }}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Card>
                <form onSubmit={handleSubmit} noValidate aria-labelledby="add-driver-heading">
                  <h2
                    id="add-driver-heading"
                    className="text-lg font-semibold"
                    style={{ marginBottom: spacing.md, color: darkTheme.text.primary }}
                  >
                    Add driver
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
                      label="Phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      error={errors.phone}
                      placeholder="e.g. +961 3 123 456"
                      autoComplete="tel"
                    />
                    <Input
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      error={errors.email}
                      placeholder="e.g. name@example.com"
                      autoComplete="email"
                    />
                  </div>

                  {errors.form && (
                    <p role="alert" style={{ color: colors.error[500], marginTop: spacing.md }}>
                      {errors.form}
                    </p>
                  )}

                  <div className="flex" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Adding..." : "Add driver"}
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
