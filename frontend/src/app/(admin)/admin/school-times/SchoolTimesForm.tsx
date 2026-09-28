"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ApiValidationError } from "@/lib/api/schoolTimes";
import type { NewSchoolTimes, SchoolTimes } from "@/lib/api/schoolTimes";
import { colors, darkTheme, spacing } from "@/styles/tokens";

interface FormErrors {
  arrivalTime?: string;
  dismissalTime?: string;
}

interface SchoolTimesFormProps {
  initial: SchoolTimes;
  onSave: (data: NewSchoolTimes) => Promise<void>;
}

export function SchoolTimesForm({ initial, onSave }: SchoolTimesFormProps) {
  const [arrivalTime, setArrivalTime] = useState(initial.arrivalTime ?? "");
  const [dismissalTime, setDismissalTime] = useState(initial.dismissalTime ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!arrivalTime) next.arrivalTime = "Arrival time is required.";
    if (!dismissalTime) {
      next.dismissalTime = "Dismissal time is required.";
    } else if (arrivalTime && dismissalTime <= arrivalTime) {
      next.dismissalTime = "Dismissal time must be after arrival time.";
    }
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
      await onSave({ arrivalTime, dismissalTime });
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(error.errors);
      } else {
        setFormError("Couldn't save the school times. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate aria-labelledby="school-times-heading">
        <h2
          id="school-times-heading"
          className="text-lg font-semibold"
          style={{ marginBottom: spacing.xs, color: darkTheme.text.primary }}
        >
          Daily schedule
        </h2>
        <p
          className="text-sm"
          style={{ marginBottom: spacing.md, color: darkTheme.text.secondary }}
        >
          Route planning treats these as fixed: buses must reach school by the arrival time and
          leave after the dismissal time. Use 24-hour time.
        </p>
        <div className="flex flex-col sm:flex-row" style={{ gap: spacing.md }}>
          <div className="flex-1">
            <Input
              label="Arrival time"
              type="time"
              value={arrivalTime}
              onChange={(event) => setArrivalTime(event.target.value)}
              error={errors.arrivalTime}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <Input
              label="Dismissal time"
              type="time"
              value={dismissalTime}
              onChange={(event) => setDismissalTime(event.target.value)}
              error={errors.dismissalTime}
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
            {isSubmitting ? "Saving..." : "Save times"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
