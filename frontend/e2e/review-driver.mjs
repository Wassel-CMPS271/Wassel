// Test-only overlay. Never merges or changes a candidate's tracked implementation.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--(checkout|head|mode|backend)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Unknown argument: ${arg}`);
  return [match[1], match[2]];
}));
if (!options.checkout || !/^[a-f0-9]{40}$/.test(options.head ?? "")) throw new Error("Provide --checkout=<isolated worktree> --head=<full SHA> --mode=unit|browser");
const mode = options.mode ?? "unit";
if (!["unit", "browser"].includes(mode)) throw new Error("Unknown review mode");
const source = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const checkout = resolve(options.checkout);
if (checkout === source) throw new Error("Use a separate detached candidate worktree");
const git = (...args) => execFileSync("git", args, { cwd: checkout, encoding: "utf8", windowsHide: true }).trim();
if (git("rev-parse", "HEAD") !== options.head) throw new Error("Candidate head differs from requested SHA");
if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Candidate has tracked changes; preserve them and use a clean checkout");
const suites = ["driver", "maps-call", "authorization", "real-endpoint"].map(name => `src/app/(driver)/driver/${name}.independent.test.tsx`);
suites.push("src/lib/api/runs.independent.test.ts");
function overlay(path, content) {
  const target = resolve(checkout, path);
  if (git("ls-files", "--", path)) throw new Error(`Refusing to overlay tracked candidate file: ${path}`);
  if (existsSync(target) && !readFileSync(target).equals(content)) throw new Error(`Preserving existing different overlay: ${path}`);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target)) writeFileSync(target, content);
}
for (const file of [...suites, "src/test-support/driverContract.ts"]) overlay(`frontend/${file}`, readFileSync(resolve(source, "frontend", file)));
let command;
if (mode === "unit") command = ["node_modules/vitest/vitest.mjs", "run", ...suites, "--maxWorkers=1"];
else {
  const browserTest = readFileSync(resolve(source, "frontend/e2e/driver-client-review.e2e.ts"));
  const reviewName = `driver-client-review-${createHash("sha256").update(browserTest).digest("hex").slice(0, 12)}.e2e.ts`;
  overlay(`frontend/e2e/${reviewName}`, browserTest);
  const runner = readFileSync(resolve(checkout, "frontend/e2e/run.mjs"), "utf8");
  const marker = '["auth.e2e.ts", "auth-revocation.e2e.ts"]';
  if (runner.split(marker).length !== 2) throw new Error("Review the candidate launcher before adapting its test selection");
  let adapted = runner.replace(marker, JSON.stringify([reviewName]));
  if (options.backend) {
    const backend = resolve(options.backend);
    const root = resolve(backend, "..");
    const verify = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
    if (verify("status", "--porcelain", "--untracked-files=no")) throw new Error("Accepted backend has tracked modifications");
    const accepted = verify("rev-parse", "HEAD");
    execFileSync("git", ["merge-base", "--is-ancestor", accepted, "origin/develop"], { cwd: source, windowsHide: true });
    const backendMarker = 'const backend = resolve(frontend, "../backend");';
    if (adapted.split(backendMarker).length !== 2) throw new Error("Review backend launcher marker");
    adapted = adapted.replace(backendMarker, `const backend = ${JSON.stringify(backend)};`);
    console.log(`Accepted backend ${accepted}; only the generated review launcher changes its backend directory.`);
  }
  const launcherName = `.driver-review-run-${createHash("sha256").update(adapted).digest("hex").slice(0, 12)}.mjs`;
  overlay(`frontend/e2e/${launcherName}`, Buffer.from(adapted));
  command = [`e2e/${launcherName}`, "--suite=auth"];
}
console.log(`Independent ${mode} review of ${options.head}; candidate production source unchanged.`);
let result;
try { result = spawnSync(process.execPath, command, { cwd: resolve(checkout, "frontend"), env: process.env, stdio: "inherit", windowsHide: true }); }
finally { if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Candidate tracked files changed during verification; investigate before proceeding"); }
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
