// Run this branch's reviewed copies of PR #169's independent acceptance suite.
// Provenance and the six strict singular-wording corrections are documented in
// docs/testing/SCRUM-280/SCRUM-169-wording-conflict.md. Never import a moving branch
// or generate/patch tests at runtime; the complete reviewed suite is checked in.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tests = ["tracking", "authorization", "inbox", "preferences"].map(name => `src/app/(parent)/parent/${name}.acceptance.test.tsx`);
const files = [...tests, "src/test-support/parentAcceptance.owned.ts"];
if (process.argv.slice(2).some(arg => arg !== "--prepare-only")) throw new Error("Unknown acceptance-review option");
for (const file of files) {
  if (!existsSync(resolve(frontend, file))) throw new Error(`Missing branch-owned acceptance file: ${file}`);
}
console.log("Branch-owned PR #169 acceptance copies: all 80 cases; count one requires exactly '1 unread update'.");
if (!process.argv.includes("--prepare-only")) {
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...tests, "--maxWorkers=2"], { cwd: frontend, env: process.env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
