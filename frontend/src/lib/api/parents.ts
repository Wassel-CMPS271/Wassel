import { request } from "./client";
import { ApiError, ApiValidationError } from "./errors";

export interface Parent {
  id: string;
  email: string;
  status: "invited" | "active" | "revoked";
  createdAt: string;
}

const PATH = "/api/head-of-transport/parents";
export const getParents = () => request<Parent[]>(PATH);
export const inviteParent = (email: string) => request<Parent>(PATH, {
  method: "POST", body: { email: email.trim() },
});
// SCRUM-98: a revoked parent can't sign in and loses an open session at the next request.
export const revokeParent = (id: string) => request<Parent>(`${PATH}/${encodeURIComponent(id)}/revoke`, { method: "PATCH" });
export const restoreParent = (id: string) => request<Parent>(`${PATH}/${encodeURIComponent(id)}/restore`, { method: "PATCH" });

export function parentError(error: unknown): string {
  if (error instanceof ApiValidationError) return Object.values(error.errors).join(" ");
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 403) return "You do not have permission to manage parents.";
    if (error.status === 404) return "The student or parent is no longer available. Refresh and try again.";
    if (error.status < 500) return error.message;
  }
  return "Something went wrong. Please try again.";
}
