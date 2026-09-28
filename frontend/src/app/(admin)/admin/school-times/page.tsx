"use client";

import { useCallback, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import {
  getSchoolTimes,
  saveSchoolTimes,
  type NewSchoolTimes,
  type SchoolTimes,
} from "@/lib/api/schoolTimes";
import { SchoolTimesForm } from "./SchoolTimesForm";
import { SchoolTimesSkeleton } from "./SchoolTimesSkeleton";
import { Button } from "@/components/ui/Button";
import { ToastViewport, useToastQueue } from "@/components/ui/Toast";
import { colors, darkTheme, spacing } from "@/styles/tokens";

export default function SchoolTimesPage() {
  const [times, setTimes] = useState<SchoolTimes | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const { toasts, pushToast } = useToastQueue();

  const loadTimes = useCallback(async () => {
    setIsLoading(true);
    try {
      setTimes(await getSchoolTimes());
      setLoadError(undefined);
    } catch {
      setLoadError("Couldn't load the school times. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTimes();
  }, [loadTimes]);

  // Errors propagate to the form, which shows them next to the field.
  async function handleSave(data: NewSchoolTimes) {
    setTimes(await saveSchoolTimes(data));
    pushToast("School times saved.");
  }

  const isUnset = times !== undefined && times.arrivalTime === null && times.dismissalTime === null;

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
            School times
          </h1>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Set when students arrive at school and when they are dismissed.
          </p>
        </header>

        {isLoading && (
          <>
            <span className="sr-only" role="status">
              Loading school times…
            </span>
            <SchoolTimesSkeleton />
          </>
        )}

        {loadError && (
          <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
            <p role="alert" style={{ color: colors.error[500] }}>
              {loadError}
            </p>
            <Button variant="secondary" onClick={loadTimes}>
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !loadError && times && (
          <>
            {isUnset && (
              <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
                No times are set yet. Choose both below and save.
              </p>
            )}
            <SchoolTimesForm initial={times} onSave={handleSave} />
          </>
        )}
      </main>

      <ToastViewport toasts={toasts} />
    </MotionConfig>
  );
}
