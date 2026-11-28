// Only fixed test names, relative source paths, statuses and timings are exported.
// Never serialize Playwright result objects: they can contain secrets in errors,
// stdout, attachments, request headers and traces.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class SafeSummaryReporter implements Reporter {
  private frontend = process.cwd();
  onBegin(config: FullConfig) {
    // Playwright loads this TS reporter as CommonJS; configFile works in both
    // module formats, and also when the CLI starts outside the frontend folder.
    this.frontend = config.configFile ? dirname(config.configFile) : process.cwd();
  }
  private tests: { title: string; file: string; expected: string; status: string; durationMs: number; retry: number }[] = [];
  onTestEnd(test: TestCase, result: TestResult) {
    this.tests.push({
      title: test.titlePath().join(" > "), file: relative(this.frontend, test.location.file).replaceAll("\\", "/"),
      expected: test.expectedStatus, status: result.status, durationMs: result.duration, retry: result.retry,
    });
  }
  onEnd(result: FullResult) {
    const output = resolve(this.frontend, "e2e-artifacts/operations-summary.json");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({ status: result.status, durationMs: result.duration, tests: this.tests }, null, 2), { mode: 0o600 });
  }
}
