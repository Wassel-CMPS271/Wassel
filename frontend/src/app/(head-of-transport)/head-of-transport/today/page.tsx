"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
// SCRUM-255: sample data until the backend endpoints (SCRUM-233, SCRUM-239) are merged. To go live, import the
// same two names from "@/lib/api/runs" and delete runsSample.ts and __fixtures__/runs/.
import { getAbsentStudents, getRunsDay } from "@/lib/api/runsSample";
import type { AbsentStudent, RunState, RunSummary, RunsDay } from "@/lib/api/runs";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

const LOAD_ERROR = "Couldn't load today's runs. Please try again.";

const STATE_CONFIG: Record<RunState, { label: string; color: string }> = {
  NOT_STARTED: { label: "Not started", color: darkTheme.text.secondary },
  IN_PROGRESS: { label: "In progress", color: colors.success[500] },
  FINISHED: { label: "Finished", color: colors.primary[300] },
};

// "2026-10-22" -> "Thursday 22 October 2026". Read as a plain calendar date (UTC), so the viewer's time zone
// can't move it to the day before. The words are written out because the comma after the weekday that
// toLocaleDateString puts in depends on the browser's locale data.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]} ${year}`;
}

// docs/contracts/runs.md, "Counts": progress is picked up on a morning run and dropped off on an afternoon
// run, out of the students who are not absent (everyone is picked up at the gate in the afternoon).
function progressOf(run: RunSummary) {
  const total = run.counts.students - run.counts.absent;
  const done = run.direction === "MORNING" ? run.counts.pickedUp : run.counts.droppedOff;
  return { done, total, verb: run.direction === "MORNING" ? "picked up" : "dropped off" };
}

const headerCell: CSSProperties = {
  padding: `${spacing.sm} ${spacing.md} ${spacing.sm} 0`,
  color: darkTheme.text.secondary,
  textAlign: "left",
};

const bodyCell: CSSProperties = {
  padding: `${spacing.sm} ${spacing.md} ${spacing.sm} 0`,
  borderTop: `1px solid ${darkTheme.surface.cardBorder}`,
  color: darkTheme.text.primary,
  verticalAlign: "top",
};

function StateLabel({ state }: { state: RunState }) {
  const { label, color } = STATE_CONFIG[state];
  return (
    <span className="inline-flex items-center text-sm font-medium" style={{ gap: spacing.xs, color }}>
      <span
        aria-hidden="true"
        className="inline-block rounded-full"
        style={{ width: "8px", height: "8px", backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function Progress({ run }: { run: RunSummary }) {
  const { done, total, verb } = progressOf(run);
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="flex flex-col" style={{ gap: spacing.xs }}>
      <span className="text-sm">
        {done} of {total} {verb}
        {run.counts.absent > 0 && (
          <span style={{ color: darkTheme.text.secondary }}>, {run.counts.absent} absent</span>
        )}
        {run.counts.notPresent > 0 && (
          <span style={{ color: darkTheme.text.secondary }}>, {run.counts.notPresent} not present</span>
        )}
      </span>
      <span
        aria-hidden="true"
        className="block"
        style={{
          height: "4px",
          maxWidth: "160px",
          borderRadius: radius.full,
          backgroundColor: "rgba(255, 255, 255, 0.08)",
        }}
      >
        <span
          className="block"
          style={{
            height: "100%",
            width: `${percent}%`,
            borderRadius: radius.full,
            backgroundColor: colors.primary[400],
          }}
        />
      </span>
    </div>
  );
}

function RunsTable({ runs }: { runs: RunSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" style={{ borderCollapse: "collapse" }}>
        <caption className="sr-only">Runs for the day</caption>
        <thead>
          <tr>
            <th scope="col" style={headerCell} className="font-medium">Route</th>
            <th scope="col" style={headerCell} className="font-medium">Driver</th>
            <th scope="col" style={headerCell} className="font-medium">Run</th>
            <th scope="col" style={headerCell} className="font-medium">State</th>
            <th scope="col" style={headerCell} className="font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <th scope="row" style={bodyCell} className="font-medium text-left">{run.route.name}</th>
              <td style={bodyCell}>
                {run.driver.firstName} {run.driver.lastName}
              </td>
              <td style={bodyCell}>{run.direction === "MORNING" ? "Morning" : "Afternoon"}</td>
              <td style={bodyCell}>
                <StateLabel state={run.state} />
              </td>
              <td style={bodyCell}>
                <Progress run={run} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbsentTable({ students }: { students: AbsentStudent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" style={{ borderCollapse: "collapse" }}>
        <caption className="sr-only">Students absent for the day</caption>
        <thead>
          <tr>
            <th scope="col" style={headerCell} className="font-medium">Student</th>
            <th scope="col" style={headerCell} className="font-medium">Route</th>
            <th scope="col" style={headerCell} className="font-medium">Stop</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.absenceId}>
              <th scope="row" style={bodyCell} className="font-medium text-left">
                {student.firstName} {student.lastName}
              </th>
              <td style={bodyCell}>{student.route ? student.route.name : "No route"}</td>
              <td style={bodyCell}>{student.position === null ? "None" : `Stop ${student.position}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function emptyRunsMessage(day: RunsDay): string {
  return day.dayType === "HOLIDAY"
    ? "No runs today. The school is closed (a holiday or the weekend)."
    : "No runs have been created for today yet.";
}

export default function TodayPage() {
  const [day, setDay] = useState<RunsDay | null>(null);
  const [absent, setAbsent] = useState<AbsentStudent[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(undefined);
    try {
      const [runsDay, absentStudents] = await Promise.all([getRunsDay(), getAbsentStudents()]);
      setDay(runsDay);
      setAbsent(absentStudents);
    } catch {
      setLoadError(LOAD_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main
      className="mx-auto flex flex-col"
      style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "1024px" }}
    >
      <header className="flex items-start justify-between flex-wrap" style={{ gap: spacing.md }}>
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            Today
          </h1>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {day
              ? `${formatDate(day.date)}${day.dayType === "HALF_DAY" ? " · Half day" : ""}`
              : "How the school day is going."}
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={isLoading} style={{ minHeight: sizing.tapTarget }}>
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </header>

      {isLoading && !day && (
        <p role="status" style={{ color: darkTheme.text.secondary }}>
          {"Loading today's runs…"}
        </p>
      )}

      {loadError && (
        <p role="alert" style={{ color: colors.error[500] }}>
          {loadError}
        </p>
      )}

      {day && (
        <Card>
          <section aria-labelledby="today-runs-heading" className="flex flex-col" style={{ gap: spacing.md }}>
            <h2 id="today-runs-heading" className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>
              Runs
            </h2>
            {day.runs.length === 0 ? (
              <p style={{ color: darkTheme.text.secondary }}>{emptyRunsMessage(day)}</p>
            ) : (
              <RunsTable runs={day.runs} />
            )}
          </section>
        </Card>
      )}

      {absent && (
        <Card>
          <section aria-labelledby="today-absent-heading" className="flex flex-col" style={{ gap: spacing.md }}>
            <h2 id="today-absent-heading" className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>
              Absent students
            </h2>
            {absent.length === 0 ? (
              <p style={{ color: darkTheme.text.secondary }}>No students are absent today.</p>
            ) : (
              <AbsentTable students={absent} />
            )}
          </section>
        </Card>
      )}
    </main>
  );
}
