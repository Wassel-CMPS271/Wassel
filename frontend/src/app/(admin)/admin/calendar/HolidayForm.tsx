"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ApiValidationError } from "@/lib/api/errors";
import type { NewHoliday } from "@/lib/api/holidays";
import { colors, darkTheme, spacing } from "@/styles/tokens";

interface FormErrors {
  date?: string;
  name?: string;
}

const NAME_MAX_LENGTH = 100;

interface HolidayFormProps {
  onAdd: (data: NewHoliday) => Promise<void>;
}

export function HolidayForm({ onAdd }: HolidayFormProps) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!date) next.date = "Date is required.";
    if (!name.trim()) next.name = "Holiday name is required.";
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError(undefined);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onAdd({ date, name: name.trim() });
      setDate("");
      setName("");
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(error.errors);
      } else {
        setFormError("Couldn't add the holiday. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate aria-labelledby="add-holiday-heading">
        <h2
          id="add-holiday-heading"
          className="text-lg font-semibold"
          style={{ marginBottom: spacing.md, color: darkTheme.text.primary }}
        >
          Add holiday
        </h2>
        <div className="flex flex-col sm:flex-row" style={{ gap: spacing.md }}>
          <div className="sm:w-56 sm:flex-shrink-0">
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              error={errors.date}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <Input
              label="Holiday name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={errors.name}
              placeholder="e.g. Independence Day"
              maxLength={NAME_MAX_LENGTH}
              autoComplete="off"
              className="w-full"
            />
          </div>
        </div>
        {formError && (
          <p
            role="alert"
            className="text-sm"
            style={{ marginTop: spacing.md, color: colors.error[500] }}
          >
            {formError}
          </p>
        )}
        <div style={{ marginTop: spacing.md }}>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add holiday"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
