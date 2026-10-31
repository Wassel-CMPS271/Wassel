// TEMPORARY — SCRUM-243 built against sample data because SCRUM-233 (backend)
// isn't merged yet. Delete this file and switch the screen's import to
// getDriverToday() in runs.ts once it is. See docs/contracts/runs.md and
// frontend/CLAUDE.md.

import driverTodayJson from "../../../../docs/contracts/samples/runs/driver-today.json";
import type { ConfirmationStatus, DayType, DriverDay, RunDirection, RunState } from "./runs";

// The JSON import widens dayType, direction, state and confirmation.status to
// plain `string`, so only those fields need narrowing to their literal-union
// types. Everything else stays as the JSON infers it, so a real mismatch
// (missing field, wrong nesting, a typo) still fails the `satisfies` check.
type JsonDay = typeof driverTodayJson;
type JsonRun = JsonDay["runs"][number];
type JsonStop = JsonRun["stops"][number];
type JsonConfirmation = NonNullable<JsonStop["confirmation"]>;

type NarrowedStop = Omit<JsonStop, "confirmation"> & {
  confirmation: (Omit<JsonConfirmation, "status"> & { status: ConfirmationStatus }) | null;
};

type NarrowedRun = Omit<JsonRun, "direction" | "state" | "stops"> & {
  direction: RunDirection;
  state: RunState;
  stops: NarrowedStop[];
};

type NarrowedDay = Omit<JsonDay, "dayType" | "runs"> & {
  dayType: DayType;
  runs: NarrowedRun[];
};

const driverToday = (driverTodayJson as NarrowedDay) satisfies DriverDay;

export function getDriverTodaySample(): Promise<DriverDay> {
  return new Promise((resolve) => setTimeout(() => resolve(driverToday), 300));
}
