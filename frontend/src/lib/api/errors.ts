// Errors shared by the API layer modules.

// A 400/409 from the real API carries { errors: { field: message } } (see
// GlobalExceptionHandler on the backend). The mocks throw this same shape, so
// forms can show each message next to its field whether the data comes from a
// mock or from fetch().
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
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, detail?: string) {
    super(detail || "Request failed");
    this.name = "ApiError";
    this.status = status;
  }
}
