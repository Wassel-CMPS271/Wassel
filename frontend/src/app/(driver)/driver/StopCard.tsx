"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";
import type { ConfirmationStatus, RunStop } from "@/lib/api/runs";
import type { QueueItem } from "@/lib/offline/queue";
import { colors, darkTheme, queuePill, radius, sizing, spacing } from "@/styles/tokens";
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

// Matches Button's dark "secondary" variant, so the maps/call links read as
// buttons without duplicating Button's own tap-handler-free rendering.
const secondaryButtonStyle: CSSProperties = {
  backgroundColor: "rgba(100, 64, 255, 0.16)",
  color: darkTheme.text.primary,
  border: `1px solid ${darkTheme.surface.inputBorder}`,
  outlineColor: colors.primary[500],
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

// This device's clock, labelled as such: it's the tap time, not the server's
// (docs/contracts/driver-gps-offline.md — occurredAt is an open question there,
// so the screen never implies the server recorded this exact moment).
function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const QUEUE_LABELS: Record<QueueItem["state"], string> = {
  queued: "Saved on phone",
  sending: "Sending…",
  synced: "Sent",
  conflict: "Conflict",
  error: "Couldn't send",
  blocked: "Waiting to send",
};

function queuePillStyle(state: QueueItem["state"]): CSSProperties | undefined {
  switch (state) {
    case "sending":
      return { backgroundColor: queuePill.sendingBg, color: queuePill.sendingText };
    case "synced":
      return { backgroundColor: queuePill.syncedBg, color: queuePill.syncedText };
    case "error":
      return { backgroundColor: queuePill.errorBg, color: queuePill.errorText };
    case "conflict":
      // A conflict is a warning like "Absent", so it reuses that tint rather
      // than a new one (tokens.ts).
      return { backgroundColor: darkTheme.runStop.absentBg, color: darkTheme.runStop.absentText };
    case "queued":
    case "blocked":
      return undefined; // The plain neutral pill.
  }
}

// One queue item's status for this stop: a pill, the local tap time, and
// (error/blocked) Try again or (conflict) Dismiss behind a confirm step — the
// same inline pattern as RevokeAccessControl (Escape cancels, focus moves to
// Confirm and back to the triggering button).
function QueueStatus({
  item,
  onRetry,
  onDismiss,
}: {
  item: QueueItem;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (confirmingDismiss) confirmRef.current?.focus();
  }, [confirmingDismiss]);

  useEffect(() => {
    if (!confirmingDismiss && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      dismissRef.current?.focus();
    }
  }, [confirmingDismiss]);

  function cancelDismiss() {
    restoreFocusRef.current = true;
    setConfirmingDismiss(false);
  }

  function confirmDismiss() {
    restoreFocusRef.current = true;
    setConfirmingDismiss(false);
    onDismiss();
  }

  return (
    <div className="flex flex-col" style={{ gap: spacing.xs }}>
      <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
        <Pill style={queuePillStyle(item.state)}>
          {item.state === "synced" && <CheckIcon size={14} />}
          {QUEUE_LABELS[item.state]}
          {" · "}
          {CONFIRMATION_LABELS[item.status]}
        </Pill>
        <span className="text-xs" style={{ color: darkTheme.text.muted }}>
          {formatLocalTime(item.occurredAt)} (local time)
        </span>
      </div>

      {item.state === "conflict" && item.lastError && (
        <p className="text-sm" style={{ color: darkTheme.runStop.absentText }}>
          {item.lastError.message}
        </p>
      )}

      {(item.state === "error" || item.state === "blocked") && (
        <Button
          data-stop-retry
          ref={dismissRef}
          variant="secondary"
          onClick={onRetry}
          style={{ minHeight: sizing.tapTarget, alignSelf: "flex-start" }}
        >
          Try again
        </Button>
      )}

      {item.state === "conflict" &&
        (confirmingDismiss ? (
          <div
            role="group"
            aria-label="Confirm dismiss"
            className="flex items-center flex-wrap"
            style={{ gap: spacing.sm }}
            onKeyDown={(event) => {
              if (event.key === "Escape") cancelDismiss();
            }}
          >
            <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
              Remove this from the list on this phone? It won&apos;t be sent.
            </span>
            <Button
              ref={confirmRef}
              variant="danger"
              onClick={confirmDismiss}
              style={{ minHeight: sizing.tapTarget }}
            >
              Confirm
            </Button>
            <Button variant="ghost" onClick={cancelDismiss} style={{ minHeight: sizing.tapTarget }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            data-stop-retry
            ref={dismissRef}
            variant="secondary"
            onClick={() => setConfirmingDismiss(true)}
            style={{ minHeight: sizing.tapTarget, alignSelf: "flex-start" }}
          >
            Dismiss
          </Button>
        ))}
    </div>
  );
}

export interface StopCardProps {
  stop: RunStop;
  state: StopState;
  index: number;
  // The confirmations still allowed for this stop (nextConfirmations in
  // today.ts); none hides the buttons.
  actions: ConfirmationStatus[];
  // Online-only fallback (confirmationReplayApi is null): the status whose
  // request is in flight for this stop, or null.
  pendingStatus: ConfirmationStatus | null;
  // Online-only fallback: this stop's last failed confirmation, if any.
  error: string | null;
  onConfirm: (status: ConfirmationStatus) => void;
  onRetry: () => void;
  // Offline queue (SCRUM-273): the item representing this stop's confirmation
  // attempt right now (the earliest one still unsent, or a just-synced one
  // about to be pruned), or null/undefined when there's nothing to show —
  // either confirmationReplayApi is null (online-only mode, above) or every
  // past attempt has already synced and been pruned.
  queueItem?: QueueItem | null;
  onRetryQueueItem?: () => void;
  onDismissQueueItem?: () => void;
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
  queueItem,
  onRetryQueueItem,
  onDismissQueueItem,
}: StopCardProps) {
  const isNext = state === "next";
  const isDone = state === "done";
  const name = `${stop.firstName} ${stop.lastName}`;
  // "Saving…" and the disabled buttons cover both an online attempt in flight
  // and a queued item being sent, so the driver can't double-tap either way.
  const pending = pendingStatus !== null || queueItem?.state === "sending";
  const hasPin = stop.latitude !== null && stop.longitude !== null;
  const hasPhone = stop.guardianPhone.trim().length > 0;

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

          {(hasPin || hasPhone) && (
            <div className="flex flex-wrap" style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {hasPin && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open directions to ${name}'s stop`}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    ...secondaryButtonStyle,
                    minHeight: sizing.tapTarget,
                    padding: `${spacing.sm} ${spacing.md}`,
                    borderRadius: radius.md,
                  }}
                >
                  Open in maps
                </a>
              )}
              {hasPhone && (
                <a
                  href={`tel:${stop.guardianPhone.trim()}`}
                  aria-label={`Call ${name}'s parent`}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    ...secondaryButtonStyle,
                    minHeight: sizing.tapTarget,
                    padding: `${spacing.sm} ${spacing.md}`,
                    borderRadius: radius.md,
                  }}
                >
                  Call parent
                </a>
              )}
            </div>
          )}

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

          {(actions.length > 0 || error || queueItem) && (
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
              {queueItem && (
                <QueueStatus
                  item={queueItem}
                  onRetry={() => onRetryQueueItem?.()}
                  onDismiss={() => onDismissQueueItem?.()}
                />
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.li>
  );
}
