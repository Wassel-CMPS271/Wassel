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
export class ApiError extends Error {
  readonly status: number;
  readonly studentIds?: string[];

  constructor(status: number, detail?: string, studentIds?: string[]) {
    super(detail || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.studentIds = studentIds;
  }
}
