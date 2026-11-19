"use client";

// One active run on the live control screen (SCRUM-274): route, direction, driver, remaining stops, next
// stop and freshness, plus the "Reassign driver" trigger. Planned time and the live estimate are always
// two separate labelled items — the contract forbids comparing them, so this never prints a combined
// "late" status, and when there is no estimate it says why in plain words instead of guessing one.

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { RunSummary } from "@/lib/api/runs";
import { darkTheme, sizing, spacing } from "@/styles/tokens";
import { FreshnessStatus } from "./FreshnessStatus";
import { runLabel, type ActiveRunView } from "./liveRuns";

export interface RunControlRowProps {
  view: ActiveRunView;
  onReassign: () => void;
  // When /runs/locations last answered, set only while it is failing: the freshness and the estimate are
  // then the last answer's and may be out of date, so neither is shown as live.
  positionsNotRefreshingSince?: Date | null;
}

// arrivesAt is a UTC moment; formatted in the school's own zone so it reads the same way as plannedTime
// ("HH:mm"), whatever the viewer's own time zone is.
function formatArrival(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Beirut",
  }).format(new Date(iso));
}

// The reasons the contract allows for a missing estimate (docs/contracts/runs.md): never a made-up time,
// and never a comparison with plannedTime. LIVE with no estimate means the next stop itself has no pin (a
// fresh fix with nothing to route to); it must never read like "no position yet" next to a Live badge.
// UNAVAILABLE's two reasons match FreshnessStatus's own wording, so the row and the badge never disagree.
function noEstimateReason(view: ActiveRunView): string {
  if (view.freshness === "LIVE") return "next stop has no map pin";
  if (view.freshness === "STALE") return "position too old";
  if (view.freshness === "UNAVAILABLE") {
    return view.unavailableReason === "NOT_SHARING" ? "driver not sharing" : "no recent position";
  }
  return "no position yet"; // freshness null: no location row at all yet
}

// Progress, exactly as the contract defines it per direction (docs/contracts/runs.md, "Progress, as the
// screens show it"): morning counts pickedUp of students (absent included, since a confirmed-absent stop
// counts as done); afternoon counts droppedOff of students minus absent (everyone is PICKED_UP at the
// school gate, so pickedUp alone says nothing about afternoon progress). This is how a reassignment leaves
// confirmations untouched: the new driver's row shows the same counts the old driver had just made.
function progressLabel(run: RunSummary): string {
  const { counts, direction } = run;
  return direction === "MORNING"
    ? `Picked up ${counts.pickedUp} of ${counts.students}`
    : `Dropped off ${counts.droppedOff} of ${counts.students - counts.absent}`;
}

function LabelledItem({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
      <span className="font-medium" style={{ color: darkTheme.text.primary }}>
        {label}
      </span>{" "}
      {value}
    </p>
  );
}

function remainingStopsLabel(remainingStops: number | null): string {
  if (remainingStops === null) return "Stops unknown";
  if (remainingStops === 0) return "All stops done";
  return `${remainingStops} stop${remainingStops === 1 ? "" : "s"} left`;
}

export function RunControlRow({ view, onReassign, positionsNotRefreshingSince = null }: RunControlRowProps) {
  const { run, nextStop, remainingStops } = view;
  const notRefreshing = positionsNotRefreshingSince !== null;
  const liveEstimate = notRefreshing ? null : (nextStop?.liveEstimate ?? null);

  return (
    <li>
      <Card className="flex flex-col" style={{ gap: spacing.md }}>
        <div
          className="flex flex-col md:flex-row md:items-start md:justify-between"
          style={{ gap: spacing.md }}
        >
          <div className="flex flex-col" style={{ gap: spacing.xs }}>
            {/* The route's two runs share its name and either can be active first, so the direction is
                part of the heading itself — not only the line below — or two in-progress rows for one
                route would announce as the same thing. */}
            <h3 className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>
              {runLabel(run)}
            </h3>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              {run.driver.firstName} {run.driver.lastName} · {progressLabel(run)}
            </p>
          </div>

          <div className="flex items-center flex-wrap" style={{ gap: spacing.md }}>
            <FreshnessStatus
              freshness={view.freshness}
              unavailableReason={view.unavailableReason}
              ageSeconds={view.position?.ageSeconds ?? null}
              notRefreshingSince={positionsNotRefreshingSince}
            />
            <Button
              variant="secondary"
              onClick={onReassign}
              style={{ minHeight: sizing.tapTarget }}
              aria-label={`Reassign driver for ${runLabel(run)}`}
            >
              Reassign driver
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-start" style={{ gap: spacing.md }}>
          <p className="text-sm flex-shrink-0" style={{ color: darkTheme.text.secondary, minWidth: "120px" }}>
            {remainingStopsLabel(remainingStops)}
          </p>

          {nextStop && (
            <div className="flex flex-col" style={{ gap: spacing.xs }}>
              <p className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
                Next stop: {nextStop.firstName} {nextStop.lastName}
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap" style={{ gap: spacing.sm }}>
                {nextStop.plannedTime && <LabelledItem label="Planned" value={nextStop.plannedTime} />}
                {liveEstimate ? (
                  <LabelledItem label="Live estimate" value={`about ${formatArrival(liveEstimate.arrivesAt)}`} />
                ) : (
                  <p className="text-sm" style={{ color: darkTheme.text.muted }}>
                    No live estimate: {notRefreshing ? "positions not refreshing" : noEstimateReason(view)}.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </li>
  );
}
