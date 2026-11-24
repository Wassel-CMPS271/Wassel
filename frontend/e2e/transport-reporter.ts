import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { backendLog, logEvents } from "./backend-log";
import { buildSummary, publish, serverErrorsOf, toRawTest, type RawTest } from "./transport-evidence";

// Writes e2e-artifacts/transport-summary.json from the allowlist in transport-evidence.ts.
// Playwright's own error text, traces and bodies are never read, so they cannot reach the summary.
// The Markdown goes to the console here; the job summary is written by the CI check, after it re-checked the file.
const artifacts = resolve("e2e-artifacts");
const summaryFile = resolve(artifacts, "transport-summary.json");

export default class TransportReporter implements Reporter {
  private tests: RawTest[] = [];
  private start = Date.now();
  private logOffset = 0;
  // A file that says "the run began" until the real summary replaces it: if this reporter dies or withholds, the CI
  // check finds a file without `leakCheck` and fails, instead of reading silence as "the stack never started".
  onBegin() {
    this.logOffset = backendLog().length;
    mkdirSync(artifacts, { recursive: true });
    writeFileSync(summaryFile, JSON.stringify({ suite: "transport", status: "incomplete" }));
  }
  onTestEnd(test: TestCase, result: TestResult) { this.tests.push(toRawTest(test, result)); }
  async onEnd(result: FullResult): Promise<{ status: FullResult["status"] } | undefined> {
    const { leveled, errors } = serverErrorsOf(logEvents(this.logOffset));
    const summary = buildSummary({ durationMs: Date.now() - this.start, tests: this.tests, serverErrors: errors });
    const password = (JSON.parse(readFileSync(resolve(artifacts, "credentials.json"), "utf8")) as { password: string }).password;
    const out = publish(summary, password);
    if ("withheld" in out) { console.error(`Transport summary withheld: leak check failed (${out.withheld.join(", ")})`); return { status: "failed" }; }
    writeFileSync(summaryFile, JSON.stringify(out.summary, null, 2));
    console.log(out.markdown);
    // Fail the run when a test failed that Playwright counted as passed, when the server logged an ERROR, or when the
    // log has no readable level at all (its shape changed, so "no errors" would mean nothing).
    if (leveled === 0) { console.error("Transport summary: the backend log has no readable events, so server errors could not be checked"); return { status: "failed" }; }
    return result.status === "passed" && summary.status === "failed" ? { status: "failed" } : undefined;
  }
}
