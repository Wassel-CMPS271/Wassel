// Head of transport admin API layer (backend: AdminController).
//
// Admins invite a head of transport by email only; the backend creates the
// account and sends its own invite. There is no name field.
//
//   POST /api/admin/head-of-transport   { email }  -> 201 AccountResponse
//
// Requires an authenticated ADMIN; enforced server-side, nothing to check here.
//
// Failures throw ApiValidationError (a 400 with an `errors` map, e.g. a blank
// or malformed email) or ApiError (e.g. a 409 with `detail` "An account with
// this email already exists." for a duplicate email). See errors.ts and
// client.ts.

import { request } from "./client";

export interface HeadOfTransportAccount {
  id: string;
  email: string;
  status: "invited" | "active";
  createdAt: string;
}

export function inviteHeadOfTransport(email: string): Promise<HeadOfTransportAccount> {
  return request<HeadOfTransportAccount>("/api/admin/head-of-transport", {
    method: "POST",
    body: { email },
  });
}
