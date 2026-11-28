// @vitest-environment node
import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { FullResult, TestCase, TestResult } from "@playwright/test/reporter";
import SafeSummaryReporter from "./safe-summary-reporter";
vi.mock("node:fs", () => ({ mkdirSync: vi.fn(), writeFileSync: vi.fn() }));

it("exports result evidence without errors, output, attachments or credential values", () => {
  const reporter = new SafeSummaryReporter();
  const testCase = { titlePath: () => ["chromium", "real address decisions"], location: { file: "/test/frontend/e2e/operations-address.e2e.ts" }, expectedStatus: "passed" } as unknown as TestCase;
  const testResult = { status: "failed", duration: 12, retry: 0, errors: [{ message: "SECRET-COOKIE" }], stdout: ["SECRET-PASSWORD"], stderr: ["SECRET-2FA"], attachments: [{ path: "SECRET-TRACE" }] } as unknown as TestResult;
  reporter.onTestEnd(testCase, testResult);
  reporter.onEnd({ status: "failed", duration: 20 } as FullResult);
  expect(writeFileSync).toHaveBeenCalledTimes(1);
  expect(writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/e2e-artifacts[\\/]operations-summary\.json$/), expect.any(String), { mode: 0o600 });
  const serialized = vi.mocked(writeFileSync).mock.calls[0][1] as string;
  const evidence = JSON.parse(serialized);
  expect(evidence).toMatchObject({ status: "failed", tests: [{ status: "failed", expected: "passed", durationMs: 12, retry: 0 }] });
  expect(evidence.tests[0].title).toContain("real address decisions");
  expect(serialized).not.toMatch(/SECRET|stdout|stderr|attachments|errors/);
});
