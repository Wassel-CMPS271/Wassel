"use client";

// The reassign-driver dialog (SCRUM-274), opened per run from RunControlRow's "Reassign driver" button.
// Logic lives in useReassign; this renders the driver picker, the optional reason with its counter, the
// submit/cancel pair, the success and failure messages and the run's change history. Modeled on
// RouteFormDialog (the same overlay, focus trap and Escape-to-close), swapped for useReassign's state.

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { Select } from "@/components/ui/Select";
import type { RunSummary } from "@/lib/api/runs";
import { colors, darkTheme, radius, sizing, spacing, typography } from "@/styles/tokens";
import { runLabel } from "./liveRuns";
import { REASON_MAX_LENGTH, reassignSuccessMessage, useReassign } from "./useReassign";

export interface ReassignDriverPanelProps {
  run: RunSummary;
  refreshRuns: () => Promise<void>;
  // useLivePolling's: a 401 on the POST goes through the same /me check and redirect.
  reportUnauthorized: () => void;
  onClose: () => void;
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Beirut",
  }).format(new Date(iso));
}

export function ReassignDriverPanel({ run, refreshRuns, reportUnauthorized, onClose }: ReassignDriverPanelProps) {
  const panel = useReassign(run, refreshRuns, reportUnauthorized);
  const [driverId, setDriverId] = useState("");
  const [reason, setReason] = useState("");
  const [justSucceeded, setJustSucceeded] = useState(false);

  const headingId = useId();
  const reasonId = `${headingId}-reason`;
  const reasonCountId = `${headingId}-reason-count`;
  const reasonErrorId = `${headingId}-reason-error`;
  const panelRef = useRef<HTMLDivElement>(null);
  const driverSelectRef = useRef<HTMLSelectElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  // Focuses the dialog once, the first moment there's something to focus: the driver picker once the
  // candidates load, or the panel itself while loading or failed. Never again after that — a driverId 409
  // reloading the eligible list must not steal focus back from the alert that explains what went wrong.
  const focusedOnOpen = useRef(false);
  useEffect(() => {
    if (focusedOnOpen.current) return;
    if (panel.candidates === null && !panel.candidatesFailed) return; // still loading
    focusedOnOpen.current = true;
    if (driverSelectRef.current) {
      driverSelectRef.current.focus();
    } else {
      panelRef.current?.focus();
    }
  }, [panel.candidates, panel.candidatesFailed]);

  // Keeps focus inside the dialog. A control can disappear or turn disabled while it holds focus (the
  // "Try again" button once the candidates load, Submit after a success, everything while saving), which drops
  // focus to the page behind: Escape and the Tab trap then stop working, because the key handler sits on this
  // overlay. Runs after every render; does nothing while focus is still on something usable. Declared before
  // the failure effect below so, after a failed submit, the alert is what ends up focused.
  useEffect(() => {
    if (panel.submitting) return;
    const container = panelRef.current;
    if (!container) return;
    const active = document.activeElement;
    // Focus parked on the dialog itself (while the drivers loaded) moves to the picker once it exists.
    const lost =
      !active ||
      !container.contains(active) ||
      active.matches(":disabled") ||
      (active === container && driverSelectRef.current !== null);
    if (lost) (driverSelectRef.current ?? container).focus();
  });

  // A submit failure moves focus to the banner that explains it, instead of leaving it on Submit or
  // jumping back to the picker when the failure also reloads the eligible list.
  useEffect(() => {
    if (panel.failure) alertRef.current?.focus();
  }, [panel.failure]);

  function handleOverlayKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!panel.submitting) onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const container = panelRef.current;
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setJustSucceeded(false);
    const ok = await panel.submit(selectedDriverId, reason);
    if (ok) {
      setJustSucceeded(true);
      setDriverId("");
      setReason("");
    }
  }

  // The picked driver only counts while they're still on the eligible list: after a refused submit the list
  // reloads without them, and sending the same id again would only be refused the same way.
  const selectedDriverId = panel.candidates?.some((candidate) => candidate.id === driverId) ? driverId : "";
  const noCandidates = panel.candidates !== null && panel.candidates.length === 0;
  const canSubmit =
    !panel.submitting &&
    Boolean(selectedDriverId) &&
    !noCandidates &&
    !panel.candidatesFailed &&
    !panel.failure?.reopenNeeded;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: darkTheme.surface.overlay, padding: spacing.lg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onKeyDown={handleOverlayKeyDown}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="w-full"
        style={{ maxWidth: sizing.dialogMaxWidth }}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Card>
          <form method="post" onSubmit={handleSubmit} noValidate aria-labelledby={headingId}>
            <h2
              id={headingId}
              className="text-lg font-semibold"
              style={{ marginBottom: spacing.xs, color: darkTheme.text.primary }}
            >
              Reassign driver — {runLabel(run)}
            </h2>
            <p className="text-sm" style={{ color: darkTheme.text.secondary, marginBottom: spacing.xs }}>
              The new driver takes over both of today&apos;s runs on this route, from now on.
            </p>
            <p className="text-sm" style={{ color: darkTheme.text.secondary, marginBottom: spacing.md }}>
              Current driver: {panel.currentDriver.firstName} {panel.currentDriver.lastName}
            </p>

            <div className="flex flex-col" style={{ gap: spacing.md }}>
              {panel.candidatesFailed ? (
                <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                  Couldn&apos;t load eligible drivers.{" "}
                  <button
                    type="button"
                    className={`underline font-medium inline-flex items-center ${focusRingClass}`}
                    style={{ minHeight: sizing.tapTarget, ...focusRingStyle }}
                    onClick={() => void panel.reloadCandidates()}
                  >
                    Try again
                  </button>
                </p>
              ) : panel.candidates === null ? (
                <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
                  Loading eligible drivers…
                </p>
              ) : noCandidates ? (
                <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
                  No eligible drivers are available right now. Add or restore an active driver first.
                </p>
              ) : (
                <Select
                  ref={driverSelectRef}
                  label="New driver"
                  value={selectedDriverId}
                  onChange={(event) => setDriverId(event.target.value)}
                  error={panel.failure?.fieldErrors.driverId}
                  disabled={panel.submitting}
                >
                  <option value="" disabled>
                    Select a driver
                  </option>
                  {panel.candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.firstName} {candidate.lastName}
                    </option>
                  ))}
                </Select>
              )}

              <div className="flex flex-col" style={{ gap: spacing.xs }}>
                <label
                  htmlFor={reasonId}
                  className="text-sm font-medium"
                  style={{ color: darkTheme.text.secondary }}
                >
                  Reason (optional)
                </label>
                <textarea
                  id={reasonId}
                  value={reason}
                  onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX_LENGTH))}
                  maxLength={REASON_MAX_LENGTH}
                  rows={3}
                  disabled={panel.submitting}
                  aria-invalid={Boolean(panel.failure?.fieldErrors.reason)}
                  aria-describedby={
                    panel.failure?.fieldErrors.reason ? `${reasonErrorId} ${reasonCountId}` : reasonCountId
                  }
                  className="w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderRadius: radius.md,
                    padding: `${spacing.sm} ${spacing.md}`,
                    border: `1px solid ${
                      panel.failure?.fieldErrors.reason ? colors.error[500] : darkTheme.surface.inputBorder
                    }`,
                    backgroundColor: darkTheme.surface.input,
                    color: darkTheme.text.primary,
                    fontFamily: typography.fontFamily.serif,
                    resize: "vertical",
                  }}
                />
                <span id={reasonCountId} className="text-xs" style={{ color: darkTheme.text.muted }}>
                  {reason.length}/{REASON_MAX_LENGTH}
                </span>
                {panel.failure?.fieldErrors.reason && (
                  <span id={reasonErrorId} role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                    {panel.failure.fieldErrors.reason}
                  </span>
                )}
              </div>
            </div>

            {/* Stays mounted (never unmounted) so success and "Saving…" updates are reliably announced.
                minHeight matches text-sm's own line height (typography.fontSize.sm), so having nothing to
                say here doesn't shift the layout below it. */}
            <div
              role="status"
              aria-live="polite"
              style={{ marginTop: spacing.md, minHeight: typography.fontSize.sm.lineHeight }}
            >
              {panel.submitting && (
                <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
                  Saving…
                </p>
              )}
              {!panel.submitting && justSucceeded && panel.reassigned && (
                <p className="text-sm font-medium" style={{ color: colors.success[500] }}>
                  {reassignSuccessMessage(panel.reassigned)}
                </p>
              )}
            </div>

            {panel.failure && (
              <p
                ref={alertRef}
                role="alert"
                tabIndex={-1}
                className="text-sm"
                style={{ color: colors.error[500], marginTop: spacing.sm }}
              >
                {panel.failure.message}
              </p>
            )}

            <div className="flex" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              <Button type="submit" disabled={!canSubmit}>
                {panel.submitting ? "Saving…" : "Submit"}
              </Button>
              <Button variant="ghost" type="button" onClick={onClose} disabled={panel.submitting}>
                Cancel
              </Button>
            </div>

            <section aria-labelledby={`${headingId}-history-heading`} style={{ marginTop: spacing.lg }}>
              <h3
                id={`${headingId}-history-heading`}
                className="text-sm font-semibold"
                style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
              >
                Recent changes
              </h3>
              {panel.historyFailed ? (
                <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                  Couldn&apos;t load the change history.
                </p>
              ) : panel.history === null ? (
                <p className="text-sm" style={{ color: darkTheme.text.muted }}>
                  Loading…
                </p>
              ) : panel.history.length === 0 ? (
                <p className="text-sm" style={{ color: darkTheme.text.muted }}>
                  No changes yet today.
                </p>
              ) : (
                <ul role="list" className="flex flex-col" style={{ gap: spacing.xs, padding: 0, margin: 0 }}>
                  {panel.history.map((entry) => (
                    <li key={entry.id} className="text-sm" style={{ color: darkTheme.text.secondary }}>
                      {entry.toDriver.firstName} {entry.toDriver.lastName} replaced {entry.fromDriver.firstName}{" "}
                      {entry.fromDriver.lastName} · {formatWhen(entry.changedAt)} · by{" "}
                      {entry.changedBy.email ?? "someone"}
                      {entry.reason && <> — &ldquo;{entry.reason}&rdquo;</>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </form>
        </Card>
      </motion.div>
    </motion.div>
  );
}
