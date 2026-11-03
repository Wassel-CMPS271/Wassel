"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { DriverIcon } from "@/components/ui/icons";
import type { DriverDay } from "@/lib/api/runs";
// Sample data until SCRUM-233 is merged; see the comment in runs.sample.ts.
import { getDriverTodaySample } from "@/lib/api/runs.sample";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";
import { StopCard } from "./StopCard";
import { StopListSkeleton } from "./StopListSkeleton";
import { currentRun, stopStates } from "./today";

const GENERIC_ERROR = "Something went wrong. Please try again.";

// Tighter page padding on phones, so the cards keep their width. Token values
// go through CSS variables because Tailwind can't see runtime class names.
const pageStyle = {
  "--page-pad-phone": spacing.md,
  "--page-pad": spacing.xl,
  gap: spacing.lg,
  maxWidth: sizing.pageMaxWidth,
} as CSSProperties;

const eyebrowStyle: CSSProperties = { color: colors.accent[300] };

// The driver's Today screen (SCRUM-243): the current run and its stops, with
// the next stop highlighted. Starting/ending a run and confirming students
// are SCRUM-244; maps and call buttons are SCRUM-245.
export default function DriverTodayPage() {
  const [day, setDay] = useState<DriverDay | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setDay(null);
    setLoadFailed(false);
    getDriverTodaySample()
      .then((result) => {
        if (active) setDay(result);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <main
      className="mx-auto w-full flex flex-col p-[var(--page-pad-phone)] sm:p-[var(--page-pad)]"
      style={pageStyle}
    >
      {!day && !loadFailed && (
        <>
          <span className="sr-only" role="status">
            Loading today&apos;s run…
          </span>
          <StopListSkeleton />
        </>
      )}

      {loadFailed && (
        <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            Couldn&apos;t load today&apos;s run
          </h1>
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            {GENERIC_ERROR}
          </p>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {day && <Today day={day} />}
    </main>
  );
}

function Today({ day }: { day: DriverDay }) {
  if (day.dayType === "HOLIDAY") {
    return <EmptyState title="No school today" text="Today is a holiday, so there are no runs." />;
  }
  if (day.runs.length === 0) {
    return (
      <EmptyState
        title="No route today"
        text="You aren't assigned to a route. If that's wrong, contact the head of transportation."
      />
    );
  }

  const run = currentRun(day);
  if (!run) {
    return <EmptyState title="All runs done" text="You've finished every run for today." />;
  }

  const states = stopStates(run);
  const doneCount = states.filter((state) => state === "done").length;
  const skipCount = states.filter((state) => state === "skip").length;
  const hasNext = states.includes("next");

  return (
    <>
      <header className="flex flex-col" style={{ gap: spacing.sm }}>
        <p className="text-xs font-medium uppercase tracking-wider" style={eyebrowStyle}>
          {run.direction === "MORNING" ? "Morning run" : "Afternoon run"}
        </p>
        <h1
          className="text-2xl font-semibold break-words"
          style={{ color: darkTheme.text.primary }}
        >
          {run.route.name}
        </h1>
        <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
          <LicensePlate plateNumber={run.vehicle.plateNumber} />
          <span
            className="flex items-center text-sm"
            style={{ gap: spacing.xs, color: darkTheme.text.secondary }}
          >
            <DriverIcon size={16} />
            {run.driver.firstName} {run.driver.lastName}
          </span>
        </div>
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {doneCount} of {run.stops.length} stops done
          {skipCount > 0 && ` · ${skipCount} to skip`}
        </p>
      </header>

      {!hasNext && run.stops.length > 0 && (
        <p
          role="status"
          className="text-sm font-medium"
          style={{ color: darkTheme.text.secondary }}
        >
          Every stop on this run is done or skipped.
        </p>
      )}

      <ol
        aria-label="Stops"
        className="flex flex-col"
        style={{ gap: spacing.sm, padding: 0, margin: 0 }}
      >
        {run.stops.map((stop, index) => (
          <StopCard key={stop.studentId} stop={stop} state={states[index]} index={index} />
        ))}
      </ol>
    </>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div
      className="flex flex-col items-start text-left"
      style={{
        padding: spacing.xl,
        border: `1px dashed ${darkTheme.surface.cardBorder}`,
        borderRadius: radius.lg,
        backgroundColor: darkTheme.surface.emptyState,
        gap: spacing.sm,
      }}
    >
      <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
        {title}
      </h1>
      <p
        className="text-sm"
        style={{ color: darkTheme.text.muted, maxWidth: sizing.emptyStateText }}
      >
        {text}
      </p>
    </div>
  );
}
