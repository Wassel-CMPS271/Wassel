// Address change requests (SCRUM-269): docs/contracts/address-requests.md. The head of
// transportation's side only; the parent's submit/list endpoints have no screen yet.

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
