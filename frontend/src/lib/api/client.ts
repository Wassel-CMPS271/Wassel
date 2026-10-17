// The one place the frontend calls the backend. Every call carries the session
// cookies (credentials: "include"), so the frontend and the API must be served
// from the same site: the cookies are SameSite=Strict.
//
// NEXT_PUBLIC_API_BASE_URL decides where calls go:
//   - not set: http://localhost:8080, the backend of local development (next dev).
//   - a URL: that backend directly (the backend's CORS must allow this site's origin).
//   - empty: relative URLs (/api/...), which the app proxies to the backend (see
//     next.config.ts), so the browser only talks to its own origin. This is how a deployment runs.

import { ApiError, ApiValidationError } from "./errors";

// `=== undefined` and not `||`: an empty value is meaningful (relative URLs), not "unset".
const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const BASE_URL =
  configuredBaseUrl === undefined ? "http://localhost:8080" : configuredBaseUrl.replace(/\/+$/, "");

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

// Resolves with the parsed JSON body, or undefined for a 204. A failure throws
// ApiValidationError when the backend sent an `errors` map, else ApiError. A
// network failure rejects as it is, so callers treat anything else as "try again".
export async function request<T = void>(
  path: string,
  { method = "GET", body }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: "include",
    // The backend's CORS only allows Content-Type, so send it only with a body.
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  // The body can be empty or not JSON (a 401 from /api/auth/me is empty).
  const problem = await response.json().catch(() => undefined);
  if (problem?.errors && typeof problem.errors === "object") {
    throw new ApiValidationError(problem.errors);
  }
  throw new ApiError(response.status, problem?.detail);
}
