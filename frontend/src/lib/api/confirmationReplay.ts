// Offline confirmation replay (SCRUM-263 backend, SCRUM-273 client): docs/contracts/runs.md,
// "Offline replay and clientRequestId (SCRUM-263)". It is the same PUT as confirmStudent()
// in runs.ts, with the tap's key in the JSON body:
//
//   PUT /api/driver/runs/{runId}/students/{studentId}/confirmation
//       { status, clientRequestId } -> Run
//
// There is no batch endpoint: the HTTP status of each request is that item's result
// (lib/offline/classify.ts sorts the failures). clientRequestId is a UUID the queue makes
// once per tap and resends unchanged on every retry of that tap; a repeat of a key the
// server has already applied answers 200 with the run as it is now, and the same key
// for a different run, student or status answers 422. It goes in the body, never in a
// header (the backend's CORS allows only Content-Type). No client time is sent: the
// confirmation time is the server's (runs.md "Known limits"). The queue keeps its own
// `occurredAt` locally, for display only.

import { request } from "./client";
import type { ConfirmationStatus, Run } from "./runs";

export interface ConfirmationReplayInput {
  runId: string;
  studentId: string;
  status: ConfirmationStatus;
  clientRequestId: string;
}

export interface ConfirmationReplayOptions {
  // Passed through to request()'s timeoutMs, so a stuck attempt rejects (and is
  // retried with the same clientRequestId) instead of blocking the queue.
  timeoutMs?: number;
}

export interface ConfirmationReplayApi {
  confirm(input: ConfirmationReplayInput, options?: ConfirmationReplayOptions): Promise<Run>;
}

export const confirmationReplayApi: ConfirmationReplayApi = {
  // The same URL as confirmStudent. runId and studentId are UUIDs in practice, so
  // encoding is a no-op for them, but encode anyway since the path segment contract
  // doesn't guarantee that.
  confirm({ runId, studentId, status, clientRequestId }, { timeoutMs } = {}) {
    return request<Run>(
      `/api/driver/runs/${encodeURIComponent(runId)}/students/${encodeURIComponent(studentId)}/confirmation`,
      {
        method: "PUT",
        body: { status, clientRequestId },
        timeoutMs,
      },
    );
  },
};
