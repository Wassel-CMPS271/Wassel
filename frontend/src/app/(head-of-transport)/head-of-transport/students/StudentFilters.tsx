"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { RouteAssignments } from "@/lib/api/routes";
import type { Student } from "@/lib/api/students";
import { colors, darkTheme, radius, spacing, typography } from "@/styles/tokens";

export type StatusFilterValue = Student["status"] | "all";
// "all" (no filter), "none" (students on no route), or a route's id.
export type RouteFilterValue = string;
// "retrying" is a load started from the Retry button, after an "error".
export type RoutesStatus = "loading" | "ready" | "error" | "retrying";

interface StudentFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  status: StatusFilterValue;
  onStatusChange: (value: StatusFilterValue) => void;
  grade: string;
  onGradeChange: (value: string) => void;
  grades: string[];
  route: RouteFilterValue;
  onRouteChange: (value: RouteFilterValue) => void;
  routes: RouteAssignments["routes"];
  routesStatus: RoutesStatus;
  onRetryRoutes: () => void;
}

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// Search + status/grade/route filters for the roster (SCRUM-162, route SCRUM-66). Search and the
// status segmented control reuse Input/Button; the grade dropdown is a
// native <select> since there's no Select in components/ui/* yet, styled
// inline to match Input's field styling. The route dropdown stays in place
// while the routes load or fail (disabled, with the reason under it), so its
// label always points at it.
export function StudentFilters({
  query,
  onQueryChange,
  status,
  onStatusChange,
  grade,
  onGradeChange,
  grades,
  route,
  onRouteChange,
  routes,
  routesStatus,
  onRetryRoutes,
}: StudentFiltersProps) {
  const gradeSelectId = useId();
  const routeSelectId = useId();
  const routeHintId = useId();
  const routeSelectRef = useRef<HTMLSelectElement>(null);
  const previousRoutesStatus = useRef(routesStatus);

  // The Retry button is swapped out when the routes load, so focus moves on
  // to the select it brought back.
  useEffect(() => {
    if (previousRoutesStatus.current === "retrying" && routesStatus === "ready") {
      routeSelectRef.current?.focus();
    }
    previousRoutesStatus.current = routesStatus;
  }, [routesStatus]);

  // Loading and retrying are a status line, so a failed retry swaps in the
  // alert again and is announced again.
  let routeHint: ReactNode = null;
  if (routesStatus === "loading" || routesStatus === "retrying") {
    routeHint = (
      <span role="status" className="text-sm" style={{ color: darkTheme.text.muted }}>
        Loading routes…
      </span>
    );
  } else if (routesStatus === "error") {
    routeHint = (
      <span role="alert" className="text-sm" style={{ color: colors.error[500] }}>
        Couldn&apos;t load routes.
      </span>
    );
  } else if (routes.length === 0) {
    routeHint = (
      <span className="text-sm" style={{ color: darkTheme.text.muted }}>
        No routes yet.
      </span>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: spacing.md, marginBottom: spacing.lg }}>
      <div className="flex flex-wrap items-end" style={{ gap: spacing.md }}>
        <div style={{ flex: "1 1 240px", minWidth: "200px" }}>
          <Input
            label="Search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by name or guardian…"
          />
        </div>

        <div className="flex flex-col" style={{ gap: spacing.xs }}>
          <label
            htmlFor={gradeSelectId}
            className="text-sm font-medium"
            style={{ color: darkTheme.text.secondary }}
          >
            Grade
          </label>
          <select
            id={gradeSelectId}
            value={grade}
            onChange={(event) => onGradeChange(event.target.value)}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderRadius: radius.md,
              padding: `${spacing.sm} ${spacing.md}`,
              border: `1px solid ${darkTheme.surface.inputBorder}`,
              backgroundColor: darkTheme.surface.input,
              color: darkTheme.text.primary,
              fontFamily: typography.fontFamily.serif,
              outlineColor: colors.primary[500],
            }}
          >
            <option value="all">All grades</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-0 max-w-full" style={{ gap: spacing.xs }}>
          <label
            htmlFor={routeSelectId}
            className="text-sm font-medium"
            style={{ color: darkTheme.text.secondary }}
          >
            Route
          </label>
          <select
            ref={routeSelectRef}
            id={routeSelectId}
            value={route}
            onChange={(event) => onRouteChange(event.target.value)}
            disabled={routesStatus !== "ready"}
            aria-describedby={routeHint ? routeHintId : undefined}
            className="max-w-full disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderRadius: radius.md,
              padding: `${spacing.sm} ${spacing.md}`,
              border: `1px solid ${darkTheme.surface.inputBorder}`,
              backgroundColor: darkTheme.surface.input,
              color: darkTheme.text.primary,
              fontFamily: typography.fontFamily.serif,
              outlineColor: colors.primary[500],
            }}
          >
            <option value="all">All routes</option>
            <option value="none">No route</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {routeHint && (
            <div id={routeHintId} className="flex flex-wrap items-center" style={{ gap: spacing.sm }}>
              {routeHint}
              {(routesStatus === "error" || routesStatus === "retrying") && (
                // aria-disabled, not disabled, while retrying: a disabled
                // button drops keyboard focus, and focus has to stay here
                // until the select comes back.
                <Button
                  type="button"
                  variant="ghost"
                  aria-disabled={routesStatus === "retrying"}
                  onClick={() => {
                    if (routesStatus === "error") onRetryRoutes();
                  }}
                >
                  {routesStatus === "retrying" ? "Retrying…" : "Retry routes"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        role="group"
        aria-label="Filter by status"
        className="flex flex-wrap"
        style={{ gap: spacing.xs }}
      >
        {STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={status === option.value ? "primary" : "ghost"}
            aria-pressed={status === option.value}
            onClick={() => onStatusChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
