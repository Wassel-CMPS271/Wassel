// SCRUM-281: parent-only address requests and read-only attendance history.
// Source of truth: docs/contracts/address-requests.md and attendance.md.
// Cookie, parent identity and school are handled by request()/the backend.

import { request } from "./client";
import { isSchoolDate } from "./absences";

export interface ParentAddressRequest {
  id: string;
  studentId: string;
  studentName: string;
  currentAddress: string | null;
  requestedAddress: string;
  requestedLat: number | null;
  requestedLng: number | null;
  requestedBy: { parentUserId: string; email: string };
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
  rejectionReason: string | null;
}

export interface AddressRequestInput {
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface ParentAttendance {
  date: string;
  direction: "MORNING" | "AFTERNOON";
  status: "NOT_PRESENT" | "PICKED_UP" | "DROPPED_OFF";
  notPresentAt: string | null;
  pickedUpAt: string | null;
  droppedOffAt: string | null;
}

export interface AttendanceRange { from: string; to: string }

const childPath = (studentId: string) =>
  "/api/parent/children/" + encodeURIComponent(studentId);

function obj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const nullableText = (x: unknown) => x === null || typeof x === "string";
const moment = (x: unknown) =>
  typeof x === "string" && /^\d{4}-\d{2}-\d{2}T.+Z$/.test(x) && Number.isFinite(Date.parse(x));
function validPin(lat: unknown, lng: unknown): boolean {
  return (lat === null && lng === null) ||
    (typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
      typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180);
}
function parseRequest(value: unknown, studentId: string): ParentAddressRequest {
  if (!obj(value) || typeof value.id !== "string" || value.studentId !== studentId ||
    typeof value.studentName !== "string" || !nullableText(value.currentAddress) ||
    typeof value.requestedAddress !== "string" || !validPin(value.requestedLat, value.requestedLng) ||
    !obj(value.requestedBy) || typeof value.requestedBy.parentUserId !== "string" ||
    typeof value.requestedBy.email !== "string" ||
    !["pending", "approved", "rejected"].includes(String(value.status)) ||
    !moment(value.createdAt) || (value.decidedAt !== null && !moment(value.decidedAt)) ||
    !nullableText(value.rejectionReason)) {
    throw new Error("Invalid address-request response");
  }
  return value as unknown as ParentAddressRequest;
}
function parseAttendance(value: unknown): ParentAttendance {
  if (!obj(value) || !isSchoolDate(String(value.date)) ||
    !["MORNING", "AFTERNOON"].includes(String(value.direction)) ||
    !["NOT_PRESENT", "PICKED_UP", "DROPPED_OFF"].includes(String(value.status)) ||
    !["notPresentAt", "pickedUpAt", "droppedOffAt"].every(k => value[k] === null || moment(value[k]))) {
    throw new Error("Invalid attendance response");
  }
  return value as unknown as ParentAttendance;
}

export function addressInputErrors(input: { address: string; latitude: string; longitude: string }) {
  const errors: Record<string, string> = {};
  const address = input.address.trim();
  if (!address || address.length > 255) errors.address = "Enter an address of 1 to 255 characters.";
  const lat = input.latitude.trim(), lng = input.longitude.trim();
  if (!!lat !== !!lng) {
    errors.latitude = "Enter both coordinates or leave both blank.";
    errors.longitude = "Enter both coordinates or leave both blank.";
  } else if (lat && lng) {
    if (!Number.isFinite(Number(lat)) || Number(lat) < -90 || Number(lat) > 90)
      errors.latitude = "Latitude must be between -90 and 90.";
    if (!Number.isFinite(Number(lng)) || Number(lng) < -180 || Number(lng) > 180)
      errors.longitude = "Longitude must be between -180 and 180.";
  }
  return errors;
}

// Exactly 62 inclusive days maximum. UTC calendar arithmetic avoids daylight-saving shifts.
export function attendanceRangeErrors(range: AttendanceRange): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isSchoolDate(range.from)) errors.from = "Choose a valid start date.";
  if (!isSchoolDate(range.to)) errors.to = "Choose a valid end date.";
  if (Object.keys(errors).length) return errors;
  const from = Date.parse(range.from + "T12:00:00Z");
  const to = Date.parse(range.to + "T12:00:00Z");
  const days = Math.round((to - from) / 86_400_000) + 1;
  if (days < 1) errors.to = "End date must be on or after start date.";
  else if (days > 62) errors.to = "Choose at most 62 days, including both endpoints.";
  return errors;
}

export async function listParentAddressRequests(studentId: string): Promise<ParentAddressRequest[]> {
  const value = await request<unknown>(childPath(studentId) + "/address-requests");
  if (!Array.isArray(value)) throw new Error("Invalid address-request list");
  return value.map(item => parseRequest(item, studentId));
}

export async function submitParentAddressRequest(
  studentId: string, input: AddressRequestInput,
): Promise<ParentAddressRequest> {
  const address = input.address.trim();
  const body: AddressRequestInput = { address };
  if (input.latitude !== undefined && input.longitude !== undefined) {
    body.latitude = input.latitude;
    body.longitude = input.longitude;
  }
  return parseRequest(
    await request<unknown>(childPath(studentId) + "/address-requests", { method: "POST", body }),
    studentId,
  );
}

export async function getParentAttendance(
  studentId: string, range: AttendanceRange,
): Promise<ParentAttendance[]> {
  if (Object.keys(attendanceRangeErrors(range)).length) throw new Error("Invalid attendance date range");
  const params = new URLSearchParams({ from: range.from, to: range.to });
  const value = await request<unknown>(childPath(studentId) + "/attendance?" + params.toString());
  if (!Array.isArray(value)) throw new Error("Invalid attendance list");
  return value.map(parseAttendance);
}
