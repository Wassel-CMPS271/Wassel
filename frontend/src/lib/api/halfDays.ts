// Half-day API layer (backend: HalfDayController). The school is always the
// signed-in admin's own; the request never names it.
//
//   GET  /api/admin/school-calendar/half-days -> HalfDay[]  (earliest first)
//   POST /api/admin/school-calendar/half-days    { date } -> HalfDay (201)
//
// Dates are ISO calendar dates ("2026-12-24"). A date can't be marked twice,
// and can't be both a half-day and a holiday: both are a 409 with
// { errors: { date: message } }, which request() throws as ApiValidationError
// (see errors.ts and client.ts).

import { request } from "./client";

export interface HalfDay {
  id: string;
  date: string;
}

// Fields the caller supplies; id is assigned by the API.
export type NewHalfDay = Omit<HalfDay, "id">;

export function getHalfDays(): Promise<HalfDay[]> {
  return request<HalfDay[]>("/api/admin/school-calendar/half-days");
}

export function addHalfDay(data: NewHalfDay): Promise<HalfDay> {
  return request<HalfDay>("/api/admin/school-calendar/half-days", { method: "POST", body: data });
}
