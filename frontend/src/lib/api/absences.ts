// SCRUM-232: server owns parent identity, overlap checks and cancellation history.
import { request } from "./client";

// Whole days, inclusive, YYYY-MM-DD in school-local time. Preserve the
// SCRUM-232 types; only add the authenticated calls and boundary validation.
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

export function isSchoolDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function schoolToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const path = (studentId: string) => `/api/parent/children/${encodeURIComponent(studentId)}/absences`;
function parse(value: unknown, studentId: string): Absence {
  const a = value as Partial<Absence> | null;
  if (!a || typeof a.id !== "string" || a.studentId !== studentId
    || typeof a.fromDate !== "string" || typeof a.toDate !== "string"
    || !isSchoolDate(a.fromDate) || !isSchoolDate(a.toDate) || a.toDate < a.fromDate) throw new Error("Invalid absence response");
  return a as Absence;
}
export async function getAbsences(studentId: string): Promise<Absence[]> {
  const value = await request<unknown>(path(studentId));
  if (!Array.isArray(value)) throw new Error("Invalid absence list");
  return value.map(item => parse(item, studentId)).sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}
export async function reportAbsence(studentId: string, dates: AbsenceInput): Promise<Absence> {
  return parse(await request<unknown>(path(studentId), { method: "POST", body: dates }), studentId);
}
export async function cancelAbsence(studentId: string, absenceId: string): Promise<void> {
  await request(`${path(studentId)}/${encodeURIComponent(absenceId)}`, { method: "DELETE" });
}
