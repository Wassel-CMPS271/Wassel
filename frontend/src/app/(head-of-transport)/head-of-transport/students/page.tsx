"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { addressRequestsApi } from "@/lib/api/addressRequests";
import { getParents, type Parent } from "@/lib/api/parents";
import type { BestRoutePlacement } from "@/lib/api/roster";
import { getRouteAssignments, type Route, type RouteAssignment, type RouteAssignments } from "@/lib/api/routes";
import { addStudentWithAddress, getStudents, importStudents, matchesFilters, setStudentLocation, updateStudentAddress, STUDENT_STATUS_LABELS, type ImportRow, type NewStudentWithAddress, type StudentImport, type Student } from "@/lib/api/students";
import { AddStudentForm } from "./AddStudentForm";
import { AddressRequestsSection } from "./AddressRequestsSection";
import { ImportStudentsForm } from "./ImportStudentsForm";
import { StudentFilters, type RouteFilterValue, type RoutesStatus, type StatusFilterValue } from "./StudentFilters";
import { StudentListItem } from "./StudentListItem";
import { StudentListSkeleton } from "./StudentListSkeleton";
import { Button } from "@/components/ui/Button";
import { ToastViewport, useToastQueue } from "@/components/ui/Toast";
import { StudentIcon } from "@/components/ui/icons";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

// A student matches the route filter when it's "all" (no filter), "none"
// (on no route) or the id of the route they're a stop on.
function matchesRouteFilter(
  student: Student,
  routeFilter: RouteFilterValue,
  assignments: Map<string, RouteAssignment>,
): boolean {
  if (routeFilter === "all") return true;
  if (routeFilter === "none") return !assignments.has(student.id);
  return assignments.get(student.id)?.routeId === routeFilter;
}

// How long to wait after the last keystroke before the search filter
// applies, so filtering doesn't re-run on every character.
const SEARCH_DEBOUNCE_MS = 250;

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const { toasts, pushToast } = useToastQueue();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState<RouteFilterValue>("all");

  const [routeData, setRouteData] = useState<RouteAssignments>({ routes: [], byStudent: new Map() });
  const [routesStatus, setRoutesStatus] = useState<RoutesStatus>("loading");

  // The student whose status changed last. Whether the current filters now
  // hide them is worked out at render time from the latest students and
  // routes, so an answer that lands while the routes load can't go stale.
  const [lastStatusChange, setLastStatusChange] = useState<{ studentId: string } | null>(null);
  // Set by a status change, so the hidden row's focus moves once, not on
  // every later filter change.
  const focusAfterStatusChangeRef = useRef(false);
  const selectedStatusFilterRef = useRef<HTMLButtonElement>(null);

  // null until the parents load; stays null if they fail, so the rows keep
  // saying "Linked"/"Not assigned" instead of an email.
  const [parentsById, setParentsById] = useState<Map<string, Parent> | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const grades = useMemo(() => {
    const unique = Array.from(new Set(students.map((s) => s.grade)));
    return unique.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  const filteredStudents = useMemo(
    () =>
      students
        .filter((s) =>
          matchesFilters(s, { query: debouncedQuery, status: statusFilter, grade: gradeFilter }),
        )
        .filter((s) => matchesRouteFilter(s, routeFilter, routeData.byStudent)),
    [students, debouncedQuery, statusFilter, gradeFilter, routeFilter, routeData],
  );

  // Announces a student leaving the filtered list after a status change, so
  // a head of transport who just paused/archived someone isn't left
  // wondering where the row went.
  const changedStudent = lastStatusChange
    ? students.find((s) => s.id === lastStatusChange.studentId)
    : undefined;
  const changedStudentHidden =
    changedStudent !== undefined && !filteredStudents.some((s) => s.id === changedStudent.id);
  const filterAnnouncement =
    changedStudent && changedStudentHidden
      ? `${changedStudent.firstName} ${changedStudent.lastName} is now ${STUDENT_STATUS_LABELS[changedStudent.status]} and is hidden by the current filter.`
      : "";

  // The row (and the button that had focus) is gone: put focus on the
  // selected status filter, which is always there, instead of <body>.
  useEffect(() => {
    if (!focusAfterStatusChangeRef.current) return;
    focusAfterStatusChangeRef.current = false;
    if (changedStudentHidden) selectedStatusFilterRef.current?.focus();
  }, [lastStatusChange, changedStudentHidden]);

  const isFiltering =
    debouncedQuery.trim() !== "" ||
    statusFilter !== "all" ||
    gradeFilter !== "all" ||
    routeFilter !== "all";

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getStudents();
      setStudents(data);
      setLoadError(undefined);
    } catch {
      const message = "Couldn't load students. Please try again.";
      setLoadError(message);
      pushToast(message);
    } finally {
      setIsLoading(false);
    }
  }, [pushToast]);

  // Loaded in parallel with the roster: a failure here never blocks or
  // breaks the roster, it just leaves the route filter disabled and the rows
  // without a route line until a retry succeeds. The route filter stays "all"
  // until then, because the filter can't be changed while it's disabled.
  const loadRouteData = useCallback(async (status: "loading" | "retrying") => {
    setRoutesStatus(status);
    try {
      setRouteData(await getRouteAssignments());
      setRoutesStatus("ready");
    } catch {
      setRoutesStatus("error");
    }
  }, []);

  // After an address-request approval: approval writes the requested address
  // (and, if it carried a pin, the student's pin) on the student in the same
  // backend transaction, so the roster must refresh to show it. Runs without
  // the loading skeleton so the roster (and anything open on its rows) stays
  // visible, and a failure here never replaces the roster with the error
  // state, just a toast.
  const reloadStudentsInBackground = useCallback(async () => {
    try {
      const data = await getStudents();
      setStudents(data);
      setLoadError(undefined);
    } catch {
      pushToast("Couldn't refresh the roster after the approval. Please reload the page.");
    }
  }, [pushToast]);

  // Loaded in parallel with the roster, like the routes: a failure never
  // blocks the roster, the rows just fall back to "Linked"/"Not assigned".
  const loadParents = useCallback(async () => {
    try {
      const parents = await getParents();
      setParentsById(new Map(parents.map((parent) => [parent.id, parent])));
    } catch {
      setParentsById(null);
    }
  }, []);

  useEffect(() => {
    loadStudents();
    loadRouteData("loading");
    loadParents();
  }, [loadStudents, loadRouteData, loadParents]);

  async function handleAdd(data: NewStudentWithAddress) {
    const { student, addressSaved } = await addStudentWithAddress(data);
    setStudents((prev) => [...prev, student]);
    if (addressSaved) {
      pushToast(`${student.firstName} ${student.lastName} added with pickup address.`);
    } else {
      // POST succeeded, but PATCH did not: don't pretend the address was saved.
      pushToast(`${student.firstName} ${student.lastName} was created, but the address was not saved. Use Edit pickup details to retry.`);
    }
  }

  async function handleUpdateAddress(id: string, address: string) {
    const updated = await updateStudentAddress(id, address);
    setStudents((prev) => prev.map((student) => student.id === id ? updated : student));
    pushToast(`Pickup address updated for ${updated.firstName} ${updated.lastName}.`);
  }

  async function handleUpdateLocation(id: string, latitude: number, longitude: number) {
    const updated = await setStudentLocation(id, latitude, longitude);
    setStudents((prev) => prev.map((student) => student.id === id ? updated : student));
    pushToast(`Pickup location updated for ${updated.firstName} ${updated.lastName}.`);
  }

  // Pause/archive/resume/restore: the server already applied the change, so
  // this only reconciles local state, no reload. Pausing or archiving also
  // takes the student off their route (in the same backend transaction), so
  // their entry in routeData.byStudent is dropped right here, same as the
  // route line updates after a removeStudent elsewhere in the app. Both
  // updates are functional: this runs after the PUT, by when the routes may
  // have loaded or another row may have been placed.
  function handleStatusChanged(updated: Student) {
    setStudents((prev) => prev.map((student) => (student.id === updated.id ? updated : student)));
    if (updated.status !== "active") {
      setRouteData((prev) => {
        if (!prev.byStudent.has(updated.id)) return prev;
        const byStudent = new Map(prev.byStudent);
        byStudent.delete(updated.id);
        return { ...prev, byStudent };
      });
    }
    focusAfterStatusChangeRef.current = true;
    setLastStatusChange({ studentId: updated.id });
  }

  // A filter or the search moving on is the head of transport's own next
  // action: the announcement about the student the *previous* action hid is
  // no longer about what's on screen, so it goes. Changing status doesn't
  // call this, so the announcement survives the student's own row leaving.
  function clearStatusChangeAnnouncement() {
    focusAfterStatusChangeRef.current = false;
    setLastStatusChange(null);
  }

  function handleQueryChange(value: string) {
    setSearchInput(value);
    clearStatusChangeAnnouncement();
  }

  function handleStatusFilterChange(value: StatusFilterValue) {
    setStatusFilter(value);
    clearStatusChangeAnnouncement();
  }

  function handleGradeFilterChange(value: string) {
    setGradeFilter(value);
    clearStatusChangeAnnouncement();
  }

  function handleRouteFilterChange(value: RouteFilterValue) {
    setRouteFilter(value);
    clearStatusChangeAnnouncement();
  }

  // A best-route placement: update the row's route line in place and keep
  // the route filter's assignments consistent, without refetching anything.
  function handlePlaced(studentId: string, route: Route, placement: BestRoutePlacement) {
    setRouteData((prev) => {
      const byStudent = new Map(prev.byStudent);
      byStudent.set(studentId, { routeId: route.id, routeName: route.name });
      return { ...prev, byStudent };
    });
    pushToast(`Placed on ${route.name} as stop ${placement.position}, pickup ${placement.arrivalTime}.`);
  }

  async function handleImport(rows: ImportRow[]): Promise<StudentImport> {
    const outcome = await importStudents(rows);
    const added = outcome.result.results.flatMap((result) => result.status === "created" ? [result.student] : []);
    if (added.length > 0) {
      setStudents((prev) => [...prev, ...added]);
      pushToast(`${added.length} student${added.length === 1 ? "" : "s"} imported.`);
    }
    return outcome;
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto flex flex-col"
        style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "768px" }}
      >
        <header className="flex items-start justify-between flex-wrap" style={{ gap: spacing.md }}>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
              Students
            </h1>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              Maintain the student list and each guardian&apos;s contact details.
            </p>
          </div>
          <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
            <ImportStudentsForm onImport={handleImport} />
            <AddStudentForm onAdd={handleAdd} />
          </div>
        </header>

        <AddressRequestsSection
          api={addressRequestsApi}
          onApproved={() => {
            void reloadStudentsInBackground();
          }}
        />

        <section aria-labelledby="student-list-heading">
          <div className="flex items-center" style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center flex-shrink-0 rounded-full"
              style={{ width: "24px", height: "24px", backgroundColor: "rgba(18, 183, 106, 0.14)" }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2" fill={colors.success[500]} />
                <circle cx="7" cy="7" r="5" stroke={colors.success[500]} strokeOpacity="0.5" fill="none" />
              </svg>
            </span>
            <h2
              id="student-list-heading"
              className="text-lg font-semibold"
              style={{ color: darkTheme.text.primary }}
            >
              Roster
            </h2>
          </div>
          <div
            aria-hidden="true"
            style={{
              height: "1px",
              background: `linear-gradient(90deg, ${darkTheme.surface.cardBorder}, transparent)`,
              marginBottom: spacing.md,
            }}
          />

          {isLoading && (
            <>
              <span className="sr-only" role="status">
                Loading students…
              </span>
              <StudentListSkeleton />
            </>
          )}

          {loadError && (
            <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
              <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                {loadError}
              </p>
              <Button variant="secondary" onClick={loadStudents}>
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !loadError && students.length > 0 && (
            <StudentFilters
              query={searchInput}
              onQueryChange={handleQueryChange}
              status={statusFilter}
              onStatusChange={handleStatusFilterChange}
              grade={gradeFilter}
              onGradeChange={handleGradeFilterChange}
              grades={grades}
              route={routeFilter}
              onRouteChange={handleRouteFilterChange}
              routes={routeData.routes}
              routesStatus={routesStatus}
              onRetryRoutes={() => loadRouteData("retrying")}
              selectedStatusRef={selectedStatusFilterRef}
            />
          )}

          <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {filterAnnouncement}
          </p>

          {!isLoading && !loadError && students.length === 0 && (
            <div
              className="flex flex-col items-center text-center"
              style={{
                padding: spacing.xl,
                border: `1px dashed ${darkTheme.surface.cardBorder}`,
                borderRadius: radius.lg,
                backgroundColor: "rgba(20, 22, 29, 0.5)",
              }}
            >
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center"
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: radius.full,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: darkTheme.text.muted,
                  marginBottom: spacing.md,
                }}
              >
                <StudentIcon size={24} />
              </span>
              <p
                className="text-sm font-medium"
                style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
              >
                No students yet
              </p>
              <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: "320px" }}>
                Students will show up here once they&apos;ve been added.
              </p>
            </div>
          )}

          {!isLoading && !loadError && students.length > 0 && filteredStudents.length === 0 && (
            <div
              role="status"
              className="flex flex-col items-center text-center"
              style={{
                padding: spacing.xl,
                border: `1px dashed ${darkTheme.surface.cardBorder}`,
                borderRadius: radius.lg,
                backgroundColor: "rgba(20, 22, 29, 0.5)",
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
              >
                No students match your search.
              </p>
              {isFiltering && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchInput("");
                    setStatusFilter("all");
                    setGradeFilter("all");
                    setRouteFilter("all");
                    clearStatusChangeAnnouncement();
                  }}
                  style={{ marginTop: spacing.sm }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {!isLoading && !loadError && filteredStudents.length > 0 && (
            <ul
              role="list"
              className="flex flex-col"
              style={{ gap: spacing.sm, padding: 0, margin: 0 }}
            >
              <AnimatePresence initial={false}>
                {filteredStudents.map((student) => (
                  <StudentListItem
                    key={student.id}
                    student={student}
                    routeAssignment={routesStatus === "ready" ? routeData.byStudent.get(student.id) ?? null : undefined}
                    parent={parentsById && student.parentUserId ? parentsById.get(student.parentUserId) : undefined}
                    onLinked={(updated) => {
                      setStudents(prev => prev.map(item => item.id === updated.id ? updated : item));
                      pushToast(`Parent updated for ${updated.firstName} ${updated.lastName}.`);
                    }}
                    onUpdateAddress={handleUpdateAddress}
                    onUpdateLocation={handleUpdateLocation}
                    onStatusChanged={handleStatusChanged}
                    onPlaced={handlePlaced}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </main>

      <ToastViewport toasts={toasts} />
    </MotionConfig>
  );
}
