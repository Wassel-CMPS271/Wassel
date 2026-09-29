"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Student } from "@/lib/api/students";
import { colors, darkTheme, radius, spacing, typography } from "@/styles/tokens";

export type StatusFilterValue = Student["status"] | "all";

interface StudentFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  status: StatusFilterValue;
  onStatusChange: (value: StatusFilterValue) => void;
  grade: string;
  onGradeChange: (value: string) => void;
  grades: string[];
}

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// Search + status/grade filters for the roster (SCRUM-162). Search and the
// status segmented control reuse Input/Button; the grade dropdown is a
// native <select> since there's no Select in components/ui/* yet, styled
// inline to match Input's field styling.
export function StudentFilters({
  query,
  onQueryChange,
  status,
  onStatusChange,
  grade,
  onGradeChange,
  grades,
}: StudentFiltersProps) {
  const gradeSelectId = useId();

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
