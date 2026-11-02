"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/errors";
import type { Run } from "@/lib/api/runs";
// Sample calls until SCRUM-234 is merged; see the comments in runs.sample.ts.
import { endRunSample, startRunSample } from "@/lib/api/runs.sample";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";
import { stopStates } from "./today";

const GENERIC_ERROR = "Something went wrong. Please try again.";

const ACTIONS = {
  NOT_STARTED: { label: "Start run", pendingLabel: "Starting…", call: startRunSample },
  IN_PROGRESS: { label: "End run", pendingLabel: "Ending…", call: endRunSample },
} as const;

export function actionError(error: unknown): string {
  return error instanceof ApiError && error.status < 500 ? error.message : GENERIC_ERROR;
}

interface UnconfirmedSummary {
  // How many stops or onboard children the End run confirm step should warn
  // about. 0 means End run can fire straight away.
  count: number;
  // true when `count` counts children still onboard (picked up, not dropped
  // off) rather than literal unconfirmed stops — the dialog copy must say so,
  // since an onboard stop already has a confirmation.
  onboardOnly: boolean;
}

// Stops on an in-progress run that are still "next" or "pending" (not done,
// and not settled as a skip either — see "Every stop on this run is done or
// skipped" in page.tsx) warn before Ending the run. So does a morning run
// where every stop is done but some are still onboard: isDone() in today.ts
// marks a morning stop done as soon as it has any confirmation, including
// PICKED_UP, so "no next/pending stops left" doesn't by itself mean nobody is
// still on the bus (docs/contracts/runs.md: "Ending is allowed while students
// are still on the bus … the screens should warn using counts").
function unconfirmedSummary(run: Run): UnconfirmedSummary {
  if (run.state !== "IN_PROGRESS") return { count: 0, onboardOnly: false };
  const pending = stopStates(run).filter((state) => state === "next" || state === "pending").length;
  if (pending > 0) return { count: pending, onboardOnly: false };
  const onboard = run.counts.pickedUp - run.counts.droppedOff;
  return onboard > 0 ? { count: onboard, onboardOnly: true } : { count: 0, onboardOnly: false };
}

// Start run / End run for the current run (SCRUM-244). One button whose label
// follows the run's state, so focus stays on it when Start turns into End.
// End run with stops still open swaps the button for an inline confirm step
// (focus moves to Confirm; Cancel or Escape brings back the button).
// A failure shows an alert and "Try again" next to it; the rest of the page
// stays as it is.
export function RunAction({ run, onRunChange }: { run: Run; onRunChange: (run: Run) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Blocks a second click before the disabled state has rendered.
  const busy = useRef(false);
  const mainButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // Set when the confirm step closes; the main button takes focus as soon as
  // it is back and enabled (after the call, if Confirm was pressed).
  const refocusMain = useRef(false);
  const promptId = useId();
  const { count: unconfirmed, onboardOnly } = unconfirmedSummary(run);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  useEffect(() => {
    const button = mainButton.current;
    if (refocusMain.current && button && !button.disabled) {
      refocusMain.current = false;
      button.focus();
    }
  });

  function closeConfirm() {
    refocusMain.current = true;
    setConfirming(false);
  }

  // A delayed confirmation can resolve while the confirm step is open and
  // bring the count to 0 (e.g. the last onboard child gets dropped off while
  // the driver is looking at the dialog). Close it the same way Cancel does
  // rather than show "0 stops aren't confirmed yet".
  useEffect(() => {
    if (confirming && unconfirmed === 0) closeConfirm();
  }, [confirming, unconfirmed]);

  if (run.state === "FINISHED") return null;
  const action = ACTIONS[run.state];

  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const updated = await action.call(run.id);
      onRunChange(updated);
    } catch (err) {
      setError(actionError(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function onMainClick() {
    if (unconfirmed > 0) {
      setError(null);
      setConfirming(true);
    } else {
      submit();
    }
  }

  function confirm() {
    closeConfirm();
    submit();
  }

  return (
    <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
      {confirming ? (
        <div
          role="group"
          aria-labelledby={promptId}
          className="flex flex-col items-start"
          style={{ gap: spacing.sm }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeConfirm();
          }}
        >
          <p id={promptId} className="text-sm" style={{ color: darkTheme.text.primary }}>
            {onboardOnly
              ? unconfirmed === 1
                ? "1 child is still on the bus, not dropped off yet. End the run anyway?"
                : `${unconfirmed} children are still on the bus, not dropped off yet. End the run anyway?`
              : unconfirmed === 1
                ? "1 stop isn't confirmed yet. End the run anyway?"
                : `${unconfirmed} stops aren't confirmed yet. End the run anyway?`}
          </p>
          <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
            <Button
              ref={confirmButton}
              onClick={confirm}
              style={{ minHeight: sizing.tapTarget, paddingInline: spacing.lg }}
            >
              Confirm end run
            </Button>
            <Button
              variant="secondary"
              onClick={closeConfirm}
              style={{ minHeight: sizing.tapTarget }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={mainButton}
          onClick={onMainClick}
          disabled={pending}
          className="w-full sm:w-auto"
          style={{ minHeight: sizing.tapTarget, paddingInline: spacing.lg }}
        >
          {pending ? action.pendingLabel : action.label}
        </Button>
      )}
      {error && (
        <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            {error}
          </p>
          <Button
            variant="secondary"
            onClick={submit}
            disabled={pending}
            style={{ minHeight: sizing.tapTarget }}
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
