// Student API layer — SCRUM-193.
// The roster and add-student form now use the real Spring Boot API, not
// in-memory mock data. Other actions are exposed only when the backend
// provides a matching endpoint (see SCRUM-227 for address editing).

import { request } from "./client";
import { ApiError, ApiValidationError } from "./errors";

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  guardianName: string;
  guardianPhone: string;
  status: "active" | "inactive";
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

// Preserve the Sprint 1 CSV UI using the backend student-creation endpoint.
// Per-row failures are reported without producing mock records.
export type ImportErrorReason =
  | "missing_fields"
  | "duplicate_in_batch"
  | "duplicate_existing"
  | "invalid_fields"
  | "request_failed";

export type ImportRowResult =
  | { status: "success"; row: NewStudent; student: Student }
  | { status: "error"; row: NewStudent; reason: ImportErrorReason; message: string };

export interface StudentFilters {
  query?: string;
  status?: Student["status"] | "all";
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

// The backend has no bulk endpoint yet. Import each row with the existing
// POST endpoint, recording per-row successes and failures. Never create
// synthetic Student IDs or claim a failed row was saved.
export async function importStudents(rows: NewStudent[]): Promise<ImportRowResult[]> {
  const results: ImportRowResult[] = [];
  const seen = new Set<string>();
  let unavailable = false;

  for (const row of rows) {
    const fields = [row.firstName, row.lastName, row.grade, row.guardianName, row.guardianPhone];
    if (fields.some((value) => !value?.trim())) {
      results.push({
        status: "error", row, reason: "missing_fields",
        message: "First name, last name, grade, guardian name and guardian phone are required.",
      });
      continue;
    }

    const key = `${row.firstName.trim().toLowerCase()}\u0000${row.lastName.trim().toLowerCase()}\u0000${row.guardianPhone.trim()}`;
    if (seen.has(key)) {
      results.push({
        status: "error", row, reason: "duplicate_in_batch",
        message: "This student and guardian phone appear more than once in the CSV file.",
      });
      continue;
    }
    seen.add(key);

    if (unavailable) {
      results.push({
        status: "error", row, reason: "request_failed",
        message: "Not attempted because the API became unavailable. Retry this row later.",
      });
      continue;
    }

    try {
      const student = await addStudent(row);
      results.push({ status: "success", row, student });
    } catch (error) {
      if (error instanceof ApiValidationError) {
        const details = Object.values(error.errors).join(" ") || "The server rejected this student.";
        const duplicate = /already exists|duplicate/i.test(details);
        results.push({
          status: "error", row,
          reason: duplicate ? "duplicate_existing" : "invalid_fields",
          message: details,
        });
      } else if (error instanceof ApiError && error.status === 409) {
        results.push({ status: "error", row, reason: "duplicate_existing", message: error.message });
      } else if (error instanceof ApiError && error.status === 400) {
        results.push({ status: "error", row, reason: "invalid_fields", message: error.message });
      } else {
        unavailable = true;
        results.push({
          status: "error", row, reason: "request_failed",
          message: "The request could not be completed. Verify the backend connection and retry this row.",
        });
      }
    }
  }
  return results;
}
