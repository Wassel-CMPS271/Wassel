"use client";

// One active run on the live control screen (SCRUM-274): route, direction, driver, remaining stops, next
// stop and freshness, plus the "Reassign driver" trigger. Planned time and the live estimate are always
// two separate labelled items — the contract forbids comparing them, so this never prints a combined
// "late" status, and when there is no estimate it says why in plain words instead of guessing one.

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { darkTheme, sizing, spacing } from "@/styles/tokens";
import { FreshnessStatus } from "./FreshnessStatus";
import type { ActiveRunView } from "./liveRuns";

export interface RunControlRowProps {
  view: ActiveRunView;
  onReassign: () => void;
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

// The three reasons the contract allows for a missing estimate (docs/contracts/runs.md): never a made-up
// time, and never a comparison with plannedTime.
function noEstimateReason(view: ActiveRunView): string {
  if (view.freshness === "STALE") return "position too old";
  if (view.freshness === "UNAVAILABLE" && view.unavailableReason === "NOT_SHARING") return "driver not sharing";
  return "no position yet";
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

export function RunControlRow({ view, onReassign }: RunControlRowProps) {
  const { run, nextStop, remainingStops } = view;

  return (
    <li>
      <Card className="flex flex-col" style={{ gap: spacing.md }}>
        <div
          className="flex flex-col md:flex-row md:items-start md:justify-between"
          style={{ gap: spacing.md }}
        >
          <div className="flex flex-col" style={{ gap: spacing.xs }}>
            <h3 className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>
              {run.route.name}
            </h3>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              {run.direction === "MORNING" ? "Morning" : "Afternoon"} · {run.driver.firstName}{" "}
              {run.driver.lastName}
            </p>
          </div>

          <div className="flex items-center flex-wrap" style={{ gap: spacing.md }}>
            <FreshnessStatus
              freshness={view.freshness}
              unavailableReason={view.unavailableReason}
              ageSeconds={view.position?.ageSeconds ?? null}
            />
            <Button
              variant="secondary"
              onClick={onReassign}
              style={{ minHeight: sizing.tapTarget }}
              aria-label={`Reassign driver for ${run.route.name}`}
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
                {nextStop.liveEstimate ? (
                  <LabelledItem
                    label="Live estimate"
                    value={`about ${formatArrival(nextStop.liveEstimate.arrivesAt)}`}
                  />
                ) : (
                  <p className="text-sm" style={{ color: darkTheme.text.muted }}>
                    No live estimate: {noEstimateReason(view)}.
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
