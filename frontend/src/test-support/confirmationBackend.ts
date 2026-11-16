// A stand-in for the driver's confirmation PUT behind a stubbed fetch (vi.stubGlobal,
// the client.test.ts pattern), so tests go through the real confirmationReplayApi and
// request(). It follows the key rules of docs/contracts/runs.md, "Offline replay and
// clientRequestId (SCRUM-263)": a key seen before for the same run, student and status
// answers 200 again and records nothing new; the same key for anything else answers 422.
// `applied` is what the server holds: one entry per key it recorded.
//
// Each call can be scripted with reply(): an HTTP answer, a network failure, a request
// that never answers (it rejects once request()'s timeout aborts it), one the server
// applies and whose answer is then lost (it rejects on the timeout too), or one the
// server applies and that never settles at all, as when the page is reloaded mid-send.

import { vi } from "vitest";

export interface ConfirmationCall {
  url: string;
  runId: string;
  studentId: string;
  body: { status: string; clientRequestId?: string };
  init: RequestInit;
}

export type ConfirmationReply =
  | { status: number; body?: unknown }
  | "network"
  | "stall"
  | "apply-then-stall"
  | "apply-then-hang";

const CONFIRMATION_URL = /\/api\/driver\/runs\/([^/]+)\/students\/([^/]+)\/confirmation$/;

function respond(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError("Empty body")) : Promise.resolve(body)),
  };
}

function untilAborted(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
}

export function stubConfirmationBackend({
  runFor = (call) => ({ id: call.runId, stops: [] }),
}: {
  // The Run a 200 answers with.
  runFor?: (call: ConfirmationCall) => unknown;
} = {}) {
  const calls: ConfirmationCall[] = [];
  const applied = new Map<string, string>(); // clientRequestId -> "run/student/status"
  const replies: ConfirmationReply[] = [];

  // What the real backend does with a request that reached it.
  function apply(call: ConfirmationCall) {
    const tap = `${call.runId}/${call.studentId}/${call.body.status}`;
    const key = call.body.clientRequestId;
    if (key !== undefined) {
      const seen = applied.get(key);
      if (seen !== undefined && seen !== tap) {
        return respond(422, {
          title: "Unprocessable Content",
          status: 422,
          detail: `clientRequestId ${key} was already used for a different confirmation`,
        });
      }
      applied.set(key, tap);
    }
    return respond(200, runFor(call));
  }

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const match = CONFIRMATION_URL.exec(url);
    if (!match || init.method !== "PUT") return respond(404, { detail: `No stub for ${url}` });
    const call: ConfirmationCall = {
      url,
      runId: match[1],
      studentId: match[2],
      body: JSON.parse(init.body as string),
      init,
    };
    calls.push(call);
    const reply = replies.shift();
    if (reply === undefined) return apply(call);
    if (reply === "network") throw new TypeError("Failed to fetch");
    if (reply === "stall") return untilAborted(init.signal);
    if (reply === "apply-then-stall") {
      apply(call);
      return untilAborted(init.signal);
    }
    if (reply === "apply-then-hang") {
      apply(call);
      return new Promise<never>(() => {});
    }
    return respond(reply.status, reply.body);
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    fetch: fetchMock,
    calls,
    applied,
    // Scripts the next calls, in order; unscripted calls are applied as the backend would.
    reply(...next: ConfirmationReply[]) {
      replies.push(...next);
    },
    keys(): Array<string | undefined> {
      return calls.map((call) => call.body.clientRequestId);
    },
  };
}
