// SCRUM-279 consumes SCRUM-261's contract in PR #143 at c58d911.
// No ETA shape exists yet: do not add an invented ETA endpoint or field.
import { request } from "./client";

export interface BusPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  receivedAt: string;
  ageSeconds: number;
}
export type BusLocation =
  | { status: "UNAVAILABLE"; position: null }
  | { status: "LIVE" | "STALE"; position: BusPosition };

export function parseBusLocation(value: unknown): BusLocation {
  if (!value || typeof value !== "object") throw new Error("Invalid bus location");
  const r = value as Record<string, unknown>;
  if (r.status === "UNAVAILABLE" && r.position === null) return { status: "UNAVAILABLE", position: null };
  if (!["LIVE", "STALE"].includes(String(r.status)) || !r.position || typeof r.position !== "object") throw new Error("Invalid bus location");
  const p = r.position as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!finite(p.latitude) || p.latitude < -90 || p.latitude > 90
    || !finite(p.longitude) || p.longitude < -180 || p.longitude > 180
    || !finite(p.accuracyMeters) || p.accuracyMeters < 0 || p.accuracyMeters > 10000
    || !Number.isSafeInteger(p.ageSeconds) || Number(p.ageSeconds) < 0
    || typeof p.receivedAt !== "string" || !Number.isFinite(Date.parse(p.receivedAt))
    || (r.status === "LIVE" ? Number(p.ageSeconds) > 60 : Number(p.ageSeconds) <= 60 || Number(p.ageSeconds) > 300)) throw new Error("Invalid bus location");
  return { status: r.status as "LIVE" | "STALE", position: p as unknown as BusPosition };
}

export async function getBusLocation(studentId: string): Promise<BusLocation> {
  return parseBusLocation(await request<unknown>(`/api/parent/children/${encodeURIComponent(studentId)}/bus-location`));
}
