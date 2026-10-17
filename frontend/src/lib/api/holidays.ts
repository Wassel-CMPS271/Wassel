// Holiday calendar API layer (backend: HolidayController). The school is
// always the signed-in admin's own; the request never names it.
//
//   GET  /api/admin/school-calendar/holidays -> Holiday[]  (earliest first)
//   POST /api/admin/school-calendar/holidays    { date, name } -> Holiday (201)
//
// Dates are ISO calendar dates ("2026-12-25"). Adding a second holiday on a
// date that already has one is a 409 with { errors: { date: message } }, which
// request() throws as ApiValidationError (see errors.ts and client.ts).
//
// Deleting a holiday has no endpoint yet (SCRUM-214), so there is no delete here.

import { request } from "./client";

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

// Fields the caller supplies; id is assigned by the API.
export type NewHoliday = Omit<Holiday, "id">;

export function getHolidays(): Promise<Holiday[]> {
  return request<Holiday[]>("/api/admin/school-calendar/holidays");
}

export function addHoliday(data: NewHoliday): Promise<Holiday> {
  return request<Holiday>("/api/admin/school-calendar/holidays", { method: "POST", body: data });
}
