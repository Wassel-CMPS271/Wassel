// Student API layer — SCRUM-193.
// The roster and add-student form now use the real Spring Boot API, not
// in-memory mock data. Other actions are exposed only when the backend
// provides a matching endpoint (see SCRUM-227 for address editing).

import { request } from "./client";
import { ApiError, ApiValidationError } from "./errors";

// docs/contracts/roster.md: "inactive" means archived (it kept its name), and
// only an active student can be on a route.
export type StudentStatus = "active" | "paused" | "inactive";

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: "Active",
  paused: "Paused",
  inactive: "Archived",
};

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  guardianName: string;
  guardianPhone: string;
  status: StudentStatus;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  route: string | null;
  parentUserId: string | null;
  createdAt: string;
}

export type NewStudent = Pick<
  Student,
  "firstName" | "lastName" | "grade" | "guardianName" | "guardianPhone"
>;

// Address is mandatory in the interactive Add Student form (SCRUM-227).
// CSV imports still use NewStudent because the existing CSV format has no address.
export type NewStudentWithAddress = NewStudent & { address: string };

// The students import's shapes (SCRUM-59, docs/contracts/students-import.md).
// `row` is the line of the file the record starts on.
export type ImportRow = NewStudent & { row: number };

// `errors` is keyed by field, as single create's 400/409 body is.
export type RowResult =
  | { row: number; status: "created"; student: Student }
  | { row: number; status: "rejected"; errors: Record<string, string> };

export interface ImportResult {
  created: number;
  rejected: number;
  results: RowResult[];
}

// A row with no answer, because the import stopped before or at it.
export interface NotSentRow {
  row: number;
  message: string;
}

export interface StudentImport {
  result: ImportResult;
  notSent: NotSentRow[];
}

export interface StudentFilters {
  query?: string;
  status?: StudentStatus | "all";
  grade?: string | "all";
  route?: string | "all";
}

const STUDENTS_PATH = "/api/head-of-transport/students";

export function linkStudentParent(id: string, parentUserId: string): Promise<Student> {
  return request<Student>(`${STUDENTS_PATH}/${encodeURIComponent(id)}/parent`, {
    method: "PATCH", body: { parentUserId },
  });
}

// Optional server-side filters use the exact StudentController parameter names.
// The backend reads `status` in any letter case (paused included); an unknown
// one is no filter at all, so only the three statuses are ever sent.
// The current roster also filters locally after an initial GET for instant UI
// response; its data still comes exclusively from the real backend.
export function getStudents(filters?: StudentFilters): Promise<Student[]> {
  const params = new URLSearchParams();
  if (filters?.query?.trim()) params.set("query", filters.query.trim());
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.grade && filters.grade !== "all") params.set("grade", filters.grade);
  if (filters?.route && filters.route !== "all") params.set("route", filters.route);
  const query = params.toString();
  return request<Student[]>(query ? `${STUDENTS_PATH}?${query}` : STUDENTS_PATH);
}

export function matchesFilters(student: Student, filters?: StudentFilters): boolean {
  if (!filters) return true;
  const { query, status, grade, route } = filters;
  if (status && status !== "all" && student.status !== status) return false;
  if (grade && grade !== "all" && student.grade !== grade) return false;
  if (route && route !== "all" && student.route !== route) return false;
  const normalizedQuery = query?.trim().toLowerCase();
  if (normalizedQuery) {
    const values = [student.firstName, student.lastName, student.guardianName];
    if (!values.some((value) => value.toLowerCase().includes(normalizedQuery))) return false;
  }
  return true;
}

export function searchStudents(query: string): Promise<Student[]> {
  return getStudents({ query });
}

export function addStudent(data: NewStudent | NewStudentWithAddress): Promise<Student> {
  return request<Student>(STUDENTS_PATH, {
    method: "POST",
    body: {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      grade: data.grade.trim(),
      guardianName: data.guardianName.trim(),
      guardianPhone: data.guardianPhone.trim(),
      // SCRUM-213 will make the create endpoint save this atomically.
      // Until then the post-create PATCH fallback below ensures persistence.
      ...("address" in data ? { address: data.address.trim() } : {}),
    },
  });
}

// The existing backend supports PATCH /{id}/address even before SCRUM-213 lands.
export function updateStudentAddress(id: string, address: string): Promise<Student> {
  return request<Student>(`${STUDENTS_PATH}/${encodeURIComponent(id)}/address`, {
    method: "PATCH",
    body: { address: address.trim() },
  });
}

// Corrects the student's pickup pin on the map (SCRUM-222).
export function setStudentLocation(id: string, latitude: number, longitude: number): Promise<Student> {
  return request<Student>(`${STUDENTS_PATH}/${encodeURIComponent(id)}/location`, {
    method: "PATCH",
    body: { latitude, longitude },
  });
}

// POST includes address for SCRUM-213. If the old backend ignores that field,
// PATCH persists it. A partially created student is returned as such, so the
// UI never says the address was saved when it wasn't.
export async function addStudentWithAddress(
  data: NewStudentWithAddress,
): Promise<{ student: Student; addressSaved: boolean }> {
  const created = await addStudent(data);
  if (created.address?.trim() === data.address.trim()) {
    return { student: created, addressSaved: true };
  }
  try {
    const updated = await updateStudentAddress(created.id, data.address);
    return {
      student: updated,
      addressSaved: updated.address?.trim() === data.address.trim(),
    };
  } catch {
    return { student: created, addressSaved: false };
  }
}

// The bulk endpoint of docs/contracts/students-import.md does not exist yet
// (SCRUM-300), so each row is still one POST to single create, one after
// another; `row` is never sent. The answer is shaped like the contract's
// ImportResult, so switching to the bulk call changes this function only.
//
// A repeat of an earlier row (same names in any letter case, same phone) is
// rejected without being sent, naming the first row's line, as the contract's
// in-request duplicate rule does. A failure with no answer for the row (no
// connection, 401, 403, 5xx) stops the import: that row and every later one go
// into `notSent`, and the rows already answered stay in `result`.
export async function importStudents(rows: ImportRow[]): Promise<StudentImport> {
  const results: RowResult[] = [];
  const notSent: NotSentRow[] = [];
  const firstRowOf = new Map<string, number>();
  let stoppedAt: number | undefined;

  for (const importRow of rows) {
    const { row } = importRow;
    if (stoppedAt !== undefined) {
      notSent.push({ row, message: `The import stopped at row ${stoppedAt}.` });
      continue;
    }

    const key = `${importRow.firstName.trim().toLowerCase()}\u0000${importRow.lastName.trim().toLowerCase()}\u0000${importRow.guardianPhone.trim()}`;
    const firstRow = firstRowOf.get(key);
    if (firstRow !== undefined) {
      results.push({ row, status: "rejected", errors: { guardianPhone: `Same student and guardian phone as row ${firstRow}.` } });
      continue;
    }
    firstRowOf.set(key, row);

    try {
      results.push({ row, status: "created", student: await addStudent(importRow) });
    } catch (error) {
      if (error instanceof ApiValidationError) {
        results.push({ row, status: "rejected", errors: { ...error.errors } });
      } else if (error instanceof ApiError && error.status === 409) {
        // Single create's only 409 is a duplicate, which it reports under guardianPhone.
        results.push({ row, status: "rejected", errors: { guardianPhone: "A student with this name and guardian phone already exists." } });
      } else if (error instanceof ApiError && error.status === 400) {
        // No field to put it under, and every later row would get the same answer.
        stoppedAt = row;
        notSent.push({ row, message: "The server refused this row without saying why. It was not saved." });
      } else {
        stoppedAt = row;
        notSent.push({ row, message: "The import stopped here. This row may or may not have been saved." });
      }
    }
  }

  const created = results.filter((result) => result.status === "created").length;
  return { result: { created, rejected: results.length - created, results }, notSent };
}
