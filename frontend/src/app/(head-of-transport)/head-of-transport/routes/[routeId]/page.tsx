"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/Button";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { ArrowLeftIcon, DriverIcon } from "@/components/ui/icons";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import {
  addStudentToRoute,
  applyProposal,
  discardProposal,
  getRoute,
  listUnassignedStudents,
  proposeOptimization,
  removeStudentFromRoute,
  reorderStops,
  type Proposal,
  type Route,
  type Stop,
} from "@/lib/api/routes";
import type { Student } from "@/lib/api/students";
import { RouteListSkeleton } from "../RouteListSkeleton";
import { OptimizationPanel, differenceText, type ProposalAction } from "./OptimizationPanel";
import { RouteMap, type MapOrder } from "./RouteMap";
import { RouteStudentRow } from "./RouteStudentRow";
import { UnassignedStudentRow, type UnassignedEntry } from "./UnassignedStudentRow";
import {
  DropZone,
  StudentDragPreview,
  draggableId,
  dragData,
  overList,
  screenReaderInstructions,
  studentAnnouncements,
  studentIdFromDraggable,
  useStudentSensors,
  type MoveDirection,
} from "./studentDnd";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const STALE_PROPOSAL = "This proposal is out of date. Optimize again.";
const PROPOSAL_CLOSED =
  "The optimization proposal was closed because the stops changed. Optimize again for a new one.";
const STUDENTS_HREF = "/head-of-transport/students";

// A message about optimizing, shown under the Optimize button. `unpinned`
// names the students the backend's 409 listed as having no pin. `focus`
// moves focus to it; a stale proposal returns focus to Optimize instead.
interface OptimizeMessage {
  message: string;
  unpinned?: string[];
  focus: boolean;
}

// Tighter page padding on phones, so the rows keep their width. Token values
// go through CSS variables because Tailwind can't see runtime class names.
const pageStyle = {
  "--page-pad-phone": spacing.md,
  "--page-pad": spacing.xl,
  gap: spacing.xl,
  maxWidth: sizing.pageMaxWidth,
} as CSSProperties;

function toEntry(student: Student): UnassignedEntry {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    latitude: student.latitude,
    longitude: student.longitude,
  };
}

function entryFromStop(stop: Stop): UnassignedEntry {
  return {
    id: stop.studentId,
    firstName: stop.firstName,
    lastName: stop.lastName,
    latitude: stop.latitude,
    longitude: stop.longitude,
  };
}

function sortByName(entries: UnassignedEntry[]): UnassignedEntry[] {
  return [...entries].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  );
}

// Keeps "Not on a route" in step with the route the backend answered with:
// nobody who is a stop on it stays in the list, and `returned` (the student
// who just came off it) goes back in once.
function reconcile(prev: UnassignedEntry[], updated: Route, returned?: UnassignedEntry) {
  const onRoute = new Set(updated.stops.map((stop) => stop.studentId));
  const kept = prev.filter((entry) => !onRoute.has(entry.id) && entry.id !== returned?.id);
  return sortByName(returned && !onRoute.has(returned.id) ? [...kept, returned] : kept);
}

// A 409 for an inactive student comes as `errors.studentId`; the capacity
// 409 and the 404s come as the backend's `detail`. Any other status (a 500,
// say) has nothing the reader can act on, and with no `detail` its message is
// only ApiError's fallback, so it gets the generic text.
function errorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    return Object.values(error.errors)[0] || GENERIC_ERROR;
  }
  return error instanceof ApiError && (error.status === 404 || error.status === 409) && error.message
    ? error.message
    : GENERIC_ERROR;
}

// A 409 on optimize says why in `detail` (no stops, no school arrival time,
// another optimize running, or stops without a pin, which also lists them).
function optimizeFailure(error: unknown, route: Route): OptimizeMessage {
  if (error instanceof ApiError && error.status === 409 && error.studentIds?.length) {
    const ids = new Set(error.studentIds);
    const unpinned = route.stops
      .filter((stop) => ids.has(stop.studentId))
      .map((stop) => `${stop.firstName} ${stop.lastName}`);
    return { message: errorMessage(error), unpinned, focus: true };
  }
  return { message: errorMessage(error), focus: true };
}

export default function RouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>();

  const [route, setRoute] = useState<Route | null>(null);
  const [unassigned, setUnassigned] = useState<UnassignedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<"not-found" | "error" | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [pendingId, setPendingId] = useState<string | undefined>();
  const [isReordering, setIsReordering] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [draggingName, setDraggingName] = useState<string | undefined>();
  // The open optimization proposal (SCRUM-221). It never changes `route`;
  // only Apply does, from the Route the backend answers with.
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [mapView, setMapView] = useState<MapOrder>("proposed");
  const [optimizeBusy, setOptimizeBusy] = useState<"propose" | ProposalAction | undefined>();
  const [optimizeMessage, setOptimizeMessage] = useState<OptimizeMessage | undefined>();
  const [panelError, setPanelError] = useState<string | undefined>();

  // Set synchronously, so a drop and a button press in the same moment can't
  // both start a request before `pendingId` re-renders the page.
  const isRequestInFlightRef = useRef(false);
  // Bumped by every load and on leaving the page. An answer that arrives
  // after a newer load (another route, or Try again) is dropped, so it can't
  // write one route's students over another's.
  const loadIdRef = useRef(0);
  const focusHeadingAfterLoadRef = useRef(false);
  const sensors = useStudentSensors();

  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const onRouteHeadingRef = useRef<HTMLHeadingElement>(null);
  const unassignedHeadingRef = useRef<HTMLHeadingElement>(null);
  const actionErrorRef = useRef<HTMLParagraphElement>(null);
  const optimizeButtonRef = useRef<HTMLButtonElement>(null);
  const optimizeMessageRef = useRef<HTMLDivElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  // Set when the panel closes by its own buttons; focus goes back to Optimize
  // once the request is over, because a disabled button can't take focus.
  const focusOptimizeRef = useRef(false);
  // Set by a Move up/down that succeeded. The button was disabled during the
  // request and may be gone now (the stop reached the top or the bottom), so
  // focus goes back to it, or to its partner, once the row has re-rendered.
  const focusMoveRef = useRef<{ studentId: string; direction: MoveDirection } | undefined>(undefined);

  const fetchPage = useCallback(
    () => Promise.all([getRoute(routeId), listUnassignedStudents()]),
    [routeId],
  );

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setIsLoading(true);
    setLoadError(undefined);
    setActionError(undefined);
    setAnnouncement("");
    setProposal(null);
    setOptimizeMessage(undefined);
    setPanelError(undefined);
    try {
      const [routeData, unassignedData] = await fetchPage();
      if (loadId !== loadIdRef.current) return;
      setRoute(routeData);
      setUnassigned(sortByName(unassignedData.map(toEntry)));
    } catch (error) {
      if (loadId !== loadIdRef.current) return;
      setLoadError(error instanceof ApiError && error.status === 404 ? "not-found" : "error");
    } finally {
      if (loadId === loadIdRef.current) setIsLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    load();
    return () => {
      // A counter, not a DOM node: bumping its latest value is the point.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      loadIdRef.current++;
    };
  }, [load]);

  // "Try again" unmounts itself, and so does the route when it turns out to be
  // deleted, so focus goes to the heading of whatever replaced it instead of
  // falling to <body>.
  useEffect(() => {
    if (!isLoading && focusHeadingAfterLoadRef.current) {
      focusHeadingAfterLoadRef.current = false;
      pageHeadingRef.current?.focus();
    }
  }, [isLoading, loadError]);

  // The alert only exists once it has a message, so it's focused after that render.
  useEffect(() => {
    if (actionError) actionErrorRef.current?.focus();
  }, [actionError]);

  useEffect(() => {
    if (optimizeMessage?.focus) optimizeMessageRef.current?.focus();
  }, [optimizeMessage]);

  // A proposal only ever opens from Optimize, so this runs once per opening.
  useEffect(() => {
    if (proposal) panelHeadingRef.current?.focus();
  }, [proposal]);

  useEffect(() => {
    if (!focusOptimizeRef.current || optimizeBusy || proposal) return;
    focusOptimizeRef.current = false;
    const button = optimizeButtonRef.current;
    // After a reload the route may have no stops left, so Optimize is disabled.
    if (button && !button.disabled) button.focus();
    else pageHeadingRef.current?.focus();
  }, [optimizeBusy, proposal, route]);

  useEffect(() => {
    const target = focusMoveRef.current;
    if (!target || isReordering) return;
    focusMoveRef.current = undefined;
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[data-move-for]"),
    ).filter((button) => button.dataset.moveFor === target.studentId);
    const button = buttons.find((b) => b.dataset.move === target.direction) ?? buttons[0];
    if (button) button.focus();
    else onRouteHeadingRef.current?.focus();
  }, [route, isReordering]);

  function retry() {
    focusHeadingAfterLoadRef.current = true;
    load();
  }

  const isAnyActionPending = pendingId !== undefined || optimizeBusy !== undefined || isReordering;
  const seatsLeft = route?.seatsLeft ?? 0;
  const isOverCapacity = route != null && seatsLeft < 0;
  const isFull = route != null && seatsLeft <= 0;
  const addDisabledReason = isOverCapacity
    ? "Vehicle is over capacity."
    : isFull
      ? "Vehicle is full."
      : undefined;
  // The header warning; also why a drop on "On this route" is refused.
  const capacityWarning = !route
    ? undefined
    : isOverCapacity
      ? `This vehicle is over capacity by ${-seatsLeft} seat${-seatsLeft === 1 ? "" : "s"}. Remove a student to bring it back under capacity.`
      : isFull
        ? `This vehicle is full (${route.vehicle.capacity} of ${route.vehicle.capacity} seats). Remove a student before adding another.`
        : undefined;

  // Runs one add or remove. Only one runs at a time; the buttons and drag
  // handles are disabled meanwhile, and the ref stops a second one that
  // starts before that render.
  async function changeRoute(
    studentId: string,
    send: (routeId: string) => Promise<Route>,
    onSuccess: (updated: Route) => void,
  ) {
    if (!route || isRequestInFlightRef.current) return;
    const loadId = loadIdRef.current;
    const closedProposal = proposal !== null;
    isRequestInFlightRef.current = true;
    setActionError(undefined);
    setAnnouncement("");
    // An open proposal was made for the stops as they are now, so any change
    // makes it stale. It just closes, and the announcement says so; the next
    // Optimize replaces it on the backend.
    setProposal(null);
    setOptimizeMessage(undefined);
    setPanelError(undefined);
    setPendingId(studentId);
    try {
      const updated = await send(route.id);
      if (loadId !== loadIdRef.current) return;
      setRoute(updated);
      onSuccess(updated);
      if (closedProposal) setAnnouncement((text) => `${text} ${PROPOSAL_CLOSED}`);
    } catch (error) {
      if (loadId !== loadIdRef.current) return;
      setActionError(errorMessage(error));
      if (closedProposal) setAnnouncement(PROPOSAL_CLOSED);
      // A refusal can mean the page is out of date (the vehicle filled up, the
      // student was made inactive, or the route was deleted elsewhere), so
      // redraw both lists and the counter from the backend before allowing the
      // next change. A student on another route is not a refusal: the backend
      // moves them, and this page only offers students who are on no route.
      await resync(loadId);
    } finally {
      isRequestInFlightRef.current = false;
      setPendingId(undefined);
    }
  }

  // Redraws the route, both lists and the counter from the backend. A route
  // that is gone shows the not-found state; any other failure keeps what's
  // shown, since the caller has already said its change didn't go through.
  async function resync(loadId: number) {
    try {
      const [routeData, unassignedData] = await fetchPage();
      if (loadId !== loadIdRef.current) return;
      setRoute(routeData);
      setUnassigned(sortByName(unassignedData.map(toEntry)));
    } catch (reloadError) {
      if (loadId !== loadIdRef.current) return;
      if (reloadError instanceof ApiError && reloadError.status === 404) {
        focusHeadingAfterLoadRef.current = true;
        setLoadError("not-found");
      }
    }
  }

  // Asks for a proposal. The route stays as it is; the panel shows both orders.
  async function optimize() {
    if (!route || route.stops.length === 0 || isRequestInFlightRef.current) return;
    const loadId = loadIdRef.current;
    const asked = route;
    isRequestInFlightRef.current = true;
    setActionError(undefined);
    setOptimizeMessage(undefined);
    setAnnouncement("");
    setOptimizeBusy("propose");
    try {
      const result = await proposeOptimization(asked.id);
      if (loadId !== loadIdRef.current) return;
      setPanelError(undefined);
      setMapView("proposed");
      setProposal(result);
      setAnnouncement(
        result.feasible && result.proposed
          ? `Proposal ready: ${differenceText(result.current, result.proposed)}. Nothing changes until you apply it.`
          : "This route can't be optimized. The reasons are listed.",
      );
    } catch (error) {
      if (loadId !== loadIdRef.current) return;
      setOptimizeMessage(optimizeFailure(error, asked));
    } finally {
      isRequestInFlightRef.current = false;
      setOptimizeBusy(undefined);
    }
  }

  // Apply or Discard. A 404 (the proposal is gone or was replaced) or a 409
  // (the route changed since) means it is stale: it closes and the page reloads.
  async function settleProposal(action: ProposalAction) {
    const open = proposal;
    if (!route || !open?.id || !open.proposed || isRequestInFlightRef.current) return;
    const loadId = loadIdRef.current;
    isRequestInFlightRef.current = true;
    setPanelError(undefined);
    setAnnouncement("");
    setOptimizeBusy(action);
    try {
      if (action === "apply") {
        const updated = await applyProposal(route.id, open.id);
        if (loadId !== loadIdRef.current) return;
        setRoute(updated);
        setUnassigned((prev) => reconcile(prev, updated));
        const difference = differenceText(open.current, open.proposed);
        setAnnouncement(
          `New order applied. ${difference === "No change" ? "No change in driving time" : difference}.`,
        );
      } else {
        await discardProposal(route.id, open.id);
        if (loadId !== loadIdRef.current) return;
        setAnnouncement("Proposal discarded. The route is unchanged.");
      }
      focusOptimizeRef.current = true;
      setProposal(null);
    } catch (error) {
      if (loadId !== loadIdRef.current) return;
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        focusOptimizeRef.current = true;
        setProposal(null);
        setOptimizeMessage({ message: STALE_PROPOSAL, focus: false });
        await resync(loadId);
      } else {
        setPanelError(errorMessage(error));
      }
    } finally {
      isRequestInFlightRef.current = false;
      setOptimizeBusy(undefined);
    }
  }

  // An infeasible answer has nothing saved, so closing it sends nothing.
  function closeProposal() {
    focusOptimizeRef.current = true;
    setProposal(null);
    setPanelError(undefined);
  }

  function handleAdd(entry: UnassignedEntry) {
    return changeRoute(
      entry.id,
      (id) => addStudentToRoute(id, entry.id),
      (updated) => {
        setUnassigned((prev) => reconcile(prev, updated));
        setAnnouncement(
          `${entry.firstName} ${entry.lastName} added to the route. ${updated.studentCount} of ${updated.vehicle.capacity} seats filled.`,
        );
        onRouteHeadingRef.current?.focus();
      },
    );
  }

  function handleRemove(stop: Stop) {
    return changeRoute(
      stop.studentId,
      (id) => removeStudentFromRoute(id, stop.studentId),
      (updated) => {
        setUnassigned((prev) => reconcile(prev, updated, entryFromStop(stop)));
        setAnnouncement(
          `${stop.firstName} ${stop.lastName} removed from the route. ${updated.studentCount} of ${updated.vehicle.capacity} seats filled.`,
        );
        unassignedHeadingRef.current?.focus();
      },
    );
  }

  // The full new order, drag or keyboard alike. Only one runs at a time,
  // same as changeRoute; on a failure nothing here has touched `route`, so
  // the order the page shows is already the one before the attempt.
  // `moved` is the stop that was dragged or moved; `direction` is set for
  // the Move buttons, so focus can go back to them.
  async function reorder(studentIds: string[], moved: Stop, direction?: MoveDirection) {
    if (!route || isRequestInFlightRef.current) return;
    const loadId = loadIdRef.current;
    const closedProposal = proposal !== null;
    isRequestInFlightRef.current = true;
    setActionError(undefined);
    setAnnouncement("");
    // The order it was made for just changed, so the proposal is stale.
    setProposal(null);
    setOptimizeMessage(undefined);
    setPanelError(undefined);
    setIsReordering(true);
    try {
      const updated = await reorderStops(route.id, studentIds);
      if (loadId !== loadIdRef.current) return;
      setRoute(updated);
      const position = updated.stops.find((s) => s.studentId === moved.studentId)?.position;
      const text = position
        ? `${moved.firstName} ${moved.lastName} moved to stop ${position} of ${updated.stops.length}.`
        : "Stop order updated.";
      setAnnouncement(closedProposal ? `${text} ${PROPOSAL_CLOSED}` : text);
      if (direction) focusMoveRef.current = { studentId: moved.studentId, direction };
    } catch (error) {
      if (loadId !== loadIdRef.current) return;
      setActionError(errorMessage(error));
      if (closedProposal) setAnnouncement(PROPOSAL_CLOSED);
    } finally {
      isRequestInFlightRef.current = false;
      setIsReordering(false);
    }
  }

  function moveStop(stop: Stop, direction: -1 | 1) {
    if (!route) return;
    const ids = route.stops.map((s) => s.studentId);
    const index = ids.indexOf(stop.studentId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= ids.length) return;
    reorder(arrayMove(ids, index, target), stop, direction === -1 ? "up" : "down");
  }

  function handleMoveUp(stop: Stop) {
    moveStop(stop, -1);
  }

  function handleMoveDown(stop: Stop) {
    moveStop(stop, 1);
  }

  function handleDragStart({ active }: DragStartEvent) {
    setDraggingName(dragData(active)?.name);
  }

  // A drop runs the same handler as the button. A drop back on the list the
  // card came from, or on "On this route" while the vehicle is full, does
  // nothing; the drag announcement and the highlighted list say why. A drop
  // on another stop within "On this route" reorders instead (SCRUM-221/SCRUM-73).
  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraggingName(undefined);
    const data = dragData(active);
    if (!data || !over) return;
    const list = overList(over);
    if (!list) return;

    if (list !== data.from) {
      if (data.from === "unassigned") {
        if (capacityWarning) return;
        handleAdd(data.entry);
      } else {
        handleRemove(data.stop);
      }
      return;
    }

    if (data.from === "on-route" && route && active.id !== over.id) {
      const ids = route.stops.map((stop) => stop.studentId);
      const oldIndex = ids.indexOf(data.stop.studentId);
      const newIndex = ids.indexOf(studentIdFromDraggable(over.id));
      if (oldIndex !== -1 && newIndex !== -1) reorder(arrayMove(ids, oldIndex, newIndex), data.stop);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto w-full flex flex-col p-[var(--page-pad-phone)] sm:p-[var(--page-pad)]"
        style={pageStyle}
      >
        <Link
          href="/head-of-transport/routes"
          className="inline-flex items-center self-start text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-md"
          style={{ gap: spacing.xs, color: darkTheme.text.secondary, outlineColor: colors.primary[400] }}
        >
          <ArrowLeftIcon size={16} />
          Back to routes
        </Link>

        <p aria-live="polite" role="status" className="sr-only">
          {announcement}
        </p>

        {isLoading && (
          <>
            <span className="sr-only" role="status">
              Loading route…
            </span>
            <RouteListSkeleton />
          </>
        )}

        {!isLoading && loadError === "not-found" && (
          <div
            className="flex flex-col items-start text-left"
            style={{
              padding: spacing.xl,
              border: `1px dashed ${darkTheme.surface.cardBorder}`,
              borderRadius: radius.lg,
              backgroundColor: darkTheme.surface.emptyState,
              gap: spacing.sm,
            }}
          >
            <h1
              ref={pageHeadingRef}
              tabIndex={-1}
              className="text-2xl font-semibold"
              style={{ color: darkTheme.text.primary }}
            >
              Route not found
            </h1>
            <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: sizing.emptyStateText }}>
              This route may have been deleted. Go back to the routes list and pick another one.
            </p>
          </div>
        )}

        {!isLoading && loadError === "error" && (
          <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
            <h1
              ref={pageHeadingRef}
              tabIndex={-1}
              className="text-2xl font-semibold"
              style={{ color: darkTheme.text.primary }}
            >
              Couldn&apos;t load this route
            </h1>
            <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
              {GENERIC_ERROR}
            </p>
            <Button variant="secondary" onClick={retry}>
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !loadError && route && (
          <>
            <header className="flex flex-col" style={{ gap: spacing.sm }}>
              <h1
                ref={pageHeadingRef}
                tabIndex={-1}
                className="text-2xl font-semibold break-words"
                style={{ color: darkTheme.text.primary }}
              >
                {route.name}
              </h1>
              <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
                <LicensePlate plateNumber={route.vehicle.plateNumber} />
                <span
                  className="flex items-center text-sm"
                  style={{ gap: spacing.xs, color: darkTheme.text.secondary }}
                >
                  <DriverIcon size={16} />
                  {route.driver.firstName} {route.driver.lastName}
                </span>
              </div>
              <p className="text-base font-semibold" style={{ color: darkTheme.text.primary }}>
                {route.studentCount} of {route.vehicle.capacity} seats
              </p>
              {capacityWarning && (
                <p
                  role="status"
                  className="text-sm font-medium"
                  style={{ color: isOverCapacity ? colors.error[500] : colors.warning[500] }}
                >
                  {capacityWarning}
                </p>
              )}
            </header>

            {actionError && (
              <p
                ref={actionErrorRef}
                role="alert"
                tabIndex={-1}
                className="text-sm"
                style={{ color: colors.error[500] }}
              >
                {actionError}
              </p>
            )}

            <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
              <Button
                ref={optimizeButtonRef}
                variant="secondary"
                disabled={route.stops.length === 0 || isAnyActionPending || proposal !== null}
                aria-describedby={route.stops.length === 0 ? "optimize-hint" : undefined}
                onClick={optimize}
              >
                {optimizeBusy === "propose" ? "Optimizing…" : "Optimize"}
              </Button>
              {route.stops.length === 0 && (
                <p id="optimize-hint" className="text-sm" style={{ color: darkTheme.text.muted }}>
                  Add a student to the route before optimizing.
                </p>
              )}
              {optimizeMessage && (
                <div
                  ref={optimizeMessageRef}
                  role="alert"
                  tabIndex={-1}
                  className="flex flex-col"
                  style={{ gap: spacing.xs }}
                >
                  <p className="text-sm" style={{ color: colors.error[500] }}>
                    {optimizeMessage.message}
                  </p>
                  {optimizeMessage.unpinned && optimizeMessage.unpinned.length > 0 && (
                    <>
                      <ul className="flex flex-col" style={{ gap: spacing.xs, padding: 0, margin: 0 }}>
                        {optimizeMessage.unpinned.map((name) => (
                          <li key={name} className="list-none text-sm" style={{ color: darkTheme.text.secondary }}>
                            {name}
                          </li>
                        ))}
                      </ul>
                      <Link
                        href={STUDENTS_HREF}
                        className="inline-flex items-center self-start text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-md"
                        style={{ color: colors.primary[300], outlineColor: colors.primary[400], minHeight: sizing.tapTarget }}
                      >
                        Add pins on the Students page
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            {proposal && (
              <OptimizationPanel
                proposal={proposal}
                headingRef={panelHeadingRef}
                busy={optimizeBusy === "apply" || optimizeBusy === "discard" ? optimizeBusy : undefined}
                error={panelError}
                onApply={() => settleProposal("apply")}
                onDiscard={() => settleProposal("discard")}
                onClose={closeProposal}
              />
            )}

            {/* Above the lists, so on a phone the map comes first. Drawn from `route`, so it
                follows every add, remove and drop without another request. While a proposal
                is open it can also show the proposed order. */}
            <RouteMap
              route={route}
              comparison={
                proposal?.feasible && proposal.proposed
                  ? { proposedStops: proposal.proposed.stops, view: mapView, onViewChange: setMapView }
                  : undefined
              }
            />

            <DndContext
              id="route-students"
              sensors={sensors}
              accessibility={{
                announcements: studentAnnouncements(capacityWarning),
                screenReaderInstructions,
              }}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setDraggingName(undefined)}
            >
              <DropZone
                id="on-route"
                labelledBy="on-route-heading"
                refuses={!!capacityWarning}
                refusal={capacityWarning}
              >
                <h2
                  ref={onRouteHeadingRef}
                  id="on-route-heading"
                  tabIndex={-1}
                  className="text-lg font-semibold"
                  style={{ color: darkTheme.text.primary, marginBottom: spacing.sm }}
                >
                  On this route
                </h2>
                {route.stops.length === 0 ? (
                  <p className="text-sm" style={{ color: darkTheme.text.muted }}>
                    No students on this route yet.
                  </p>
                ) : (
                  <SortableContext
                    items={route.stops.map((stop) => draggableId(stop.studentId))}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul role="list" className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
                      <AnimatePresence initial={false}>
                        {route.stops.map((stop, index) => (
                          <RouteStudentRow
                            key={stop.studentId}
                            stop={stop}
                            isPending={pendingId === stop.studentId}
                            disabled={isAnyActionPending}
                            canMoveUp={index > 0}
                            canMoveDown={index < route.stops.length - 1}
                            onRemove={handleRemove}
                            onMoveUp={handleMoveUp}
                            onMoveDown={handleMoveDown}
                          />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </SortableContext>
                )}
              </DropZone>

              <DropZone id="unassigned" labelledBy="unassigned-heading" refuses={false}>
                <h2
                  ref={unassignedHeadingRef}
                  id="unassigned-heading"
                  tabIndex={-1}
                  className="text-lg font-semibold"
                  style={{ color: darkTheme.text.primary, marginBottom: spacing.sm }}
                >
                  Not on a route
                </h2>
                {unassigned.length === 0 ? (
                  <p className="text-sm" style={{ color: darkTheme.text.muted }}>
                    No students are waiting for a route.
                  </p>
                ) : (
                  <ul role="list" className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
                    <AnimatePresence initial={false}>
                      {unassigned.map((entry) => (
                        <UnassignedStudentRow
                          key={entry.id}
                          entry={entry}
                          isPending={pendingId === entry.id}
                          disabled={isAnyActionPending || !!addDisabledReason}
                          dragDisabled={isAnyActionPending}
                          disabledReason={addDisabledReason}
                          onAdd={handleAdd}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </DropZone>

              {/* No drop animation: the lists' own enter/exit motion shows the move. */}
              <DragOverlay dropAnimation={null}>
                {draggingName && <StudentDragPreview name={draggingName} />}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </main>
    </MotionConfig>
  );
}
