// SCRUM-281: the parent's read-only attendance history (docs/contracts/attendance.md).
// Cookie, parent identity and school are handled by request()/the backend.

import { request } from "./client";
import { isSchoolDate } from "./absences";
import { isMoment, isRecord } from "./shape";

export interface ParentAttendance {
  date: string;
  direction: "MORNING" | "AFTERNOON";
  status: "NOT_PRESENT" | "PICKED_UP" | "DROPPED_OFF";
  notPresentAt: string | null;
  pickedUpAt: string | null;
  droppedOffAt: string | null;
}

export interface AttendanceRange { from: string; to: string }


function parseAttendance(value: unknown): ParentAttendance {
  if (!isRecord(value) || !isSchoolDate(String(value.date)) ||
    !["MORNING", "AFTERNOON"].includes(String(value.direction)) ||
    !["NOT_PRESENT", "PICKED_UP", "DROPPED_OFF"].includes(String(value.status)) ||
    !["notPresentAt", "pickedUpAt", "droppedOffAt"].every(k => value[k] === null || isMoment(value[k]))) {
    throw new Error("Invalid attendance response");
  }
  return value as unknown as ParentAttendance;
}

// Exactly 62 inclusive days maximum. UTC calendar arithmetic avoids daylight-saving shifts.
export function attendanceRangeErrors(range: AttendanceRange): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isSchoolDate(range.from)) errors.from = "Choose a valid start date.";
  if (!isSchoolDate(range.to)) errors.to = "Choose a valid end date.";
  if (Object.keys(errors).length) return errors;
  const from = Date.parse(range.from + "T12:00:00Z");
  const to = Date.parse(range.to + "T12:00:00Z");
  const days = Math.round((to - from) / 86_400_000) + 1;
  if (days < 1) errors.to = "End date must be on or after start date.";
  else if (days > 62) errors.to = "Choose at most 62 days, including both endpoints.";
  return errors;
}

export async function getParentAttendance(
  studentId: string, range: AttendanceRange,
): Promise<ParentAttendance[]> {
  if (Object.keys(attendanceRangeErrors(range)).length) throw new Error("Invalid attendance date range");
  const params = new URLSearchParams({ from: range.from, to: range.to });
  const value = await request<unknown>(
    "/api/parent/children/" + encodeURIComponent(studentId) + "/attendance?" + params.toString());
  if (!Array.isArray(value)) throw new Error("Invalid attendance list");
  return value.map(parseAttendance);
}
