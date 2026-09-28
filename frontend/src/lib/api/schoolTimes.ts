// School times API layer — SCRUM-178.
//
// The backend endpoints exist (SchoolSettingsController) but can't be called
// from the browser yet: they need a logged-in admin, and login lands with
// SCRUM-168/176. Until then these functions run against an in-memory mock,
// the same approach as vehicles.ts. Each one is already async and returns
// the same shape as the real API, so swapping the body for a fetch() needs
// no change to the signatures or the components calling them:
//
//   GET /api/admin/school-settings/times -> { arrivalTime, dismissalTime }
//   PUT /api/admin/school-settings/times    (same shape, both required)
//
// Times are 24-hour "HH:mm" strings; both are null until first set. A 400
// from the real API carries { errors: { field: message } }, which is what
// ApiValidationError models here.

export interface SchoolTimes {
  arrivalTime: string | null;
  dismissalTime: string | null;
}

export type NewSchoolTimes = { arrivalTime: string; dismissalTime: string };

export class ApiValidationError extends Error {
  readonly errors: Record<string, string>;

  constructor(errors: Record<string, string>) {
    super("Validation failed");
    this.name = "ApiValidationError";
    this.errors = errors;
  }
}

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms: number = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let schoolTimes: SchoolTimes = { arrivalTime: null, dismissalTime: null };

export async function getSchoolTimes(): Promise<SchoolTimes> {
  return delay({ ...schoolTimes });
}

export async function saveSchoolTimes(data: NewSchoolTimes): Promise<SchoolTimes> {
  // Same rule the backend enforces. Zero-padded 24h strings compare correctly as text.
  if (data.dismissalTime <= data.arrivalTime) {
    throw new ApiValidationError({
      dismissalTime: "Dismissal time must be after arrival time.",
    });
  }
  schoolTimes = { ...data };
  return delay({ ...schoolTimes });
}
