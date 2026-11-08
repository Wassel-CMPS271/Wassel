// Driver GPS API types — SCRUM-273, written from the DRAFT contract
// docs/contracts/driver-gps-offline.md. SCRUM-261 (the backend) is not started, so
// `driverGpsApi` is null: there is no fake or sample implementation, and nothing in a
// production path calls these endpoints yet (frontend/CLAUDE.md: every module calls the
// real backend, no mocks). SCRUM-261's PR replaces the null with a request()-based
// client built from this file's interface, the way runs.ts's functions are built.
//
// Proposed endpoints (not implemented; see the contract for open questions):
//   GET    /api/driver/runs/{runId}/location-sharing              -> LocationSharing
//   PUT    /api/driver/runs/{runId}/location-sharing  { enabled } -> LocationSharing
//          (also how sharing is turned off; DELETE is only an alternative in the contract)
//   POST   /api/driver/runs/{runId}/positions          Position   -> 204

export interface LocationSharing {
  enabled: boolean;
  // Moment, null while enabled is false.
  since: string | null;
}

export interface LocationSharingInput {
  enabled: boolean;
}

export interface PositionInput {
  latitude: number;
  longitude: number;
  // The device's reported accuracy, so a bad fix can be told from a good one.
  accuracyMeters: number;
  // Moment: when the device took the fix, not when the request arrived.
  recordedAt: string;
}

export interface DriverGpsApi {
  getSharing(runId: string): Promise<LocationSharing>;
  setSharing(runId: string, input: LocationSharingInput): Promise<LocationSharing>;
  sendPosition(runId: string, input: PositionInput): Promise<void>;
}

// SCRUM-261 not merged. While this is null, the GPS consent hook (SCRUM-273) shows
// sharing as unavailable instead of calling anything, exactly as the screen behaves
// today (no position sharing at all).
export const driverGpsApi: DriverGpsApi | null = null;
