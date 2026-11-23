// Address change requests (SCRUM-269): docs/contracts/address-requests.md. The head of
// transportation's side (list/approve/reject) and the parent's side (submit/list for one
// child, SCRUM-281).

import { request } from "./client";

export interface AddressRequest {
  /** The request's own id, not the student's. */
  id: string;
  studentId: string;
  /** "firstName lastName" at the time of the request (see the contract). */
  studentName: string;
  /** The student's saved address when the request was made. Null if none was set. */
  currentAddress: string | null;
  /** The new address text the parent is asking for, trimmed, at most 255 characters. Never the saved address. */
  requestedAddress: string;
  /** Set only when the parent placed a pin for the requested address; otherwise both null. */
  requestedLat: number | null;
  requestedLng: number | null;
  requestedBy: { parentUserId: string; email: string };
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  /** Null while status is "pending"; set once, when approved or rejected. */
  decidedAt: string | null;
  /** Only ever set when status is "rejected", and only when a reason was given. */
  rejectionReason: string | null;
}

export interface AddressRequestsApi {
  /** The school's pending requests: GET /api/head-of-transport/address-requests (status defaults to pending). */
  list(): Promise<AddressRequest[]>;
  /** Approval saves the requested address (and pin, if any) on the student in the same transaction. */
  approve(id: string): Promise<AddressRequest>;
  reject(id: string, reason?: string): Promise<AddressRequest>;
}

const PATH = "/api/head-of-transport/address-requests";

// No ?status=: the backend's default is pending, which is all the roster shows.
export const listAddressRequests = () => request<AddressRequest[]>(PATH);

export const approveAddressRequest = (id: string) =>
  request<AddressRequest>(`${PATH}/${encodeURIComponent(id)}/approve`, { method: "POST" });

// No reason means no body: the backend reads a missing body, or a blank reason, as none.
export const rejectAddressRequest = (id: string, reason?: string) =>
  request<AddressRequest>(`${PATH}/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: reason?.trim() ? { reason: reason.trim() } : undefined,
  });

export const addressRequestsApi: AddressRequestsApi = {
  list: listAddressRequests,
  approve: approveAddressRequest,
  reject: rejectAddressRequest,
};

// ---- Parent side (SCRUM-281) ----

export interface AddressRequestInput {
  address: string;
  latitude?: number;
  longitude?: number;
}

const parentChildPath = (studentId: string) =>
  "/api/parent/children/" + encodeURIComponent(studentId) + "/address-requests";

function obj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const nullableText = (x: unknown) => x === null || typeof x === "string";
// Plain decimal text only, so "abc", "33.8e" or "0x10" can't pass as a number (or as a blank field).
const decimalText = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const moment = (x: unknown) =>
  typeof x === "string" && /^\d{4}-\d{2}-\d{2}T.+Z$/.test(x) && Number.isFinite(Date.parse(x));
function validPin(lat: unknown, lng: unknown): boolean {
  return (lat === null && lng === null) ||
    (typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
      typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180);
}
/** A 2xx answer whose body is not a valid AddressRequest; after a POST the request was probably saved. */
export class InvalidAddressRequestResponse extends Error {
  constructor() {
    super("Invalid address-request response");
    this.name = "InvalidAddressRequestResponse";
  }
}
function parseRequest(value: unknown, studentId: string): AddressRequest {
  if (!obj(value) || typeof value.id !== "string" || value.studentId !== studentId ||
    typeof value.studentName !== "string" || !nullableText(value.currentAddress) ||
    typeof value.requestedAddress !== "string" || !validPin(value.requestedLat, value.requestedLng) ||
    !obj(value.requestedBy) || typeof value.requestedBy.parentUserId !== "string" ||
    typeof value.requestedBy.email !== "string" ||
    !["pending", "approved", "rejected"].includes(String(value.status)) ||
    !moment(value.createdAt) || (value.decidedAt !== null && !moment(value.decidedAt)) ||
    !nullableText(value.rejectionReason)) {
    throw new InvalidAddressRequestResponse();
  }
  return value as unknown as AddressRequest;
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
    if (!decimalText.test(lat) || Number(lat) < -90 || Number(lat) > 90)
      errors.latitude = "Latitude must be between -90 and 90.";
    if (!decimalText.test(lng) || Number(lng) < -180 || Number(lng) > 180)
      errors.longitude = "Longitude must be between -180 and 180.";
  }
  return errors;
}

export async function listParentAddressRequests(studentId: string): Promise<AddressRequest[]> {
  const value = await request<unknown>(parentChildPath(studentId));
  if (!Array.isArray(value)) throw new Error("Invalid address-request list");
  return value.map(item => parseRequest(item, studentId));
}

export async function submitParentAddressRequest(
  studentId: string, input: AddressRequestInput,
): Promise<AddressRequest> {
  const address = input.address.trim();
  const body: AddressRequestInput = { address };
  if (input.latitude !== undefined && input.longitude !== undefined) {
    body.latitude = input.latitude;
    body.longitude = input.longitude;
  }
  return parseRequest(
    await request<unknown>(parentChildPath(studentId), { method: "POST", body }),
    studentId,
  );
}
