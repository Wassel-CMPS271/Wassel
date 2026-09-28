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
