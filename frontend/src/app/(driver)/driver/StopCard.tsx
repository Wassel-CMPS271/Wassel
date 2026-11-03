"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";
import type { ConfirmationStatus, RunStop } from "@/lib/api/runs";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";
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

// The next stop's first move is the one primary button on the screen besides
// Start/End run; everything else is quieter so the buttons don't compete with
// the status pills, and a done stop's leftover move recedes with its card.
function actionVariant(state: StopState, position: number): ButtonVariant {
  if (state === "next" && position === 0) return "primary";
  return state === "done" ? "ghost" : "secondary";
}

export interface StopCardProps {
  stop: RunStop;
  state: StopState;
  index: number;
  // The confirmations still allowed for this stop (nextConfirmations in
  // today.ts); none hides the buttons.
  actions: ConfirmationStatus[];
  // The status whose request is in flight for this stop, or null.
  pendingStatus: ConfirmationStatus | null;
  // This stop's last failed confirmation, if any.
  error: string | null;
  onConfirm: (status: ConfirmationStatus) => void;
  onRetry: () => void;
}

export function StopCard({
  stop,
  state,
  index,
  actions,
  pendingStatus,
  error,
  onConfirm,
  onRetry,
}: StopCardProps) {
  const isNext = state === "next";
  const isDone = state === "done";
  const name = `${stop.firstName} ${stop.lastName}`;
  const pending = pendingStatus !== null;

  // The tapped button goes away when its move is recorded (Picked up becomes
  // Dropped off, or the row empties), so once the request settles focus moves
  // to what replaced it: Try again on a failure, else the first button left,
  // else the student's name. Only when focus was in this card or was lost.
  const cardRef = useRef<HTMLLIElement>(null);
  const nameRef = useRef<HTMLParagraphElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    const settled = wasPending.current && !pending;
    wasPending.current = pending;
    const card = cardRef.current;
    if (!settled || !card) return;
    const active = document.activeElement;
    if (active && active !== document.body && !card.contains(active)) return;
    const target =
      card.querySelector<HTMLElement>("[data-stop-retry]") ??
      card.querySelector<HTMLElement>("[data-stop-action]") ??
      nameRef.current;
    target?.focus();
  }, [pending]);

  return (
    <motion.li
      ref={cardRef}
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
            ref={nameRef}
            tabIndex={-1}
            className={`${isNext ? "text-lg" : "text-base"} font-semibold break-words focus:outline-none`}
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

          {(actions.length > 0 || error) && (
            <div
              role="group"
              aria-label={`Confirm ${name}`}
              className="flex flex-col"
              style={{ gap: spacing.sm, marginTop: spacing.sm }}
            >
              {actions.length > 0 && (
                <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
                  {actions.map((status, position) => (
                    <Button
                      key={status}
                      data-stop-action
                      variant={actionVariant(state, position)}
                      onClick={() => onConfirm(status)}
                      disabled={pending}
                      className="flex-1"
                      style={{ minHeight: sizing.tapTarget, paddingInline: spacing.md }}
                    >
                      {pendingStatus === status ? "Saving…" : CONFIRMATION_LABELS[status]}
                    </Button>
                  ))}
                </div>
              )}
              {error && (
                <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
                  <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                    {error}
                  </p>
                  <Button
                    data-stop-retry
                    variant="secondary"
                    onClick={onRetry}
                    disabled={pending}
                    style={{ minHeight: sizing.tapTarget }}
                  >
                    Try again
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.li>
  );
}
