// Auth API layer (backend: AuthController).
//
// Signing in is two steps. login() checks the password and emails a code; it
// sets a pending cookie (wassel_2fa) that the browser sends back by itself, so
// the frontend never reads it. verifyCode() trades the code for the session
// cookie (wassel_token) and answers with the user. Both cookies are HttpOnly.
//
//   POST /api/auth/login        { email, password }  -> 204
//   POST /api/auth/2fa/verify   { code }             -> AuthUser
//   POST /api/auth/2fa/resend                        -> 204
//   GET  /api/auth/me                                -> AuthUser (401 when signed out)
//   POST /api/auth/logout                            -> 204
//   POST /api/auth/password     { token, password }  -> 204 (first-time set and reset)
//
// Failures throw ApiValidationError (a 400 with an `errors` map) or ApiError
// (see errors.ts and client.ts).

import { request } from "./client";

export type Role = "DRIVER" | "PARENT" | "HEAD_OF_TRANSPORT" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  schoolId: string;
}

// Where each role lands, and the only area it may open.
export const ROLE_HOME: Record<Role, string> = {
  DRIVER: "/driver",
  PARENT: "/parent",
  HEAD_OF_TRANSPORT: "/head-of-transport",
  ADMIN: "/admin",
};

export function login(email: string, password: string): Promise<void> {
  return request("/api/auth/login", { method: "POST", body: { email, password } });
}

export function verifyCode(code: string): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/2fa/verify", { method: "POST", body: { code } });
}

export function resendCode(): Promise<void> {
  return request("/api/auth/2fa/resend", { method: "POST" });
}

export function me(): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/me");
}

export function logout(): Promise<void> {
  return request("/api/auth/logout", { method: "POST" });
}

export function setPassword(token: string, password: string): Promise<void> {
  return request("/api/auth/password", { method: "POST", body: { token, password } });
}
