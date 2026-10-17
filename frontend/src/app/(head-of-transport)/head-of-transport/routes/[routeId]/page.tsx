"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Button } from "@/components/ui/Button";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { ArrowLeftIcon, DriverIcon } from "@/components/ui/icons";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import {
  addStudentToRoute,
  getRoute,
  listUnassignedStudents,
  removeStudentFromRoute,
  type Route,
  type Stop,
} from "@/lib/api/routes";
import type { Student } from "@/lib/api/students";
import { RouteListSkeleton } from "../RouteListSkeleton";
import { RouteStudentRow } from "./RouteStudentRow";
import { UnassignedStudentRow, type UnassignedEntry } from "./UnassignedStudentRow";
import {
  DropZone,
  StudentDragPreview,
  dragData,
  screenReaderInstructions,
  studentAnnouncements,
  useStudentSensors,
} from "./studentDnd";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

const GENERIC_ERROR = "Something went wrong. Please try again.";

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
// 409 and the 404s come as the backend's `detail`.
function errorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    return Object.values(error.errors)[0] || GENERIC_ERROR;
  }
  return error instanceof ApiError && error.message ? error.message : GENERIC_ERROR;
}

export default function RouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>();

  const [route, setRoute] = useState<Route | null>(null);
  const [unassigned, setUnassigned] = useState<UnassignedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<"not-found" | "error" | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [pendingId, setPendingId] = useState<string | undefined>();
  const [announcement, setAnnouncement] = useState("");
  const [draggingName, setDraggingName] = useState<string | undefined>();

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

  function retry() {
    focusHeadingAfterLoadRef.current = true;
    load();
  }

  const isAnyActionPending = pendingId !== undefined;
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
    isRequestInFlightRef.current = true;
    setActionError(undefined);
    setAnnouncement("");
    setPendingId(studentId);
    try {
      const updated = await send(route.id);
      if (loadId !== loadIdRef.current) return;
      setRoute(updated);
      onSuccess(updated);
    } catch (error) {
      if (loadId !== loadIdRef.current) return;
      setActionError(errorMessage(error));
      // A refusal can mean the page is out of date (the vehicle filled up, the
      // student was made inactive, or the route was deleted elsewhere), so
      // redraw both lists and the counter from the backend before allowing the
      // next change. A student on another route is not a refusal: the backend
      // moves them, and this page only offers students who are on no route.
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
        // Otherwise keep what's shown; the alert already says the change didn't go through.
      }
    } finally {
      isRequestInFlightRef.current = false;
      setPendingId(undefined);
    }
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

  function handleDragStart({ active }: DragStartEvent) {
    setDraggingName(dragData(active)?.name);
  }

  // A drop runs the same handler as the button. A drop back on the list the
  // card came from, or on "On this route" while the vehicle is full, does
  // nothing; the drag announcement and the highlighted list say why.
  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraggingName(undefined);
    const data = dragData(active);
    if (!data || !over || over.id === data.from) return;
    if (data.from === "unassigned") {
      if (capacityWarning) return;
      handleAdd(data.entry);
    } else {
      handleRemove(data.stop);
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
                  <ul role="list" className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
                    <AnimatePresence initial={false}>
                      {route.stops.map((stop) => (
                        <RouteStudentRow
                          key={stop.studentId}
                          stop={stop}
                          isPending={pendingId === stop.studentId}
                          disabled={isAnyActionPending}
                          onRemove={handleRemove}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
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
