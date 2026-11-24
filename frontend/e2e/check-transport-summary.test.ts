import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildSummary, publish, type RawTest } from "./transport-evidence";

// The CI gate (check-transport-summary.mjs) run for real in a scratch folder: it reads e2e-artifacts/ from its cwd.
const gate = resolve(__dirname, "check-transport-summary.mjs");
const passed: RawTest = { title: "journey", file: "a.e2e.ts", status: "passed", duration: 1000, annotations: [], steps: [] };

function runGate(summary: string | undefined) {
  const cwd = mkdtempSync(resolve(tmpdir(), "gate-"));
  try {
    mkdirSync(resolve(cwd, "e2e-artifacts"));
    if (summary !== undefined) writeFileSync(resolve(cwd, "e2e-artifacts/transport-summary.json"), summary);
    const jobSummary = resolve(cwd, "job-summary.md");
    const result = spawnSync(process.execPath, [gate], { cwd, env: { ...process.env, GITHUB_STEP_SUMMARY: jobSummary }, encoding: "utf8" });
    let written = "";
    try { written = readFileSync(jobSummary, "utf8"); } catch { /* nothing was published */ }
    return { code: result.status, stderr: result.stderr, written };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
const checked = (tests: RawTest[]) => {
  const out = publish(buildSummary({ durationMs: 1000, tests, serverErrors: [] }), "pw");
  if (!("summary" in out)) throw new Error("withheld");
  return JSON.stringify(out.summary);
};

describe("check-transport-summary.mjs", () => {
  it("passes with a note, and publishes nothing, when the stack never reached the tests", () => {
    expect(runGate(undefined)).toMatchObject({ code: 0, written: "" });
  });
  it("fails on the reporter's placeholder: the reporter began and never finished or withheld its summary", () => {
    const out = runGate(JSON.stringify({ suite: "transport", status: "incomplete" }));
    expect(out).toMatchObject({ code: 1, written: "" });
    expect(out.stderr).toContain("incomplete or was withheld");
  });
  it("fails on a summary with no tests", () => {
    expect(runGate(checked([])).code).toBe(1);
  });
  it("fails, and publishes nothing, when the file holds an email address", () => {
    const leaky = checked([passed]).replace("journey", "journey for parent@auth-e2e.invalid");
    expect(runGate(leaky)).toMatchObject({ code: 1, written: "" });
  });
  it("passes a clean summary and writes its Markdown to the job summary", () => {
    const out = runGate(checked([passed]));
    expect(out.code).toBe(0);
    expect(out.written).toContain("### Transport E2E: passed");
  });
});
