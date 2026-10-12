// Half-day API layer — SCRUM-102.
//
// The backend endpoints exist (HalfDayController) but can't be called from
// the browser yet: they need a logged-in admin, and login lands with
// SCRUM-168/176. Until then these functions run against an in-memory mock,
// the same approach as holidays.ts. Each one is already async and returns
// the same shape as the real API, so swapping the body for a fetch() needs
// no change to the signatures or the components calling them:
//
//   GET  /api/admin/school-calendar/half-days -> HalfDay[]  (earliest first)
//   POST /api/admin/school-calendar/half-days    { date } -> HalfDay (201)
//
// Dates are ISO calendar dates ("2026-12-24"). A date can't be marked twice,
// and can't be both a half-day and a holiday: both are a 409 with
// { errors: { date: message } }, which is what ApiValidationError (errors.ts)
// models here. The mock checks "already a holiday" itself; the reverse (a
// holiday on a half-day) is only enforced by the real API.

import { ApiValidationError } from "./errors";
import { getHolidays } from "./holidays";

export interface HalfDay {
  id: string;
  date: string;
}

// Fields the caller supplies; id is assigned by the API (mock today, server later).
export type NewHalfDay = Omit<HalfDay, "id">;

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms: number = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// Zero-padded ISO dates sort correctly as text.
function byDate(list: HalfDay[]): HalfDay[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

let halfDays: HalfDay[] = [];

export async function getHalfDays(): Promise<HalfDay[]> {
  return delay(byDate(halfDays));
}

export async function addHalfDay(data: NewHalfDay): Promise<HalfDay> {
  if (halfDays.some((halfDay) => halfDay.date === data.date)) {
    throw new ApiValidationError({ date: "That date is already marked as a half-day." });
  }
  const holidays = await getHolidays();
  if (holidays.some((holiday) => holiday.date === data.date)) {
    throw new ApiValidationError({
      date: "That date is a holiday, so it can't also be a half-day.",
    });
  }
  const halfDay: HalfDay = { id: `hd-${Date.now()}`, date: data.date };
  halfDays = [...halfDays, halfDay];
  return delay({ ...halfDay });
}
