// Errors shared by the API layer modules.

// A 400/409 from the real API carries { errors: { field: message } } (see
// GlobalExceptionHandler on the backend), so forms can show each message next
// to its field.
export class ApiValidationError extends Error {
  readonly errors: Record<string, string>;

  constructor(errors: Record<string, string>) {
    super("Validation failed");
    this.name = "ApiValidationError";
    this.errors = errors;
  }
}

// Any other non-2xx answer: the status tells callers what to do (401 means
// signed out, 429 means wait), and the message is the backend's `detail` when
// it sent one. A 401 from /api/auth/me has an empty body, so there is a fallback.
// `studentIds` is the extra property of the optimize 409 for stops without a
// pin (docs/contracts/routing.md); undefined for every other answer.
// `retryAfterSeconds` is the Retry-After header of a 429 from the per-address
// limit on the sign-in endpoints (SCRUM-288); undefined for every other answer.
export class ApiError extends Error {
  readonly status: number;
  readonly studentIds?: string[];
  readonly retryAfterSeconds?: number;

  constructor(status: number, detail?: string, studentIds?: string[], retryAfterSeconds?: number) {
    super(detail || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.studentIds = studentIds;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// "Too many attempts, try again in N seconds" for a sign-in endpoint that
// refused this address (a 429 with Retry-After), else null. The other 429 of
// the sign-in flow, a code sent under a minute ago, has no Retry-After and is
// worded by its own screen.
export function rateLimitMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 429 || error.retryAfterSeconds === undefined) {
    return null;
  }
  const seconds = error.retryAfterSeconds;
  return `Too many attempts. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
}
