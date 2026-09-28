// Student API layer — SCRUM-160.
//
// The backend student endpoints (SCRUM-165) don't exist yet, so these
// functions run against an in-memory mock, the same approach as
// vehicles.ts and drivers.ts. Each one is already async and returns the
// same shape a real request would, so when SCRUM-165 lands, replace the
// function bodies with fetch() calls and keep the signatures.

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  guardianName: string;
  guardianPhone: string;
  status: "active" | "inactive";
  createdAt: string;
}

// Fields the caller supplies when adding a student; the rest are assigned
// by the API (mock today, server later).
export type NewStudent = Pick<
  Student,
  "firstName" | "lastName" | "grade" | "guardianName" | "guardianPhone"
>;

// Why a student row failed to import, for callers to render a specific
// message instead of a generic "failed" state.
export type ImportErrorReason =
  | "missing_fields"
  | "duplicate_in_batch"
  | "duplicate_existing";

export type ImportRowResult =
  | { status: "success"; row: NewStudent; student: Student }
  | { status: "error"; row: NewStudent; reason: ImportErrorReason; message: string };

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms: number = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let students: Student[] = [
  {
    id: "s-1",
    firstName: "Layla",
    lastName: "Chamoun",
    grade: "Grade 2",
    guardianName: "Rania Chamoun",
    guardianPhone: "+961 3 111 222",
    status: "active",
    createdAt: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "s-2",
    firstName: "Karim",
    lastName: "Nassar",
    grade: "Grade 4",
    guardianName: "Wael Nassar",
    guardianPhone: "+961 70 222 333",
    status: "active",
    createdAt: "2026-01-18T08:00:00.000Z",
  },
  {
    id: "s-3",
    firstName: "Maya",
    lastName: "Abdallah",
    grade: "Grade 4",
    guardianName: "Hiba Abdallah",
    guardianPhone: "+961 71 333 444",
    status: "active",
    createdAt: "2026-02-01T08:00:00.000Z",
  },
  {
    id: "s-4",
    firstName: "Elias",
    lastName: "Ghosn",
    grade: "Grade 6",
    guardianName: "Tony Ghosn",
    guardianPhone: "+961 3 444 555",
    status: "active",
    createdAt: "2026-02-10T08:00:00.000Z",
  },
  {
    id: "s-5",
    firstName: "Sarah",
    lastName: "Younes",
    grade: "Grade 1",
    guardianName: "Nadine Younes",
    guardianPhone: "+961 76 555 666",
    status: "inactive",
    createdAt: "2026-02-14T08:00:00.000Z",
  },
  {
    id: "s-6",
    firstName: "Omar",
    lastName: "Sabbagh",
    grade: "Grade 6",
    guardianName: "Ziad Sabbagh",
    guardianPhone: "+961 3 666 777",
    status: "active",
    createdAt: "2026-03-02T08:00:00.000Z",
  },
  {
    id: "s-7",
    firstName: "Tala",
    lastName: "Rahal",
    grade: "Grade 2",
    guardianName: "Dana Rahal",
    guardianPhone: "+961 70 777 888",
    status: "inactive",
    createdAt: "2026-03-09T08:00:00.000Z",
  },
  {
    id: "s-8",
    firstName: "Joe",
    lastName: "Matta",
    grade: "Grade 1",
    guardianName: "Pierre Matta",
    guardianPhone: "+961 71 888 999",
    status: "active",
    createdAt: "2026-03-20T08:00:00.000Z",
  },
];

function missingFieldsReason(data: NewStudent): string | null {
  if (
    !data.firstName?.trim() ||
    !data.lastName?.trim() ||
    !data.grade?.trim() ||
    !data.guardianName?.trim() ||
    !data.guardianPhone?.trim()
  ) {
    return "First name, last name, grade, guardian name, and guardian phone are all required.";
  }
  return null;
}

function isDuplicateOf(data: NewStudent, existing: NewStudent): boolean {
  return (
    data.firstName.trim().toLowerCase() === existing.firstName.trim().toLowerCase() &&
    data.lastName.trim().toLowerCase() === existing.lastName.trim().toLowerCase() &&
    data.guardianPhone.trim() === existing.guardianPhone.trim()
  );
}

export async function getStudents(): Promise<Student[]> {
  return delay([...students]);
}

export async function addStudent(data: NewStudent): Promise<Student> {
  const missing = missingFieldsReason(data);
  if (missing) {
    throw new Error(missing);
  }

  if (students.some((s) => isDuplicateOf(data, s))) {
    throw new Error(
      `A student named ${data.firstName} ${data.lastName} with guardian phone ${data.guardianPhone} already exists.`,
    );
  }

  const student: Student = {
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    grade: data.grade.trim(),
    guardianName: data.guardianName.trim(),
    guardianPhone: data.guardianPhone.trim(),
    status: "active",
    createdAt: new Date().toISOString(),
    id: `s-${Date.now()}`,
  };
  students = [...students, student];
  return delay(student);
}

export async function importStudents(rows: NewStudent[]): Promise<ImportRowResult[]> {
  const results: ImportRowResult[] = [];
  const accepted: NewStudent[] = [];
  const newStudents: Student[] = [];

  for (const row of rows) {
    const missing = missingFieldsReason(row);
    if (missing) {
      results.push({ status: "error", row, reason: "missing_fields", message: missing });
      continue;
    }

    if (accepted.some((a) => isDuplicateOf(row, a))) {
      results.push({
        status: "error",
        row,
        reason: "duplicate_in_batch",
        message: `Duplicate row: ${row.firstName} ${row.lastName} with guardian phone ${row.guardianPhone} appears more than once in this import.`,
      });
      continue;
    }

    if (students.some((s) => isDuplicateOf(row, s))) {
      results.push({
        status: "error",
        row,
        reason: "duplicate_existing",
        message: `A student named ${row.firstName} ${row.lastName} with guardian phone ${row.guardianPhone} already exists.`,
      });
      continue;
    }

    const student: Student = {
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      grade: row.grade.trim(),
      guardianName: row.guardianName.trim(),
      guardianPhone: row.guardianPhone.trim(),
      status: "active",
      createdAt: new Date().toISOString(),
      id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    accepted.push(row);
    newStudents.push(student);
    results.push({ status: "success", row, student });
  }

  students = [...students, ...newStudents];
  return delay(results);
}

export async function setStudentStatus(
  id: string,
  status: Student["status"],
): Promise<Student> {
  const existing = students.find((s) => s.id === id);
  if (!existing) {
    throw new Error(`Student not found: ${id}`);
  }
  const updated: Student = { ...existing, status };
  students = students.map((s) => (s.id === id ? updated : s));
  return delay(updated);
}
