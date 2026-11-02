// TEMPORARY (SCRUM-255): stands in for getRunsDay and getAbsentStudents in runs.ts until the backend
// endpoints (SCRUM-233, SCRUM-239) are merged. It answers with the contract's sample JSON, copied from
// docs/contracts/samples/runs/, whatever date is asked, so the Today screen shows the sample's own date.
// The PR that switches the screen to the real calls deletes this file and __fixtures__/runs/.

import type { AbsentStudent, RunsDay } from "./runs";
import absencesSample from "./__fixtures__/runs/hot-absences.json";
import runsSample from "./__fixtures__/runs/hot-runs.json";

export function getRunsDay(): Promise<RunsDay> {
  return Promise.resolve(runsSample as RunsDay);
}

export function getAbsentStudents(): Promise<AbsentStudent[]> {
  return Promise.resolve(absencesSample as AbsentStudent[]);
}
