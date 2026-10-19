"use client";

// What generating all routes suggests (SCRUM-224), shown without changing
// anything: each planned route with its vehicle, driver, students in order
// and seats used, whether it is new or replaces an existing route's students,
// who leaves each route, the vehicles left out and the students who could
// not be placed. Apply asks for a confirmation first, because it rewrites
// many routes at once and there is no undo. Once apply has said the data
// changed (409), the proposal stays on screen so it can still be discarded,
// but it can no longer be applied.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/Button";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { DriverIcon } from "@/components/ui/icons";
import type { FleetProposal, PlannedRoute, UnplacedStudent } from "@/lib/api/routes";
import { colors, darkTheme, iconSize, radius, sizing, spacing } from "@/styles/tokens";
import { Badge, arrivalText } from "../[routeId]/RouteMap";
import { GenerationMap, routeColorsFor } from "./GenerationMap";

export type GenerationAction = "apply" | "discard";

export interface ProposalError {
  message: string;
  detail?: string; // the backend's own words, when it says what went wrong
}

const STUDENTS_HREF = "/head-of-transport/students";
export const ROUTES_HREF = "/head-of-transport/routes";

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// Known codes get a plain explanation; any other code shows the backend's
// message under a general line, as the contract asks.
const UNPLACED_TEXT: Record<string, string> = {
  CAPACITY_EXCEEDED:
    "Not enough seats: the school's vehicles have fewer seats than students. Add a vehicle with a driver, or put this student on a route by hand.",
  ARRIVAL_TIME_UNREACHABLE:
    "Too far to reach school on time: no route starting at 06:00 or later could pick this student up. You can still add them to a route by hand.",
  NO_PIN: "No map pin, so the student can't be placed.",
};
const UNKNOWN_REASON = "This student couldn't be placed.";

const linkClass =
  "inline-flex items-center self-start text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-md";
const linkStyle = { color: colors.primary[300], outlineColor: colors.primary[400], minHeight: sizing.tapTarget };

const cardStyle = {
  padding: spacing.lg,
  backgroundColor: darkTheme.surface.card,
  border: `1px solid ${darkTheme.surface.cardBorder}`,
  boxShadow: darkTheme.surface.cardShadow,
  borderRadius: radius.lg,
};

function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center text-xs font-medium"
      style={{
        padding: `${spacing.xs} ${spacing.sm}`,
        borderRadius: radius.full,
        border: `1px solid ${color}`,
        color,
      }}
    >
      {children}
    </span>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>
      {children}
    </h3>
  );
}

function PlannedRouteCard({ route, index, color }: { route: PlannedRoute; index: number; color?: string }) {
  const headingId = `planned-route-${index}`;
  const isNew = route.existingRouteId === null;
  const isEmptied = route.stops.length === 0;
  return (
    <li className="list-none flex flex-col" style={{ ...cardStyle, gap: spacing.md }}>
      <div className="flex flex-col" style={{ gap: spacing.sm }}>
        <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
          <h4 id={headingId} className="text-base font-semibold break-words" style={{ color: darkTheme.text.primary }}>
            {route.name}
          </h4>
          {isNew ? (
            <Pill color={colors.primary[300]}>New route</Pill>
          ) : (
            <Pill color={darkTheme.text.secondary}>Updates existing route</Pill>
          )}
          {isEmptied && <Pill color={colors.warning[500]}>Emptied</Pill>}
        </div>
        <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
          <LicensePlate plateNumber={route.vehicle.plateNumber} />
          <span className="flex items-center text-sm" style={{ gap: spacing.xs, color: darkTheme.text.secondary }}>
            <DriverIcon size={iconSize.sm} />
            {route.driver.firstName} {route.driver.lastName}
          </span>
        </div>
        <p className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
          {route.stops.length} of {route.vehicle.capacity} seats
        </p>
      </div>

      {isEmptied ? (
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          No students are planned for this route. Everyone on it today leaves it.
        </p>
      ) : (
        <ol
          aria-label={`Students on ${route.name}, in pickup order`}
          className="flex flex-col"
          style={{ gap: spacing.sm, padding: 0, margin: 0 }}
        >
          {route.stops.map((stop) => (
            <li key={stop.studentId} className="list-none flex items-center" style={{ gap: spacing.sm }}>
              <Badge fill={color}>{stop.position}</Badge>
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
      )}

      {route.leaving.length > 0 && (
        <div className="flex flex-col" style={{ gap: spacing.xs }}>
          <h5 className="text-sm font-semibold" style={{ color: darkTheme.text.primary }}>
            Leaving this route
          </h5>
          <ul aria-label={`Leaving ${route.name}`} className="flex flex-col" style={{ gap: spacing.xs, padding: 0, margin: 0 }}>
            {route.leaving.map((student) => (
              <li key={student.studentId} className="list-none text-sm break-words" style={{ color: darkTheme.text.secondary }}>
                {student.firstName} {student.lastName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function UnplacedItem({ student }: { student: UnplacedStudent }) {
  const explanation = UNPLACED_TEXT[student.reason.code];
  return (
    <li className="list-none flex flex-col" style={{ gap: spacing.xs }}>
      <span className="text-sm font-medium break-words" style={{ color: darkTheme.text.primary }}>
        {student.firstName} {student.lastName}
      </span>
      <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
        {explanation ?? UNKNOWN_REASON}
      </span>
      {student.reason.message && (
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {student.reason.message}
        </span>
      )}
      {student.reason.code === "NO_PIN" && (
        <Link href={STUDENTS_HREF} className={linkClass} style={linkStyle}>
          Add a pin on the Students page
        </Link>
      )}
    </li>
  );
}

interface FleetProposalViewProps {
  proposal: FleetProposal;
  headingRef: RefObject<HTMLHeadingElement | null>;
  busy: GenerationAction | undefined;
  error?: ProposalError;
  stale?: boolean; // apply answered 409: the data changed, so only Discard or Generate again
  onApply: () => void;
  onDiscard: () => void;
  onGenerateAgain: () => void;
}

export function FleetProposalView({
  proposal,
  headingRef,
  busy,
  error,
  stale = false,
  onApply,
  onDiscard,
  onGenerateAgain,
}: FleetProposalViewProps) {
  const [confirming, setConfirming] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Set when the confirm closes without applying, so focus goes back to Apply.
  const focusApplyRef = useRef(false);
  const canApply = proposal.id !== null;
  const colorFor = routeColorsFor(proposal);
  const updatedCount = proposal.routes.filter((route) => route.existingRouteId !== null).length;

  // Apply and Discard are disabled during their request, so focus has fallen
  // to the page by the time a failure comes back; the alert takes it.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (focusApplyRef.current) {
      focusApplyRef.current = false;
      applyRef.current?.focus();
    }
  }, [confirming]);

  function cancelConfirm() {
    focusApplyRef.current = true;
    setConfirming(false);
  }

  function confirmApply() {
    setConfirming(false);
    onApply();
  }

  // Escape only ever backs out of the confirm. It never applies or discards.
  function handleConfirmKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelConfirm();
  }

  return (
    <section aria-labelledby="proposal-heading" className="flex flex-col" style={{ gap: spacing.lg }}>
      <div className="flex flex-col" style={{ gap: spacing.xs }}>
        <h2
          ref={headingRef}
          id="proposal-heading"
          tabIndex={-1}
          className="text-lg font-semibold"
          style={{ color: darkTheme.text.primary }}
        >
          {canApply ? "Proposed routes" : "Nothing to apply"}
        </h2>
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {canApply
            ? `${plural(proposal.routes.length, "route")}, ${plural(proposal.unplaced.length, "student")} not placed. Nothing changes until you apply it.`
            : "No route could be planned, so there is nothing to apply. Nothing was changed."}
        </p>
      </div>

      <GenerationMap proposal={proposal} />

      {proposal.routes.length > 0 && (
        <section aria-labelledby="planned-routes-heading" className="flex flex-col" style={{ gap: spacing.sm }}>
          <SectionHeading id="planned-routes-heading">Planned routes</SectionHeading>
          <ul role="list" className="flex flex-col" style={{ gap: spacing.md, padding: 0, margin: 0 }}>
            {proposal.routes.map((route, index) => (
              <PlannedRouteCard
                key={route.vehicle.id}
                route={route}
                index={index}
                color={colorFor.get(route.vehicle.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="unplaced-heading" className="flex flex-col" style={{ ...cardStyle, gap: spacing.sm }}>
        <SectionHeading id="unplaced-heading">Students not placed ({proposal.unplaced.length})</SectionHeading>
        {proposal.unplaced.length === 0 ? (
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Every active student is on a planned route.
          </p>
        ) : (
          <ul role="list" className="flex flex-col" style={{ gap: spacing.md, padding: 0, margin: 0 }}>
            {proposal.unplaced.map((student) => (
              <UnplacedItem key={student.studentId} student={student} />
            ))}
          </ul>
        )}
      </section>

      {proposal.excludedVehicles.length > 0 && (
        <section aria-labelledby="excluded-heading" className="flex flex-col" style={{ ...cardStyle, gap: spacing.sm }}>
          <SectionHeading id="excluded-heading">Vehicles not used</SectionHeading>
          <ul role="list" className="flex flex-col" style={{ gap: spacing.md, padding: 0, margin: 0 }}>
            {proposal.excludedVehicles.map((excluded) => (
              <li key={excluded.vehicle.id} className="list-none flex flex-col items-start" style={{ gap: spacing.xs }}>
                <LicensePlate plateNumber={excluded.vehicle.plateNumber} />
                <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
                  {excluded.message}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div ref={errorRef} role="alert" tabIndex={-1} className="flex flex-col" style={{ gap: spacing.xs }}>
          <p className="text-sm" style={{ color: colors.error[500] }}>
            {error.message}
          </p>
          {error.detail && (
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              {error.detail}
            </p>
          )}
        </div>
      )}

      {canApply && confirming && !stale ? (
        <div
          role="group"
          aria-labelledby="confirm-apply-text"
          onKeyDown={handleConfirmKeyDown}
          className="flex flex-col"
          style={{ ...cardStyle, gap: spacing.sm }}
        >
          <p id="confirm-apply-text" className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
            {`Apply ${plural(proposal.routes.length, "route")}? This replaces the students on ${plural(updatedCount, "existing route")} and can't be undone.`}
          </p>
          <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
            <Button ref={confirmRef} onClick={confirmApply}>
              Confirm apply
            </Button>
            <Button variant="secondary" onClick={cancelConfirm}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
          {canApply && stale ? (
            <>
              <Button disabled={busy !== undefined} onClick={onGenerateAgain}>
                Generate again
              </Button>
              <Button variant="secondary" disabled={busy !== undefined} onClick={onDiscard}>
                {busy === "discard" ? "Discarding…" : "Discard"}
              </Button>
            </>
          ) : canApply ? (
            <>
              <Button ref={applyRef} disabled={busy !== undefined} onClick={() => setConfirming(true)}>
                {busy === "apply" ? "Applying…" : "Apply all"}
              </Button>
              <Button variant="secondary" disabled={busy !== undefined} onClick={onDiscard}>
                {busy === "discard" ? "Discarding…" : "Discard"}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onGenerateAgain}>Generate again</Button>
              <ButtonLink variant="secondary" href={ROUTES_HREF}>
                Back to routes list
              </ButtonLink>
            </>
          )}
        </div>
      )}
    </section>
  );
}
