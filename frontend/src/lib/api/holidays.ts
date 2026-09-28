// Holiday calendar API layer — SCRUM-101.
//
// The backend endpoints exist (HolidayController) but can't be called from
// the browser yet: they need a logged-in admin, and login lands with
// SCRUM-168/176. Until then these functions run against an in-memory mock,
// the same approach as schoolTimes.ts. Each one is already async and returns
// the same shape as the real API, so swapping the body for a fetch() needs
// no change to the signatures or the components calling them:
//
//   GET  /api/admin/school-calendar/holidays -> Holiday[]  (earliest first)
//   POST /api/admin/school-calendar/holidays    { date, name } -> Holiday (201)
//
// Dates are ISO calendar dates ("2026-12-25"). Adding a second holiday on a
// date that already has one is a 409 with { errors: { date: message } },
// which is what ApiValidationError (errors.ts) models here.

import { ApiValidationError } from "./errors";

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

// Fields the caller supplies; id is assigned by the API (mock today, server later).
export type NewHoliday = Omit<Holiday, "id">;

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms: number = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// Zero-padded ISO dates sort correctly as text.
function byDate(list: Holiday[]): Holiday[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

let holidays: Holiday[] = [];

export async function getHolidays(): Promise<Holiday[]> {
  return delay(byDate(holidays));
}

export async function addHoliday(data: NewHoliday): Promise<Holiday> {
  // Same rule the backend enforces: one holiday per date.
  if (holidays.some((holiday) => holiday.date === data.date)) {
    throw new ApiValidationError({ date: "A holiday is already set for that date." });
  }
  const holiday: Holiday = { id: `h-${Date.now()}`, date: data.date, name: data.name.trim() };
  holidays = [...holidays, holiday];
  return delay({ ...holiday });
}
