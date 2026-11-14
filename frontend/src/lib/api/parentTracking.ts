// GPS: merged SCRUM-261 (#143). Additive ETA: SCRUM-262 #153 at aef97a3.
// ETA parsing is prepared, but production countdown remains disabled until acceptance.
import { request } from "./client";

export interface BusPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  receivedAt: string;
  ageSeconds: number;
}
type GpsLocation =
  | { status: "UNAVAILABLE"; position: null }
  | { status: "LIVE" | "STALE"; position: BusPosition };

export interface ArrivalEstimate { arrivesAt: string; secondsAway: number; }
export interface BusProgress {
  stopsLeft: number | null;
  plannedTime: string | null;
  estimate: ArrivalEstimate | null;
}
export type BusLocation = GpsLocation & Partial<BusProgress>;
export function hasBusProgress(value: BusLocation): value is BusLocation & BusProgress {
  return "stopsLeft" in value && "plannedTime" in value && "estimate" in value;
}
function progress(r: Record<string, unknown>): Partial<BusProgress> {
  const keys = ["stopsLeft", "plannedTime", "estimate"];
  if (!keys.some(key => key in r)) return {}; // accepted GPS-only backend
  if (!keys.every(key => key in r)) throw new Error("Incomplete bus progress");
  if (r.stopsLeft !== null && (!Number.isSafeInteger(r.stopsLeft) || Number(r.stopsLeft) < 0)
    || r.plannedTime !== null && (typeof r.plannedTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.plannedTime))) throw new Error("Invalid bus progress");
  if (r.stopsLeft === null && (r.status !== "UNAVAILABLE" || r.plannedTime !== null || r.estimate !== null)) throw new Error("Invalid non-waiting progress");
  if (r.estimate !== null) {
    if (!r.estimate || typeof r.estimate !== "object" || r.status !== "LIVE" || r.stopsLeft === null) throw new Error("Invalid arrival estimate");
    const e = r.estimate as Record<string, unknown>;
    if (typeof e.arrivesAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(e.arrivesAt) || !Number.isFinite(Date.parse(e.arrivesAt))
      || !Number.isSafeInteger(e.secondsAway) || Number(e.secondsAway) < 0) throw new Error("Invalid arrival estimate");
  }
  return { stopsLeft: r.stopsLeft, plannedTime: r.plannedTime, estimate: r.estimate } as BusProgress;
}

export function parseBusLocation(value: unknown): BusLocation {
  if (!value || typeof value !== "object") throw new Error("Invalid bus location");
  const r = value as Record<string, unknown>;
  if (r.status === "UNAVAILABLE" && r.position === null) return { status: "UNAVAILABLE", position: null, ...progress(r) };
  if (!["LIVE", "STALE"].includes(String(r.status)) || !r.position || typeof r.position !== "object") throw new Error("Invalid bus location");
  const p = r.position as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!finite(p.latitude) || p.latitude < -90 || p.latitude > 90
    || !finite(p.longitude) || p.longitude < -180 || p.longitude > 180
    || !finite(p.accuracyMeters) || p.accuracyMeters < 0 || p.accuracyMeters > 10000
    || !Number.isSafeInteger(p.ageSeconds) || Number(p.ageSeconds) < 0
    || typeof p.receivedAt !== "string" || !Number.isFinite(Date.parse(p.receivedAt))
    // The server compares precise Duration, then truncates ageSeconds. STALE may be 60.
    || (r.status === "LIVE" ? Number(p.ageSeconds) > 60 : Number(p.ageSeconds) < 60 || Number(p.ageSeconds) > 300)) throw new Error("Invalid bus location");
  return { status: r.status as "LIVE" | "STALE", position: p as unknown as BusPosition, ...progress(r) };
}

export async function getBusLocation(studentId: string): Promise<BusLocation> {
  return parseBusLocation(await request<unknown>(`/api/parent/children/${encodeURIComponent(studentId)}/bus-location`));
}
