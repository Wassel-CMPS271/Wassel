// What one failed send means for the offline queue (docs/contracts/driver-gps-offline.md,
// "Per-item result -> UI state"). Success is the resolved promise and needs no
// classifying; this only sorts the ways a send can fail.
//
//   retryable  network failure (TypeError), timeout (AbortError/TimeoutError), 408,
//              429, 5xx, or anything unexpected: sent again later with the same key
//   auth       401: the whole queue pauses and keeps its items until sign-in
//   conflict   404, 409: the server disagrees with what the screen showed; never
//              retried automatically, the day should be refetched
//   rejected   400, 403, 422 and other 4xx, and field errors: retrying the same
//              request can't help, so it waits for the driver

import { ApiError, ApiValidationError } from "../api/errors";

export type Failure =
  | { kind: "retryable"; network: boolean; status?: number; message: string }
  | { kind: "auth"; status: 401; message: string }
  | { kind: "conflict"; status: number; message: string }
  | { kind: "rejected"; status?: number; message: string };

export function classifyFailure(error: unknown): Failure {
  if (error instanceof ApiValidationError) {
    // A field error map: the body itself was refused.
    const first = Object.values(error.errors)[0];
    return { kind: "rejected", message: first ?? error.message };
  }
  if (error instanceof ApiError) {
    const { status, message } = error;
    if (status === 401) return { kind: "auth", status, message };
    if (status === 404 || status === 409) return { kind: "conflict", status, message };
    if (status === 408 || status === 429 || status >= 500) {
      return { kind: "retryable", network: false, status, message };
    }
    return { kind: "rejected", status, message };
  }
  if (isNetworkFailure(error)) {
    return { kind: "retryable", network: true, message: messageOf(error) };
  }
  // Something unexpected (a body that didn't parse, a bug). Resending with the same
  // clientRequestId is always safe, so it's retried rather than dropped.
  return { kind: "retryable", network: false, message: messageOf(error) };
}

// fetch rejects with a TypeError when the network is down, and with an AbortError
// when request()'s timeoutMs fires. Either says nothing reached the server's answer.
function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const name = (error as { name?: unknown } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed";
}
