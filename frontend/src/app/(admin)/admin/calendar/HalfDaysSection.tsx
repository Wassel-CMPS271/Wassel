"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CalendarIcon } from "@/components/ui/icons";
import { ApiValidationError } from "@/lib/api/errors";
import { addHalfDay, getHalfDays, type HalfDay } from "@/lib/api/halfDays";
import { HalfDayListItem } from "./HalfDayListItem";
import { HolidayListSkeleton } from "./HolidayListSkeleton";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

interface HalfDaysSectionProps {
  pushToast: (message: string) => void;
}

// Days school runs but ends early. Owns its own data and form; the page only
// passes the toast queue so messages appear in one place.
export function HalfDaysSection({ pushToast }: HalfDaysSectionProps) {
  const [halfDays, setHalfDays] = useState<HalfDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadHalfDays = useCallback(async () => {
    setIsLoading(true);
    try {
      setHalfDays(await getHalfDays());
      setLoadError(undefined);
    } catch {
      setLoadError("Couldn't load the half-days. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHalfDays();
  }, [loadHalfDays]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    if (!date) {
      setDateError("Date is required.");
      return;
    }
    setDateError(undefined);

    setIsSubmitting(true);
    try {
      const halfDay = await addHalfDay({ date });
      // The API returns half-days earliest first; keep the same order locally.
      setHalfDays((prev) => [...prev, halfDay].sort((a, b) => a.date.localeCompare(b.date)));
      setDate("");
      pushToast("Half-day added to the calendar.");
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setDateError(error.errors.date);
      } else {
        setFormError("Couldn't mark the half-day. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Card>
        <form onSubmit={handleSubmit} noValidate aria-labelledby="add-half-day-heading">
          <h2
            id="add-half-day-heading"
            className="text-lg font-semibold"
            style={{ marginBottom: spacing.xs, color: darkTheme.text.primary }}
          >
            Mark half-day
          </h2>
          <p
            className="text-sm"
            style={{ marginBottom: spacing.md, color: darkTheme.text.secondary }}
          >
            A half-day is a day school runs but ends early. A holiday can&apos;t also be a
            half-day.
          </p>
          <div className="sm:w-56">
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              error={dateError}
              className="w-full"
            />
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
              {isSubmitting ? "Marking..." : "Mark half-day"}
            </Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="half-day-list-heading">
        <h2
          id="half-day-list-heading"
          className="text-lg font-semibold"
          style={{ color: darkTheme.text.primary, marginBottom: spacing.sm }}
        >
          Half-days
        </h2>
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
              Loading half-days…
            </span>
            <HolidayListSkeleton />
          </>
        )}

        {loadError && (
          <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
            <p role="alert" style={{ color: colors.error[500] }}>
              {loadError}
            </p>
            <Button variant="secondary" onClick={loadHalfDays}>
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !loadError && halfDays.length === 0 && (
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
              <CalendarIcon size={24} />
            </span>
            <p
              className="text-sm font-medium"
              style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
            >
              No half-days yet
            </p>
            <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: "320px" }}>
              Mark the first half-day using the form above.
            </p>
          </div>
        )}

        {!isLoading && !loadError && halfDays.length > 0 && (
          <ul
            role="list"
            className="flex flex-col"
            style={{ gap: spacing.sm, padding: 0, margin: 0 }}
          >
            {halfDays.map((halfDay) => (
              <HalfDayListItem key={halfDay.id} halfDay={halfDay} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
