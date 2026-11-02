// SCRUM-250: independent examples from the Jira criteria and runs contract.
// No production rule helpers or mutable sample-client state are used as oracles.
import type { DriverDay, Run, RunStop } from "@/lib/api/runs";

export const instant = "2026-10-30T05:00:00Z";

export function student(position = 1, changes: Partial<RunStop> = {}): RunStop {
  return {
    studentId: `40000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
    position, firstName: `Student${position}`, lastName: "Independent",
    address: `${position} Test Street`, latitude: 33.89 + position / 1000,
    longitude: 35.48, arrivalTime: "07:20", guardianName: "Test Guardian",
    guardianPhone: "+961 70 123 456", absent: false, confirmation: null,
    ...changes,
  };
}

export function run(changes: Partial<Run> = {}): Run {
  const stops = changes.stops ?? [student()];
  return {
    id: "50000000-0000-4000-8000-000000000001", date: "2026-10-30",
    direction: "MORNING", state: "IN_PROGRESS", schoolTime: "08:00",
    startedAt: changes.state === "NOT_STARTED" ? null : instant,
    endedAt: changes.state === "FINISHED" ? instant : null,
    route: { id: "10000000-0000-4000-8000-000000000001", name: "Independent school route" },
    vehicle: { id: "20000000-0000-4000-8000-000000000001", plateNumber: "TEST 250", capacity: 14 },
    driver: { id: "30000000-0000-4000-8000-000000000001", firstName: "Test", lastName: "Driver" },
    counts: {
      students: stops.length,
      absent: stops.filter(stop => stop.absent && !stop.confirmation).length,
      pickedUp: stops.filter(stop => ["PICKED_UP", "DROPPED_OFF"].includes(stop.confirmation?.status ?? "")).length,
      droppedOff: stops.filter(stop => stop.confirmation?.status === "DROPPED_OFF").length,
      notPresent: stops.filter(stop => stop.confirmation?.status === "NOT_PRESENT").length,
    },
    stops, ...changes,
  };
}

export function day(runs: Run[] = [run()], changes: Partial<DriverDay> = {}): DriverDay {
  return { date: "2026-10-30", dayType: "SCHOOL_DAY", runs, ...changes };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
