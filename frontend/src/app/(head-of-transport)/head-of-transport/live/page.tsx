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
import { activeRunViews, formatClockTime } from "./liveRuns";
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

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

interface UpdatedAt {
  runs: Date | null;
  locations: Date | null;
}

interface ErrorParts {
  // Fixed wording: never includes a timestamp, so the live region's text never changes while a poll keeps
  // failing with nothing new to say (a frozen "last read" time sitting beside it doesn't count as new).
  headline: string;
  // "Showing ... from HH:mm:ss", rendered outside the live region entirely (see the JSX below) so it can
  // update — or simply exist — without ever causing a re-announcement.
  timestamp: string | null;
}

// A failed poll names what is out of date, with the time of that read: the runs (driver, state) and the
// positions (freshness, estimate) are read separately, so one can be fresh while the other is not.
function failedParts(sources: readonly ("runs" | "locations")[], updatedAt: UpdatedAt): ErrorParts {
  const runsAt = updatedAt.runs && formatClockTime(updatedAt.runs);
  const positionsAt = updatedAt.locations && formatClockTime(updatedAt.locations);
  if (sources.includes("runs")) {
    if (!runsAt) return { headline: "Couldn't load live runs.", timestamp: null };
    if (!sources.includes("locations")) {
      return { headline: "Couldn't refresh the runs.", timestamp: `Showing runs from ${runsAt}.` };
    }
    return {
      headline: "Couldn't refresh.",
      timestamp: positionsAt
        ? `Showing runs from ${runsAt} and bus positions from ${positionsAt}.`
        : `Showing runs from ${runsAt}; bus positions couldn't be loaded.`,
    };
  }
  return positionsAt
    ? { headline: "Couldn't refresh bus positions.", timestamp: `Showing positions from ${positionsAt}.` }
    : { headline: "Couldn't load bus positions.", timestamp: null };
}

function errorParts(error: LivePollingError, updatedAt: UpdatedAt): ErrorParts {
  switch (error.kind) {
    case "forbidden":
      return { headline: "You don't have permission to view live runs.", timestamp: null };
    case "unauthorized":
      return { headline: "Your session couldn't be confirmed. Please try again.", timestamp: null };
    case "expired":
      return { headline: "Your session has expired. Taking you to sign in…", timestamp: null };
    case "failed":
      return failedParts(error.sources, updatedAt);
  }
}

export default function LiveRunsPage() {
  const polling = useLivePolling();
  const [reassigningRun, setReassigningRun] = useState<RunSummary | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Focus falls back here when the thing that opened the dialog is gone by the time it closes (the run
  // finished and its row, with its "Reassign driver" button, unmounted while the dialog was still open).
  const mainRef = useRef<HTMLElement | null>(null);

  function openReassign(run: RunSummary) {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setReassigningRun(run);
  }

  function closeReassign() {
    setReassigningRun(null);
    const target = restoreFocusRef.current;
    if (target && document.body.contains(target)) {
      target.focus();
    } else {
      mainRef.current?.focus();
    }
    restoreFocusRef.current = null;
  }

  const hasData = polling.runsDay !== null;
  const views = polling.runsDay ? activeRunViews(polling.runsDay.runs, polling.locations) : [];
  const lastUpdated = laterOf(polling.runsUpdatedAt, polling.locationsUpdatedAt);
  const updatedAt = { runs: polling.runsUpdatedAt, locations: polling.locationsUpdatedAt };
  // While /runs/locations is failing, every row's freshness and estimate are that old answer's.
  const locationsFailing = polling.error?.kind === "failed" && polling.error.sources.includes("locations");
  const positionsNotRefreshingSince = locationsFailing ? polling.locationsUpdatedAt : null;
  const errorInfo = polling.error ? errorParts(polling.error, updatedAt) : null;
  // A "failed" poll with data already on screen is informational, not urgent: role="status" so it doesn't
  // interrupt. First-load failure, 403, 401 and expiry have nothing else to show, so they stay role="alert".
  const errorIsAlert = polling.error ? polling.error.kind !== "failed" || !hasData : false;

  return (
    <MotionConfig reducedMotion="user">
      <main
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto flex flex-col"
        style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "1024px" }}
      >
        <header>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            Live runs
          </h1>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {polling.runsDay ? formatDate(polling.runsDay.date) : "Today's runs in progress."}
            {lastUpdated && ` · Last updated ${formatClockTime(lastUpdated)}`}
          </p>
        </header>

        {/* Visually hidden: gives the run list its own heading under "Live runs" (h1), so each row's own
            heading (h3) isn't the first one after it. */}
        <h2 className="sr-only">Runs in progress</h2>

        {!hasData && !polling.error && (
          <p role="status" style={{ color: darkTheme.text.secondary }}>
            Loading live runs…
          </p>
        )}

        {polling.error && errorInfo && (
          <div className="flex items-center flex-wrap" style={{ gap: spacing.sm, color: colors.error[500] }}>
            <span role={errorIsAlert ? "alert" : "status"} className="text-sm">
              {errorInfo.headline}
            </span>
            {errorInfo.timestamp && (
              <span className="text-sm" style={{ color: darkTheme.text.muted }}>
                {errorInfo.timestamp}
              </span>
            )}
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
                  <RunControlRow
                    key={view.run.id}
                    view={view}
                    onReassign={() => openReassign(view.run)}
                    positionsNotRefreshingSince={positionsNotRefreshingSince}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {reassigningRun && (
          <ReassignDriverPanel
            run={reassigningRun}
            refreshRuns={polling.refreshRuns}
            reportUnauthorized={polling.reportUnauthorized}
            onClose={closeReassign}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
