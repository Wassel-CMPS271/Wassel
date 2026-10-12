"use client";

import { useCallback, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { addHoliday, getHolidays, type Holiday, type NewHoliday } from "@/lib/api/holidays";
import { HalfDaysSection } from "./HalfDaysSection";
import { HolidayForm } from "./HolidayForm";
import { HolidayListItem } from "./HolidayListItem";
import { HolidayListSkeleton } from "./HolidayListSkeleton";
import { Button } from "@/components/ui/Button";
import { CalendarIcon } from "@/components/ui/icons";
import { ToastViewport, useToastQueue } from "@/components/ui/Toast";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

export default function HolidayCalendarPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const { toasts, pushToast } = useToastQueue();

  const loadHolidays = useCallback(async () => {
    setIsLoading(true);
    try {
      setHolidays(await getHolidays());
      setLoadError(undefined);
    } catch {
      setLoadError("Couldn't load the holidays. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  // Errors propagate to the form, which shows them next to the field.
  async function handleAdd(data: NewHoliday) {
    const holiday = await addHoliday(data);
    // The API returns holidays earliest first; keep the same order locally.
    setHolidays((prev) => [...prev, holiday].sort((a, b) => a.date.localeCompare(b.date)));
    pushToast(`${holiday.name} added to the calendar.`);
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto flex flex-col"
        style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "768px" }}
      >
        <header>
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: colors.accent[300], marginBottom: spacing.xs }}
          >
            School settings
          </p>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            School calendar
          </h1>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Add the days school is closed and the days it ends early, so routes are planned
            around them.
          </p>
        </header>

        <HolidayForm onAdd={handleAdd} />

        <section aria-labelledby="holiday-list-heading">
          <h2
            id="holiday-list-heading"
            className="text-lg font-semibold"
            style={{ color: darkTheme.text.primary, marginBottom: spacing.sm }}
          >
            Holidays
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
                Loading holidays…
              </span>
              <HolidayListSkeleton />
            </>
          )}

          {loadError && (
            <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
              <p role="alert" style={{ color: colors.error[500] }}>
                {loadError}
              </p>
              <Button variant="secondary" onClick={loadHolidays}>
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !loadError && holidays.length === 0 && (
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
                No holidays yet
              </p>
              <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: "320px" }}>
                Add the first holiday using the form above.
              </p>
            </div>
          )}

          {!isLoading && !loadError && holidays.length > 0 && (
            <ul
              role="list"
              className="flex flex-col"
              style={{ gap: spacing.sm, padding: 0, margin: 0 }}
            >
              {holidays.map((holiday) => (
                <HolidayListItem key={holiday.id} holiday={holiday} />
              ))}
            </ul>
          )}
        </section>

        <HalfDaysSection pushToast={pushToast} />
      </main>

      <ToastViewport toasts={toasts} />
    </MotionConfig>
  );
}
