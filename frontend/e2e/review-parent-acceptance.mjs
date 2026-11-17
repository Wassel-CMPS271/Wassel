// Run Majd's exact PR #169 acceptance snapshot without changing his branch or
// copying its feature history into these PRs. Existing different files are preserved.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(frontend, "..");
const snapshot = "da61dfb6a7951221ceb38092a5c117eaa9216d6e";
const tests = ["tracking", "authorization", "inbox", "preferences"].map(name => `src/app/(parent)/parent/${name}.independent.test.tsx`);
const files = [...tests, "src/test-support/parentAcceptance.ts"];
if (process.argv.slice(2).some(arg => arg !== "--prepare-only")) throw new Error("Unknown acceptance-review option");
for (const file of files) {
  const source = execFileSync("git", ["show", `${snapshot}:frontend/${file}`], { cwd: root, windowsHide: true });
  const target = resolve(frontend, file);
  if (existsSync(target)) {
    if (!readFileSync(target).equals(source)) throw new Error(`Preserving different acceptance file: ${file}`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source, { flag: "wx" });
  }
}
console.log(`Exact PR #169 acceptance snapshot ${snapshot}; all four test files and shared harness unchanged.`);
if (!process.argv.includes("--prepare-only")) {
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...tests, "--maxWorkers=2"], { cwd: frontend, env: process.env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
