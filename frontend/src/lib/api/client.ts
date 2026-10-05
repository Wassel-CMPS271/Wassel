// The one place the frontend calls the backend. Every call carries the session
// cookies (credentials: "include"), so the frontend and the API must be served
// from the same site: the cookies are SameSite=Strict.

import { ApiError, ApiValidationError } from "./errors";

// `||` and not `??`: the staging build passes an empty value when it isn't set.
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

interface RequestOptions {
  method?: "GET" | "POST";
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
