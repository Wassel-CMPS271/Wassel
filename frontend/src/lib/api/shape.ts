// Small response-shape checks shared by the API modules that validate their own bodies.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A server timestamp: ISO date-time ending in Z that actually parses. */
export const isMoment = (x: unknown) =>
  typeof x === "string" && /^\d{4}-\d{2}-\d{2}T.+Z$/.test(x) && Number.isFinite(Date.parse(x));
