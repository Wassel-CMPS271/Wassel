import type { ChildRun } from "@/lib/api/myChildren";
import { darkTheme, radius, spacing } from "@/styles/tokens";

export function ChildRunStatus({ run }: { run: ChildRun | null }) {
  if (run === null) return null;
  const label = { NOT_STARTED: "Run not started", IN_PROGRESS: "Bus on the way", FINISHED: "Run finished" }[run.state];
  return (
    <div role="status" aria-live="polite" className="flex min-w-0 flex-col" style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: darkTheme.surface.recede }}>
      <p className="text-sm" style={{ color: darkTheme.text.secondary }}>{run.direction === "MORNING" ? "Morning run" : "Afternoon run"}</p>
      <p className="text-base font-medium" style={{ color: darkTheme.text.primary }}>{label}</p>
      {run.state === "IN_PROGRESS" && run.stopsLeft !== null && (
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>{run.stopsLeft === 0 ? "Your child is next" : `${run.stopsLeft} ${run.stopsLeft === 1 ? "stop" : "stops"} before your child`}</p>
      )}
    </div>
  );
}
