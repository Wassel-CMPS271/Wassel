"use client";

// The optimizer's answer (SCRUM-221), shown without changing the route: the
// current and the proposed order side by side (stacked on a phone) with
// their total driving times and the difference, then Apply or Discard. A
// proposal that isn't feasible explains why and has nothing to apply.

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import type { Proposal, ProposalReason, StopSequence } from "@/lib/api/routes";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";
import { Badge, arrivalText } from "./RouteMap";

export type ProposalAction = "apply" | "discard";

// "Saves 9 min", "4 min longer" or "No change".
export function differenceText(current: StopSequence, proposed: StopSequence): string {
  const saved = current.drivingMinutes - proposed.drivingMinutes;
  if (saved > 0) return `Saves ${saved} min`;
  if (saved < 0) return `${-saved} min longer`;
  return "No change";
}

// Known codes get a plain explanation; any other code shows the backend's
// message as it is, as the contract asks.
const REASON_TEXT: Record<string, string> = {
  CAPACITY_EXCEEDED:
    "Over capacity: more students are on this route than the vehicle has seats. Remove a student or give the route a larger vehicle.",
  ARRIVAL_TIME_UNREACHABLE:
    "The school arrival time can't be reached: even the best order found would need the first pickup before 06:00.",
};

function ReasonItem({ reason }: { reason: ProposalReason }) {
  const explanation = REASON_TEXT[reason.code];
  return (
    <li className="list-none flex flex-col" style={{ gap: spacing.xs }}>
      <span className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
        {explanation ?? reason.message}
      </span>
      {explanation && reason.message && (
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {reason.message}
        </span>
      )}
    </li>
  );
}

function OrderColumn({ id, title, sequence }: { id: string; title: string; sequence: StopSequence }) {
  return (
    <section aria-labelledby={id} className="flex flex-col min-w-0" style={{ gap: spacing.sm }}>
      <h3 id={id} className="text-base font-semibold" style={{ color: darkTheme.text.primary }}>
        {title}
      </h3>
      <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
        Total driving time: {sequence.drivingMinutes} min
      </p>
      <ol className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
        {sequence.stops.map((stop) => (
          <li key={stop.studentId} className="list-none flex items-center" style={{ gap: spacing.sm }}>
            <Badge>{stop.position}</Badge>
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-medium break-words" style={{ color: darkTheme.text.primary }}>
                <span className="sr-only">Stop {stop.position}: </span>
                {stop.firstName} {stop.lastName}
              </span>
              <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
                {arrivalText(stop.arrivalTime)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface OptimizationPanelProps {
  proposal: Proposal;
  headingRef: RefObject<HTMLHeadingElement | null>;
  busy: ProposalAction | undefined;
  error?: string;
  onApply: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

export function OptimizationPanel({
  proposal,
  headingRef,
  busy,
  error,
  onApply,
  onDiscard,
  onClose,
}: OptimizationPanelProps) {
  const proposed = proposal.feasible ? proposal.proposed : null;
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Apply and Discard are disabled during their request, so focus has fallen
  // to the page by the time a failure comes back; the alert takes it.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // Escape never applies and never discards: it only closes the panel
  // locally, the same for a feasible proposal as for an infeasible answer.
  // Discard stays an explicit button that sends a request to the backend.
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || busy) return;
    event.preventDefault();
    onClose();
  }

  return (
    <section
      aria-labelledby="optimization-heading"
      onKeyDown={handleKeyDown}
      className="flex flex-col"
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        backgroundColor: darkTheme.surface.card,
        border: `1px solid ${darkTheme.surface.cardBorder}`,
        boxShadow: darkTheme.surface.cardShadow,
        borderRadius: radius.lg,
      }}
    >
      <div className="flex flex-col" style={{ gap: spacing.xs }}>
        <h2
          ref={headingRef}
          id="optimization-heading"
          tabIndex={-1}
          className="text-lg font-semibold"
          style={{ color: darkTheme.text.primary }}
        >
          {proposed ? "Optimization proposal" : "This route can't be optimized"}
        </h2>
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {proposed
            ? "Nothing changes until you apply it."
            : "No order was found for this route, so there is nothing to apply."}
        </p>
      </div>

      {proposed ? (
        <>
          <p className="text-base font-semibold" style={{ color: darkTheme.text.primary }}>
            {differenceText(proposal.current, proposed)}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: spacing.lg }}>
            <OrderColumn id="optimization-current" title="Current order" sequence={proposal.current} />
            <OrderColumn id="optimization-proposed" title="Proposed order" sequence={proposed} />
          </div>
        </>
      ) : (
        <ul className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
          {proposal.reasons.map((reason, index) => (
            <ReasonItem key={`${reason.code}-${index}`} reason={reason} />
          ))}
        </ul>
      )}

      {error && (
        <p ref={errorRef} role="alert" tabIndex={-1} className="text-sm" style={{ color: colors.error[500] }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
        {proposed ? (
          <>
            <Button disabled={busy !== undefined} onClick={onApply}>
              {busy === "apply" ? "Applying…" : "Apply"}
            </Button>
            <Button variant="secondary" disabled={busy !== undefined} onClick={onDiscard}>
              {busy === "discard" ? "Discarding…" : "Discard"}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </section>
  );
}
