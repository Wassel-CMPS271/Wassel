import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LAST_API_CALL, buildSummary, formatApiCall, leakFindings, normalizePath, publish, safeValue, serverErrorsOf, toMarkdown, toRawTest, type RawTest } from "./transport-evidence";

const id = "30000000-0000-4000-8000-000000000007";

describe("normalizePath", () => {
  it("replaces ids and drops the query string", () => {
    expect(normalizePath(`/api/driver/runs/${id}/students/${id}/confirmation?x=1`)).toBe("/api/driver/runs/{id}/students/{id}/confirmation");
  });
});

describe("safeValue", () => {
  it("keeps numbers, booleans and the status words, and hides everything else", () => {
    expect(safeValue(409)).toBe("409");
    expect(safeValue(true)).toBe("true");
    expect(safeValue("PICKED_UP")).toBe("PICKED_UP");
    for (const secret of ["Lea Mansour", "parent@auth-e2e.invalid", "123456", "eyJhbGciOiJIUzI1NiJ9.abc", "token=abc"]) expect(safeValue(secret)).toBe("[omitted]");
  });
});

const failed = {
  title: "offline replay: double tap",
  file: "/repo/frontend/e2e/transport-replay.e2e.ts",
  status: "failed" as const,
  duration: 96_400,
  annotations: [{ type: LAST_API_CALL, description: formatApiCall("put", `/api/driver/runs/${id}/students/${id}/confirmation?k=1`, 409) }],
  steps: ["reconnect and drain the queue"],
  error: {
    message: "Expected: 200\nReceived: 409\n{\"detail\":\"Lea Mansour was picked up\"} parent@auth-e2e.invalid",
    location: { line: 58 },
    matcherResult: { name: "toBe", expected: 200, actual: 409 },
  },
};
const passed: RawTest = { title: "journey", file: "transport-reassignment.e2e.ts", status: "passed", duration: 141_000, annotations: [], steps: [] };

describe("buildSummary", () => {
  const summary = buildSummary({ durationMs: 412_000, tests: [passed, failed], serverErrors: [{ logger: "c.w.b.runs.service.RunService", level: "ERROR" }, { logger: "c.w.b.runs.service.RunService", level: "ERROR" }] });
  it("keeps only the allowlisted fields", () => {
    expect(summary.status).toBe("failed");
    expect(summary.tests[1]).toEqual({
      title: "offline replay: double tap",
      file: "transport-replay.e2e.ts",
      status: "failed",
      durationSeconds: 96,
      failure: { line: 58, step: "reconnect and drain the queue", lastApiCall: { method: "PUT", path: "/api/driver/runs/{id}/students/{id}/confirmation", status: 409 }, assertion: { matcher: "toBe", expected: "200", received: "409" } },
    });
    expect(summary.tests[0]).not.toHaveProperty("failure");
    expect(summary.serverErrors).toEqual([{ logger: "c.w.b.runs.service.RunService", level: "ERROR", count: 2 }]);
  });
  it("never carries the error message, a body, a name or an address", () => {
    expect(leakFindings(JSON.stringify(summary))).toEqual([]);
    expect(JSON.stringify(summary)).not.toMatch(/Mansour|detail|Expected:/);
    expect(leakFindings(toMarkdown(summary))).toEqual([]);
  });
  it("reports passed when every test passed", () => {
    expect(buildSummary({ durationMs: 1000, tests: [passed], serverErrors: [] }).status).toBe("passed");
  });
  it("does not report passed for no tests, or for a server ERROR beside passing tests", () => {
    expect(buildSummary({ durationMs: 1000, tests: [], serverErrors: [] }).status).toBe("failed");
    expect(buildSummary({ durationMs: 1000, tests: [passed], serverErrors: [{ logger: "c.w.X", level: "ERROR" }] }).status).toBe("failed");
  });
  it("treats a timeout and an interruption as failures with their step and line, and keeps the status word", () => {
    for (const status of ["timedOut", "interrupted"] as const) {
      const summary = buildSummary({ durationMs: 1000, tests: [{ ...failed, status }], serverErrors: [] });
      expect(summary.status).toBe("failed");
      expect(summary.tests[0]).toMatchObject({ status, failure: { line: 58, step: "reconnect and drain the queue" } });
    }
  });
  it("keeps a failure without a last call or a matcher as nulls, not as invented text", () => {
    const bare: RawTest = { title: "t", file: "a.ts", status: "failed", duration: 1000, annotations: [], steps: [] };
    expect(buildSummary({ durationMs: 1000, tests: [bare], serverErrors: [] }).tests[0].failure).toEqual({ line: null, step: null });
  });
  it("uses the latest last-api-call and ignores a malformed one", () => {
    const tests: RawTest[] = [{ ...failed, annotations: [{ type: LAST_API_CALL, description: "GET /a 200" }, { type: LAST_API_CALL, description: "not a call" }] }];
    expect(buildSummary({ durationMs: 0, tests, serverErrors: [] }).tests[0].failure?.lastApiCall).toBeUndefined();
    tests[0].annotations = [{ type: LAST_API_CALL, description: "GET /a 200" }, { type: LAST_API_CALL, description: "POST /b 409" }];
    expect(buildSummary({ durationMs: 0, tests, serverErrors: [] }).tests[0].failure?.lastApiCall).toEqual({ method: "POST", path: "/b", status: 409 });
  });
});

describe("toRawTest", () => {
  const test = { title: "journey", location: { file: "/repo/e2e/transport-replay.e2e.ts" }, annotations: [{ type: "last-api-call", description: "GET /a 200" }] };
  it("keeps the titles of failed top-level test steps only", () => {
    const raw = toRawTest(test, {
      status: "failed", duration: 5000,
      steps: [
        { category: "test.step", title: "passing step" },
        { category: "test.step", title: "failing step", error: { message: "boom parent@auth-e2e.invalid" } },
        { category: "expect", title: "expect.toBe", error: { message: "boom" } },
        { category: "pw:api", title: "page.click", error: {} },
      ],
      error: Object.assign(new Error("secret message"), { location: { file: "x.ts", line: 12, column: 3 }, matcherResult: { name: "toBe", expected: 200, actual: 409 } }),
    });
    expect(raw).toMatchObject({ title: "journey", status: "failed", duration: 5000, steps: ["failing step"], error: { location: { line: 12 }, matcherResult: { name: "toBe", expected: 200, actual: 409 } } });
    expect(JSON.stringify(raw)).not.toMatch(/secret message|parent@/);
  });
  it("has no error for a passing test", () => {
    expect(toRawTest(test, { status: "passed", duration: 1, steps: [] }).error).toBeUndefined();
  });
});

describe("serverErrorsOf", () => {
  it("counts ERROR events by logger and says how many events had a readable level", () => {
    const out = serverErrorsOf([{ log: { level: "INFO", logger: "a" } }, { log: { level: "ERROR", logger: "b" } }, { message: "no log object" }, { log: { logger: "c" } }]);
    expect(out).toEqual({ leveled: 2, errors: [{ logger: "b", level: "ERROR" }] });
  });
  it("reports no readable events when the log has a different shape", () => {
    expect(serverErrorsOf([{ message: "x" }, {}]).leveled).toBe(0);
  });
});

describe("publish", () => {
  const clean = buildSummary({ durationMs: 1000, tests: [passed], serverErrors: [] });
  it("marks a clean summary as checked and renders its Markdown", () => {
    const out = publish(clean, "pw-Secret_123");
    expect(out).toMatchObject({ summary: { leakCheck: "passed", status: "passed" } });
    expect("markdown" in out && out.markdown).toContain("### Transport E2E: passed");
  });
  it("withholds everything when a title holds an email address or the run password", () => {
    for (const [title, finding] of [["sign in as parent@auth-e2e.invalid", "email address"], ["pw-Secret_123 typed", "run password"]]) {
      const out = publish(buildSummary({ durationMs: 0, tests: [{ ...passed, title }], serverErrors: [] }), "pw-Secret_123");
      expect(out).toEqual({ withheld: [finding] });
    }
  });
});

describe("the contract's samples", () => {
  for (const name of ["summary-failed", "summary-passed"]) {
    it(`${name}.json has the producer's shape and nothing on the leak list`, () => {
      const text = readFileSync(resolve(__dirname, `../../docs/contracts/samples/transport-e2e/${name}.json`), "utf8");
      const sample = JSON.parse(text);
      expect(Object.keys(sample)).toEqual(Object.keys({ ...buildSummary({ durationMs: 0, tests: [], serverErrors: [] }), leakCheck: "passed" }));
      expect(leakFindings(text, "pw-Secret_123")).toEqual([]);
    });
  }
});

describe("leakFindings", () => {
  it("finds planted secrets and the run password", () => {
    for (const planted of ["a@auth-e2e.invalid", "x@e2e.invalid", "token=abc", "eyJhbGciOiJIUzI1NiJ9", "wassel_token", "wassel_2fa", "Your verification code is", "pw-Secret_123"]) {
      expect(leakFindings(`before ${planted} after`, "pw-Secret_123"), planted).not.toEqual([]);
    }
  });
  it("finds nothing in plain numbers and words", () => {
    expect(leakFindings("PUT /api/driver/runs/{id}/confirmation 409 123456 expected 200", "pw-Secret_123")).toEqual([]);
  });
});
