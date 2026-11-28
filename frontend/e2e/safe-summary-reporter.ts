// Only fixed test names, relative source paths, statuses and timings are exported.
// Never serialize Playwright result objects: they can contain secrets in errors,
// stdout, attachments, request headers and traces.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class SafeSummaryReporter implements Reporter {
  private tests: { title: string; file: string; expected: string; status: string; durationMs: number; retry: number }[] = [];
  onTestEnd(test: TestCase, result: TestResult) {
    const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    this.tests.push({
      title: test.titlePath().join(" > "), file: relative(frontend, test.location.file).replaceAll("\\", "/"),
      expected: test.expectedStatus, status: result.status, durationMs: result.duration, retry: result.retry,
    });
  }
  onEnd(result: FullResult) {
    const output = resolve(dirname(fileURLToPath(import.meta.url)), "../e2e-artifacts/operations-summary.json");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({ status: result.status, durationMs: result.duration, tests: this.tests }, null, 2), { mode: 0o600 });
  }
}
