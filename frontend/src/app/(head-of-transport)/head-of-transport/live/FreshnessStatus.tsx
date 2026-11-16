"use client";

// How fresh a run's position is (SCRUM-274). Shows exactly the server's status — LIVE / STALE /
// UNAVAILABLE — never re-derived on the client. Color is never the only signal: each state also gets its
// own shape (filled dot / hollow ring / a line through the dot) and its own wording.

import type { ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import type { LocationStatus } from "@/lib/api/runs";
import type { UnavailableReason } from "./liveRuns";
import { colors, darkTheme, spacing } from "@/styles/tokens";

export interface FreshnessStatusProps {
  // Null before /locations has a row for this run yet (not UNAVAILABLE).
  freshness: LocationStatus | null;
  unavailableReason: UnavailableReason | null;
  // The server's position.ageSeconds; present for STALE.
  ageSeconds: number | null;
}

function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return `Last seen ${ageSeconds}s ago`;
  return `Last seen ${Math.floor(ageSeconds / 60)} min ago`;
}

function unavailableLabel(reason: UnavailableReason | null): string {
  return reason === "NOT_SHARING" ? "Driver is not sharing location" : "No recent position";
}

function Shape({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 12 12">
      {children}
    </svg>
  );
}

function LiveDot({ pulsing }: { pulsing: boolean }) {
  return (
    <span className="relative inline-flex" style={{ width: "12px", height: "12px" }}>
      {pulsing && (
        <span
          aria-hidden="true"
          className="absolute inline-flex rounded-full animate-ping"
          style={{ width: "12px", height: "12px", backgroundColor: colors.success[500], opacity: 0.5 }}
        />
      )}
      <Shape>
        <circle cx="6" cy="6" r="5" fill={colors.success[500]} />
      </Shape>
    </span>
  );
}

function StaleRing() {
  return (
    <Shape>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke={colors.warning[500]} strokeWidth="2" />
    </Shape>
  );
}

function UnavailableMark() {
  return (
    <Shape>
      <circle cx="6" cy="6" r="5" fill="none" stroke={darkTheme.text.secondary} strokeWidth="1.5" />
      <path d="M2.5 2.5l7 7" stroke={darkTheme.text.secondary} strokeWidth="1.5" />
    </Shape>
  );
}

function UnknownDash() {
  return (
    <Shape>
      <path d="M2 6h8" stroke={darkTheme.text.muted} strokeWidth="2" strokeLinecap="round" />
    </Shape>
  );
}

export function FreshnessStatus({ freshness, unavailableReason, ageSeconds }: FreshnessStatusProps) {
  const reduceMotion = useReducedMotion();

  if (freshness === null) {
    return (
      <span
        className="inline-flex items-center text-sm font-medium"
        style={{ gap: spacing.xs, color: darkTheme.text.muted }}
      >
        <UnknownDash />
        Position unknown
      </span>
    );
  }

  if (freshness === "LIVE") {
    return (
      <span
        className="inline-flex items-center text-sm font-medium"
        style={{ gap: spacing.xs, color: colors.success[500] }}
      >
        <LiveDot pulsing={!reduceMotion} />
        Live
      </span>
    );
  }

  if (freshness === "STALE") {
    return (
      <span
        className="inline-flex items-center text-sm font-medium"
        style={{ gap: spacing.xs, color: colors.warning[500] }}
      >
        <StaleRing />
        {ageSeconds !== null ? formatAge(ageSeconds) : "Last seen a while ago"}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center text-sm font-medium"
      style={{ gap: spacing.xs, color: darkTheme.text.secondary }}
    >
      <UnavailableMark />
      {unavailableLabel(unavailableReason)}
    </span>
  );
}
