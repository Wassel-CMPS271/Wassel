import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The isolated backend's log (e2e-artifacts/backend.log, one ECS JSON object per line), shared by the sign-in
// helpers, the email assertions and the transport reporter. Offsets are lengths of backendLog().
export interface LogEvent { message?: string; log?: { level?: string; logger?: string } }

const path = resolve("e2e-artifacts/backend.log");
export const backendLog = () => readFileSync(path, "utf8");

/** The events logged after `offset`, oldest first. Lines that are not JSON (JVM startup output) are not events. */
export function logEvents(offset = 0): LogEvent[] {
  const events: LogEvent[] = [];
  for (const line of backendLog().slice(offset).split(/\r?\n/)) {
    try {
      const event: unknown = JSON.parse(line);
      if (event && typeof event === "object") events.push(event as LogEvent);
    } catch { /* JVM startup output */ }
  }
  return events;
}
