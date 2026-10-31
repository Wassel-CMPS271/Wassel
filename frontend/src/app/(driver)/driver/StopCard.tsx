"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";
import type { ConfirmationStatus, RunStop } from "@/lib/api/runs";
import { darkTheme, radius, sizing, spacing } from "@/styles/tokens";
import type { StopState } from "./today";

const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = {
  PICKED_UP: "Picked up",
  DROPPED_OFF: "Dropped off",
  NOT_PRESENT: "Not present",
};

const pillStyle: CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  borderRadius: radius.full,
  backgroundColor: darkTheme.surface.emptyStateBadge,
  color: darkTheme.text.secondary,
};

// Card overrides per state. The next stop stands out (primary border, tint,
// halo); done and skippable stops recede (translucent fill, no shadow; dashed
// border for skip). A pending stop is the plain Card.
function cardStyle(state: StopState): CSSProperties {
  const base: CSSProperties = { gap: spacing.md, padding: spacing.md };
  switch (state) {
    case "next":
      return {
        ...base,
        border: `2px solid ${darkTheme.runStop.nextBorder}`,
        backgroundColor: darkTheme.runStop.nextBg,
        boxShadow: darkTheme.runStop.nextShadow,
      };
    case "done":
      return {
        ...base,
        backgroundColor: darkTheme.surface.recede,
        boxShadow: "none",
      };
    case "skip":
      return {
        ...base,
        border: `1px dashed ${darkTheme.surface.inputBorder}`,
        backgroundColor: darkTheme.surface.recede,
        boxShadow: "none",
      };
    case "pending":
      return base;
  }
}

function Pill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="inline-flex items-center text-xs font-medium"
      style={{ ...pillStyle, gap: spacing.xs, ...style }}
    >
      {children}
    </span>
  );
}

export interface StopCardProps {
  stop: RunStop;
  state: StopState;
  index: number;
}

export function StopCard({ stop, state, index }: StopCardProps) {
  const isNext = state === "next";
  const isDone = state === "done";
  const name = `${stop.firstName} ${stop.lastName}`;

  return (
    <motion.li
      className="list-none"
      aria-current={isNext ? "step" : undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay: index * 0.08 }}
    >
      <Card className="flex items-start" style={cardStyle(state)}>
        <span
          className="flex items-center justify-center flex-shrink-0 text-sm font-semibold"
          style={{
            width: sizing.stopBadge,
            height: sizing.stopBadge,
            borderRadius: radius.full,
            backgroundColor: isNext
              ? darkTheme.runStop.nextBadge
              : darkTheme.surface.emptyStateBadge,
            color: isNext ? darkTheme.text.primary : darkTheme.text.secondary,
          }}
        >
          <span className="sr-only">Stop </span>
          {stop.position}
        </span>

        <div className="flex flex-col min-w-0 flex-1" style={{ gap: spacing.xs }}>
          {isNext && (
            <p
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: darkTheme.runStop.nextLabel }}
            >
              Next stop
            </p>
          )}
          <p
            className={`${isNext ? "text-lg" : "text-base"} font-semibold break-words`}
            style={{
              color: isNext ? darkTheme.text.primary : darkTheme.text.secondary,
            }}
          >
            {name}
          </p>
          <p className="text-sm break-words" style={{ color: darkTheme.text.secondary }}>
            {stop.address}
          </p>

          {(stop.absent || stop.confirmation || state === "skip") && (
            <div
              className="flex items-center flex-wrap"
              style={{ gap: spacing.sm, marginTop: spacing.xs }}
            >
              {stop.absent && (
                <Pill
                  style={{
                    backgroundColor: darkTheme.runStop.absentBg,
                    color: darkTheme.runStop.absentText,
                  }}
                >
                  Absent
                </Pill>
              )}
              {state === "skip" && <Pill style={{ color: darkTheme.text.primary }}>Skip</Pill>}
              {/* Done shows a check; an afternoon PICKED_UP (still on the bus) shows the plain status. */}
              {stop.confirmation && (
                <Pill>
                  {isDone && <CheckIcon size={14} />}
                  {isDone
                    ? `Done · ${CONFIRMATION_LABELS[stop.confirmation.status]}`
                    : CONFIRMATION_LABELS[stop.confirmation.status]}
                </Pill>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.li>
  );
}
