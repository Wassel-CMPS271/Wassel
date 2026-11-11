// Driver GPS API client — SCRUM-273, built from docs/contracts/runs.md's "Live
// location" section (SCRUM-261 / PR #143 is not yet merged on develop; this client
// is only real once that lands). One module per backend area
// (frontend/CLAUDE.md): every call goes through request() in client.ts.
//
//   PUT /api/driver/runs/{runId}/location-sharing  { enabled } -> 200 Run
//   PUT /api/driver/runs/{runId}/location  { latitude, longitude, accuracyMeters } -> 204

import { request } from "./client";
import type { Run } from "./runs";

export interface LocationSharingInput {
  enabled: boolean;
}

export interface PositionInput {
  latitude: number;
  longitude: number;
  // The device's reported accuracy, so a bad fix can be told from a good one.
  accuracyMeters: number;
}

export interface DriverGpsApi {
  setSharing(runId: string, input: LocationSharingInput): Promise<Run>;
  sendPosition(runId: string, input: PositionInput): Promise<void>;
}

export function setLocationSharing(runId: string, enabled: boolean): Promise<Run> {
  return request<Run>(`/api/driver/runs/${runId}/location-sharing`, {
    method: "PUT",
    body: { enabled },
  });
}

// A send that never comes back shouldn't pile up behind the next one: about 10s,
// matching the ~10s send interval the hook throttles to (docs/contracts/driver-gps-offline.md).
const SEND_LOCATION_TIMEOUT_MS = 10_000;

export function sendLocation(runId: string, input: PositionInput): Promise<void> {
  return request<void>(`/api/driver/runs/${runId}/location`, {
    method: "PUT",
    body: input,
    timeoutMs: SEND_LOCATION_TIMEOUT_MS,
  });
}

export const driverGpsApi: DriverGpsApi = {
  setSharing: (runId, input) => setLocationSharing(runId, input.enabled),
  sendPosition: sendLocation,
};
