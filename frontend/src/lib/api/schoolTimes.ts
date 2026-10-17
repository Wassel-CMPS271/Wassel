// School times API layer (backend: SchoolSettingsController). The school is
// always the signed-in admin's own; the request never names it.
//
//   GET /api/admin/school-settings/times -> SchoolTimes
//   PUT /api/admin/school-settings/times    { arrivalTime, dismissalTime } -> SchoolTimes
//
// Times are 24-hour "HH:mm" strings; both are null until first set, and both
// are required on save. A dismissal at or before arrival is a 400 with
// { errors: { dismissalTime: message } }, which request() throws as
// ApiValidationError (see errors.ts and client.ts).

import { request } from "./client";

export interface SchoolTimes {
  arrivalTime: string | null;
  dismissalTime: string | null;
}

export type NewSchoolTimes = { arrivalTime: string; dismissalTime: string };

export function getSchoolTimes(): Promise<SchoolTimes> {
  return request<SchoolTimes>("/api/admin/school-settings/times");
}

export function saveSchoolTimes(data: NewSchoolTimes): Promise<SchoolTimes> {
  return request<SchoolTimes>("/api/admin/school-settings/times", { method: "PUT", body: data });
}
