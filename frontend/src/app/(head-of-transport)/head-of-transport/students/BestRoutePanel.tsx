"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import {
  getBestRoute,
  placeStudentOnBestRoute,
  type BestRoute,
  type BestRoutePlacement,
  type RouteOption,
  type SkippedRoute,
} from "@/lib/api/roster";
import type { Route } from "@/lib/api/routes";
import type { Student } from "@/lib/api/students";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

interface BestRoutePanelProps {
  student: Student;
  /** Called with the route as it is after the placement (stops renumbered), and the placement itself. */
  onPlaced: (route: Route, placement: BestRoutePlacement) => void;
  /** Tells the caller whether the POST is in flight, so e.g. an Escape that closes the panel can be held off meanwhile. */
  onPlacingChange?: (isPlacing: boolean) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; data: BestRoute }
  // The server said this student can't be placed (not active, no pin, already
  // on a route, no school arrival time): asking again gives the same answer.
  | { kind: "blocked"; message: string }
  // A 5xx or a network failure: worth another try.
  | { kind: "failed"; message: string };

const UNKNOWN_FAILURE = "Something went wrong. Please try again.";

// The 401/403/404 texts of the other students screens.
function accessMessage(err: ApiError): string | null {
  if (err.status === 401) return "Your session has expired. Please sign in again.";
  if (err.status === 403) return "You do not have permission to place students on routes.";
  if (err.status === 404) return "This student could not be found. They may have been removed; refresh the list.";
  return null;
}

// ApiError's message is the backend's detail, or this fallback when it sent none.
function detailOf(err: ApiError): string | null {
  return err.message && err.message !== "Request failed" ? err.message : null;
}

function loadFailure(err: unknown): LoadState {
  if (err instanceof ApiValidationError) {
    return { kind: "blocked", message: err.errors.studentId || Object.values(err.errors).join(" ") || UNKNOWN_FAILURE };
  }
  if (err instanceof ApiError && err.status < 500) {
    const message = accessMessage(err) ?? detailOf(err) ?? "The best route could not be worked out for this student.";
    return { kind: "blocked", message };
  }
  return { kind: "failed", message: "Couldn't work out the best route. Please try again." };
}

function placeFailure(err: unknown): string {
  if (err instanceof ApiValidationError) {
    return err.errors.studentId || Object.values(err.errors).join(" ") || UNKNOWN_FAILURE;
  }
  if (err instanceof ApiError && err.status < 500) {
    return accessMessage(err) ?? detailOf(err) ?? UNKNOWN_FAILURE;
  }
  return UNKNOWN_FAILURE;
}

function extraMinutesText(minutes: number): string {
  if (minutes === 0) return "No extra driving time";
  return `+${minutes} extra ${minutes === 1 ? "minute" : "minutes"} of driving`;
}

function seatsText(seats: number): string {
  return `${seats} ${seats === 1 ? "seat" : "seats"} free before this student takes one`;
}

// The contract lists two reasons and may add more: anything else gets a neutral text.
function skipReasonText(reason: SkippedRoute["reason"]): string {
  if (reason === "FULL") return "Full: no free seat";
  if (reason === "STARTS_TOO_EARLY") return "Would have to start before 06:00 to fit this student in";
  return "Can't take this student";
}

function OptionFacts({ option }: { option: RouteOption }) {
  return (
    <ul className="flex flex-col" style={{ gap: spacing.xs, padding: 0, margin: 0 }}>
      <li className="list-none text-sm" style={{ color: darkTheme.text.secondary }}>Stop {option.position}</li>
      <li className="list-none text-sm" style={{ color: darkTheme.text.secondary }}>Pickup at {option.arrivalTime}</li>
      <li className="list-none text-sm" style={{ color: darkTheme.text.secondary }}>{extraMinutesText(option.extraMinutes)}</li>
      <li className="list-none text-sm" style={{ color: darkTheme.text.secondary }}>{seatsText(option.seatsLeft)}</li>
    </ul>
  );
}

// Same footprint as a loaded recommendation plus its button, so the panel
// doesn't jump when the answer arrives.
function LoadingSkeleton() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div aria-hidden="true" className="flex flex-col" style={{ gap: spacing.sm }}>
      {["148px", sizing.tapTarget].map((height, index) => (
        <motion.div
          key={height}
          style={{ height, borderRadius: radius.md, backgroundColor: darkTheme.surface.skeleton }}
          animate={prefersReducedMotion ? { opacity: 0.7 } : { opacity: [0.45, 0.85, 0.45] }}
          transition={
            prefersReducedMotion
              ? { duration: 0.2 }
              : { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: index * 0.15 }
          }
        />
      ))}
    </div>
  );
}

// SCRUM-287. Asks the server which route should take this student
// (GET .../best-route, read-only) and offers one action: place them on the
// recommended route (POST, which always uses the recommended route at its
// position). The other options are shown for comparison only, because the
// backend cannot place on them.
export function BestRoutePanel({ student, onPlaced, onPlacingChange }: BestRoutePanelProps) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [isPlacing, setIsPlacing] = useState(false);
  const [placed, setPlaced] = useState<BestRoutePlacement | null>(null);
  const [placeError, setPlaceError] = useState("");
  const [notice, setNotice] = useState("");
  const placingRef = useRef(false);
  const requestIdRef = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const placeButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const placeErrorId = useId();
  const name = `${student.firstName} ${student.lastName}`;
  const studentId = student.id;

  useEffect(() => {
    onPlacingChange?.(isPlacing);
  }, [isPlacing, onPlacingChange]);

  // Only the newest request may write the state: a retry, or a new student,
  // makes an earlier answer stale.
  const fetchBestRoute = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoad({ kind: "loading" });
    setPlaceError("");
    try {
      const data = await getBestRoute(studentId);
      if (requestId === requestIdRef.current) setLoad({ kind: "loaded", data });
    } catch (err) {
      if (requestId === requestIdRef.current) setLoad(loadFailure(err));
    }
  }, [studentId]);

  useEffect(() => {
    setPlaced(null);
    setNotice("");
    void fetchBestRoute();
    // A counter, not a DOM node: bumping it makes the pending answer stale.
    const requestIds = requestIdRef;
    return () => {
      requestIds.current++;
    };
  }, [fetchBestRoute]);

  const loadKind = load.kind;
  useEffect(() => {
    if (loadKind === "failed") retryButtonRef.current?.focus();
  }, [loadKind]);

  // The Place button is disabled while the POST is in flight, so a refusal
  // would leave focus on <body>: put it back on the button.
  useEffect(() => {
    if (!isPlacing && placeError) placeButtonRef.current?.focus();
  }, [isPlacing, placeError]);

  async function place(recommended: RouteOption) {
    if (placingRef.current) return;
    placingRef.current = true;
    setIsPlacing(true);
    setPlaceError("");
    setNotice(`Placing ${name} on ${recommended.routeName}…`);
    try {
      const placement = await placeStudentOnBestRoute(studentId);
      setPlaced(placement);
      setNotice(
        `${name} is on ${placement.route.name} as stop ${placement.position}, pickup at ${placement.arrivalTime}.`,
      );
      onPlaced(placement.route, placement);
      // The Place button is gone: keep focus inside the panel.
      headingRef.current?.focus();
    } catch (err) {
      setNotice("");
      setPlaceError(placeFailure(err));
    } finally {
      placingRef.current = false;
      setIsPlacing(false);
    }
  }

  const sectionStyle = {
    gap: spacing.md,
    padding: spacing.md,
    border: `1px solid ${darkTheme.surface.cardBorder}`,
    borderRadius: radius.md,
    backgroundColor: darkTheme.surface.card,
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col" style={sectionStyle}>
      <h3
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className="text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: darkTheme.text.primary, outlineColor: colors.primary[500] }}
      >
        Best route for {name}
      </h3>

      {/* Always mounted, so the loading, placing and placed messages are announced. */}
      <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
        {load.kind === "loading"
          ? `Finding the best route for ${name}. This can take a few seconds while each route's driving time is checked.`
          : notice}
      </p>

      {load.kind === "loading" && <LoadingSkeleton />}

      {load.kind === "blocked" && (
        <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
          {load.message}
        </p>
      )}

      {load.kind === "failed" && (
        <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            {load.message}
          </p>
          <Button
            ref={retryButtonRef}
            variant="secondary"
            onClick={() => fetchBestRoute()}
            style={{ minHeight: sizing.tapTarget }}
          >
            Retry
          </Button>
        </div>
      )}

      {load.kind === "loaded" && (
        <LoadedBestRoute
          data={load.data}
          name={name}
          placed={placed}
          isPlacing={isPlacing}
          placeError={placeError}
          placeErrorId={placeErrorId}
          placeButtonRef={placeButtonRef}
          onPlace={place}
          onCheckAgain={() => fetchBestRoute()}
        />
      )}
    </section>
  );
}

interface LoadedBestRouteProps {
  data: BestRoute;
  name: string;
  placed: BestRoutePlacement | null;
  isPlacing: boolean;
  placeError: string;
  placeErrorId: string;
  placeButtonRef: RefObject<HTMLButtonElement | null>;
  onPlace: (recommended: RouteOption) => void;
  onCheckAgain: () => void;
}

function LoadedBestRoute({
  data,
  name,
  placed,
  isPlacing,
  placeError,
  placeErrorId,
  placeButtonRef,
  onPlace,
  onCheckAgain,
}: LoadedBestRouteProps) {
  const { recommended, skipped } = data;
  // Kept in the order the server sent them (fewest extra minutes first).
  const others = recommended ? data.options.filter((option) => option.routeId !== recommended.routeId) : data.options;

  return (
    <div className="flex flex-col" style={{ gap: spacing.md }}>
      {recommended ? (
        <div
          className="flex flex-col"
          style={{
            gap: spacing.sm,
            padding: spacing.md,
            border: `1px solid ${colors.primary[400]}`,
            borderRadius: radius.md,
            backgroundColor: darkTheme.surface.input,
          }}
        >
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: colors.accent[300] }}>
            Recommended
          </span>
          <h4 className="text-base font-medium break-words" style={{ color: darkTheme.text.primary }}>
            {recommended.routeName}
          </h4>
          <OptionFacts option={recommended} />
        </div>
      ) : (
        <div
          className="flex flex-col"
          style={{
            gap: spacing.xs,
            padding: spacing.md,
            border: `1px dashed ${darkTheme.surface.cardBorder}`,
            borderRadius: radius.md,
            backgroundColor: darkTheme.surface.emptyState,
          }}
        >
          <p className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
            No route can take {name} right now.
          </p>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {skipped.length > 0
              ? "Every route was checked; the reason each one can't take them is listed below. Free a seat on a route, or add one, to place them."
              : "The school has no routes yet. Add a route first."}
          </p>
        </div>
      )}

      {recommended && !placed && (
        <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
          <Button
            ref={placeButtonRef}
            variant="primary"
            onClick={() => onPlace(recommended)}
            disabled={isPlacing}
            aria-describedby={placeError ? placeErrorId : undefined}
            style={{ minHeight: sizing.tapTarget }}
          >
            {isPlacing ? "Placing…" : `Place on ${recommended.routeName}`}
          </Button>
          {placeError && (
            <>
              <p id={placeErrorId} role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                {placeError}
              </p>
              <Button variant="secondary" onClick={onCheckAgain} disabled={isPlacing} style={{ minHeight: sizing.tapTarget }}>
                Check again
              </Button>
            </>
          )}
        </div>
      )}

      {placed && (
        <p className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
          Placed on {placed.route.name} as stop {placed.position}, pickup at {placed.arrivalTime}.
        </p>
      )}

      {others.length > 0 && (
        <div className="flex flex-col" style={{ gap: spacing.sm }}>
          <h4 className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
            Other routes that could take them
          </h4>
          <p className="text-xs" style={{ color: darkTheme.text.muted }}>
            For comparison only: this panel can only place {name} on the recommended route.
          </p>
          <ul aria-label="Other routes that could take them" className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
            {others.map((option) => (
              <li
                key={option.routeId}
                className="list-none flex flex-col"
                style={{
                  gap: spacing.xs,
                  padding: spacing.sm,
                  border: `1px solid ${darkTheme.surface.cardBorder}`,
                  borderRadius: radius.md,
                }}
              >
                <span className="text-sm font-medium break-words" style={{ color: darkTheme.text.primary }}>
                  {option.routeName}
                </span>
                <OptionFacts option={option} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="flex flex-col" style={{ gap: spacing.sm }}>
          <h4 className="text-sm font-medium" style={{ color: darkTheme.text.primary }}>
            Routes that can&apos;t take them
          </h4>
          <ul aria-label="Routes that can't take them" className="flex flex-col" style={{ gap: spacing.xs, padding: 0, margin: 0 }}>
            {skipped.map((route) => (
              <li key={route.routeId} className="list-none text-sm break-words" style={{ color: darkTheme.text.secondary }}>
                {route.routeName}: {skipReasonText(route.reason)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
