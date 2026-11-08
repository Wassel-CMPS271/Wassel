// Confirmation replay API types — SCRUM-273, written from the DRAFT contract
// docs/contracts/driver-gps-offline.md. SCRUM-263 (the backend) is not started, so
// `confirmationReplayApi` is null: there is no fake or sample implementation. While it
// is null, confirmations behave exactly as they do today — online-only, through
// confirmStudent() in runs.ts — and the offline queue UI says saving offline isn't
// available yet (frontend/CLAUDE.md: no mocks or fake data in a production path).
// SCRUM-263's PR replaces the null with a request()-based client built from this
// file's interface.
//
// Proposed endpoint (extends the existing one in runs.md; not implemented yet):
//   PUT /api/driver/runs/{runId}/students/{studentId}/confirmation
//       { status, clientRequestId, occurredAt? } -> Run
//
// clientRequestId is a key the caller generates once per confirmation attempt and
// resends unchanged on every retry of that same attempt (see the contract's
// "Confirmation replay and idempotency"). occurredAt is optional and an open question
// there: runs.md says the confirmation time is the server's, never the client's.

import type { ConfirmationStatus, Run } from "./runs";

export interface ConfirmationReplayInput {
  runId: string;
  studentId: string;
  status: ConfirmationStatus;
  clientRequestId: string;
  // Moment; omitted while occurredAt stays an open question (see the contract).
  occurredAt?: string;
}

export interface ConfirmationReplayApi {
  confirm(input: ConfirmationReplayInput): Promise<Run>;
}

// SCRUM-263 not merged. While this is null, the offline queue (SCRUM-273) has nothing
// to send once reconnected, so confirmations stay online-only.
export const confirmationReplayApi: ConfirmationReplayApi | null = null;
