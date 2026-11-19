// The real confirmation replay client (SCRUM-263/273) against a stubbed fetch: the
// request it sends and how each answer in docs/contracts/runs.md ("Offline replay and
// clientRequestId") comes back. The samples are the contract's own.

import { afterEach, describe, expect, it, vi } from "vitest";
import keyReused from "../../../../docs/contracts/samples/runs/confirmation-key-reused.json";
import sampleRequest from "../../../../docs/contracts/samples/runs/confirmation-request.json";
import runFinished from "../../../../docs/contracts/samples/runs/run-finished.json";
import { confirmationReplayApi } from "./confirmationReplay";
import { ApiError, ApiValidationError } from "./errors";
import type { ConfirmationStatus } from "./runs";

const RUN_ID = "50000000-0000-4000-8000-000000000001";
const STUDENT_ID = "40000000-0000-4000-8000-000000000002";
const INPUT = {
  runId: RUN_ID,
  studentId: STUDENT_ID,
  status: sampleRequest.status as ConfirmationStatus,
  clientRequestId: sampleRequest.clientRequestId,
};

function answer(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError("Empty")) : Promise.resolve(body)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("confirmationReplayApi.confirm", () => {
  it("PUTs the existing confirmation endpoint with the key in the JSON body, and no other header", async () => {
    const fetchMock = answer(200, runFinished);

    await confirmationReplayApi.confirm(INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8080/api/driver/runs/${RUN_ID}/students/${STUDENT_ID}/confirmation`,
    );
    expect(init).toMatchObject({
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(init.body).toBe(JSON.stringify(sampleRequest));
    expect(init.signal).toBeUndefined();
  });

  it("URL-encodes a studentId or runId containing a slash", async () => {
    const fetchMock = answer(200, runFinished);
    const studentIdWithSlash = "40/02";

    await confirmationReplayApi.confirm({ ...INPUT, studentId: studentIdWithSlash });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8080/api/driver/runs/${RUN_ID}/students/40%2F02/confirmation`,
    );
  });

  it("resolves with the Run the server answered with", async () => {
    answer(200, runFinished);

    await expect(confirmationReplayApi.confirm(INPUT)).resolves.toEqual(runFinished);
  });

  it("aborts a stalled request after timeoutMs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("The operation was aborted.", "AbortError")),
            ),
          ),
      ),
    );

    const sent = confirmationReplayApi.confirm(INPUT, { timeoutMs: 15_000 });
    const settled = expect(sent).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(15_000);

    await settled;
  });

  it("turns a 401 with an empty body into ApiError 401", async () => {
    answer(401);

    await expect(confirmationReplayApi.confirm(INPUT)).rejects.toEqual(new ApiError(401));
  });

  it.each([
    [403, "Access denied"],
    [404, "Student is not on this run"],
    [409, "Run is FINISHED, so it cannot be confirmed"],
    [400, "Malformed request body"],
    [500, "An unexpected error occurred"],
  ])("turns a %s into ApiError with the server's detail", async (status, detail) => {
    answer(status, { status, detail });

    const error = await confirmationReplayApi.confirm(INPUT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message: detail });
  });

  it("turns the contract's key-reused 422 into ApiError 422", async () => {
    answer(422, keyReused);

    const error = await confirmationReplayApi.confirm(INPUT).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 422, message: keyReused.detail });
  });

  it("turns a 400 with a field error map into ApiValidationError", async () => {
    answer(400, { detail: "Validation failed", errors: { status: "must not be null" } });

    const error = await confirmationReplayApi.confirm(INPUT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiValidationError);
    expect(error).toMatchObject({ errors: { status: "must not be null" } });
  });

  it("lets a network failure through as it is", async () => {
    const failure = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));

    await expect(confirmationReplayApi.confirm(INPUT)).rejects.toBe(failure);
  });
});
