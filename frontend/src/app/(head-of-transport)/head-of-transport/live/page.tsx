"use client";

// The live control screen (SCRUM-274): today's runs IN_PROGRESS, with freshness, progress and ETA, polled
// by useLivePolling. A run's "Reassign driver" button opens ReassignDriverPanel. Error handling keeps
// showing the last good data whenever there is some (docs/contracts/runs.md, "a client never needs its own
// clock" — the same spirit applies here: never block the screen on a refresh that merely failed).

import { useRef, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { RunSummary } from "@/lib/api/runs";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";
import { activeRunViews } from "./liveRuns";
import { ReassignDriverPanel } from "./ReassignDriverPanel";
import { RunControlRow } from "./RunControlRow";
import type { LivePollingError } from "./useLivePolling";
import { useLivePolling } from "./useLivePolling";

// "2026-11-16" -> "Monday 16 November 2026". Read as a plain calendar date (UTC) so the viewer's time zone
// can't move it to the day before; written out because the comma toLocaleDateString adds depends on the
// browser's locale data (same approach as the Today screen's formatDate).
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]} ${year}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function errorMessage(error: LivePollingError, hasData: boolean, lastUpdated: Date | null): string {
  switch (error.kind) {
    case "forbidden":
      return "You don't have permission to view live runs.";
    case "unauthorized":
      return "Your session couldn't be confirmed. Please try again.";
    case "expired":
      return "Your session has expired. Taking you to sign in…";
    case "failed":
      return hasData && lastUpdated
        ? `Couldn't refresh. Showing data from ${formatTime(lastUpdated)}.`
        : "Couldn't load live runs.";
  }
}

export default function LiveRunsPage() {
  const polling = useLivePolling();
  const [reassigningRun, setReassigningRun] = useState<RunSummary | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  function openReassign(run: RunSummary) {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setReassigningRun(run);
  }

  function closeReassign() {
    setReassigningRun(null);
    restoreFocusRef.current?.focus();
    restoreFocusRef.current = null;
  }

  const hasData = polling.runsDay !== null;
  const views = polling.runsDay ? activeRunViews(polling.runsDay.runs, polling.locations) : [];
  const lastUpdated = laterOf(polling.runsUpdatedAt, polling.locationsUpdatedAt);

  return (
    <MotionConfig reducedMotion="user">
      <main className="mx-auto flex flex-col" style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "1024px" }}>
        <header>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            Live runs
          </h1>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {polling.runsDay ? formatDate(polling.runsDay.date) : "Today's runs in progress."}
            {lastUpdated && ` · Last updated ${formatTime(lastUpdated)}`}
          </p>
        </header>

        {!hasData && !polling.error && (
          <p role="status" style={{ color: darkTheme.text.secondary }}>
            Loading live runs…
          </p>
        )}

        {polling.error && (
          <div
            role="alert"
            className="flex items-center flex-wrap"
            style={{ gap: spacing.sm, color: colors.error[500] }}
          >
            <span className="text-sm">{errorMessage(polling.error, hasData, lastUpdated)}</span>
            {polling.error.kind !== "expired" && (
              <Button variant="danger" onClick={polling.retry} style={{ minHeight: sizing.tapTarget }}>
                Retry
              </Button>
            )}
          </div>
        )}

        {hasData && polling.runsDay && (
          <>
            {views.length === 0 ? (
              <p style={{ color: darkTheme.text.secondary }}>
                {polling.runsDay.dayType === "HOLIDAY"
                  ? "School is closed today, so no runs are scheduled."
                  : "No runs are in progress right now."}
              </p>
            ) : (
              <ul className="flex flex-col" style={{ gap: spacing.md, padding: 0, margin: 0 }}>
                {views.map((view) => (
                  <RunControlRow key={view.run.id} view={view} onReassign={() => openReassign(view.run)} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {reassigningRun && (
          <ReassignDriverPanel run={reassigningRun} refreshRuns={polling.refreshRuns} onClose={closeReassign} />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
