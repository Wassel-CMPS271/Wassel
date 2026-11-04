// Absences, as the parent sees them — SCRUM-232, written from
// docs/contracts/runs.md (the source of truth for every type and path here).
// Types only: the calls are added with the absence screens (SCRUM-249), through
// request() in client.ts.
//
//   GET    /api/parent/children/{studentId}/absences                -> Absence[] (upcoming only)
//   POST   /api/parent/children/{studentId}/absences  { fromDate, toDate? } -> Absence (201)
//   DELETE /api/parent/children/{studentId}/absences/{absenceId}    -> 204
//
// An overlap answers 409 with errors.fromDate, which request() throws as
// ApiValidationError. A POST repeating the same dates returns the existing absence
// (200), so a retry is harmless.
// Cancel deletes an absence starting today or later, and cuts one that started
// earlier to end yesterday.

// Whole days, inclusive, "YYYY-MM-DD" in school-local time. A single day has both equal.
export interface Absence {
  id: string;
  studentId: string;
  fromDate: string;
  toDate: string;
}

// toDate defaults to fromDate. fromDate must be today or later.
export interface AbsenceInput {
  fromDate: string;
  toDate?: string;
}
