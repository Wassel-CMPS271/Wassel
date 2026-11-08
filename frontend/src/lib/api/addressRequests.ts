// Address change requests (SCRUM-269, not merged yet). Draft contract:
// docs/contracts/address-requests.md. The roster's "Address requests" section
// (SCRUM-275) is built against the AddressRequestsApi interface below, so the
// real request()-based client can be dropped in with no UI changes once
// SCRUM-269 lands: replace `addressRequestsApi`'s value with a real
// implementation (the model is lib/api/parents.ts: a few `request()` calls
// plus an error-mapping helper) and delete this comment.
//
// There is no sample client here, unlike the Sprint 3 runs screen
// (frontend/CLAUDE.md "API calls"): that exception is for an endpoint whose
// contract is merged and only waiting on the PR; this one has no contract
// yet, so the section renders its "coming soon" placeholder instead of fake
// data.

export interface AddressRequest {
  /** The request's own id, not the student's. */
  id: string;
  studentId: string;
  /** "firstName lastName" at the time of the request (see the contract). */
  studentName: string;
  /** The student's saved address when the request was made. Null if none was set. */
  currentAddress: string | null;
  /** The new address text the parent is asking for. Never the saved address. */
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
  approve(id: string): Promise<AddressRequest>;
  reject(id: string, reason?: string): Promise<AddressRequest>;
}

// null until SCRUM-269 merges. AddressRequestsSection renders its "coming
// soon" placeholder whenever this is null, so the roster page never needs
// its own null check.
export const addressRequestsApi: AddressRequestsApi | null = null;
