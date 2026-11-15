// Read-only-source candidate UI + accepted parent/backend, isolated test stack.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../..");
const checkout = process.env.E2E_DRIVER_CHECKOUT;
const expected = process.env.E2E_DRIVER_EXPECTED_HEAD;
if (!checkout || !/^[a-f0-9]{40}$/.test(expected ?? "")) throw new Error("Supply isolated E2E_DRIVER_CHECKOUT and exact E2E_DRIVER_EXPECTED_HEAD");
const candidate = resolve(checkout);
if (candidate === root) throw new Error("Use a separate candidate checkout");
const git = (...args) => execFileSync("git", args, { cwd: candidate, encoding: "utf8", windowsHide: true }).trim();
function verify() {
 if (git("rev-parse", "HEAD") !== expected) throw new Error("Candidate moved; independently review the new head before running");
 if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Candidate has tracked modifications; preserving them");
}
verify();
if (!readFileSync(resolve(candidate, "frontend/package-lock.json")).equals(readFileSync(resolve(root, "frontend/package-lock.json")))) throw new Error("Review candidate dependency differences before sharing this test setup");
let source = readFileSync(resolve(dir, "run.mjs"), "utf8");
const setup = `await unusedPort(4192);
  const driverFrontend = ${JSON.stringify(resolve(candidate, "frontend"))};
  await run(process.execPath, ["node_modules/next/dist/bin/next", "build"], driverFrontend, "driver-build.log");
  const driverWeb = launch(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4192"], driverFrontend, "driver-frontend.log");
  await ready("candidate driver UI", async () => { try { return (await fetch("http://127.0.0.1:4192/login")).ok; } catch { return false; } }, driverWeb);
  `;
const marker = 'await run(process.execPath, ["node_modules/@playwright/test/cli.js",';
const replacements = [
 ['["auth.e2e.ts", "auth-revocation.e2e.ts"]', '["parent-driver-ui.e2e.ts"]'],
 ['"--spring.profiles.active=local,e2e"', '"--spring.profiles.active=local,e2e", "--spring.main.sources=com.wassel.backend.e2e.WeekdayE2eClock"'],
 ['CORS_ALLOWED_ORIGINS: baseURL,', 'CORS_ALLOWED_ORIGINS: `${baseURL},http://127.0.0.1:4192`,'],
 [marker, setup + marker],
];
for (const [before, after] of replacements) { if (source.split(before).length !== 2) throw new Error("Review shared launcher before adapting the dual UI scenario"); source = source.replace(before, after); }
const generated = resolve(dir, `.parent-driver-review-run-${createHash("sha256").update(source).digest("hex").slice(0, 12)}.mjs`);
if (existsSync(generated) && readFileSync(generated, "utf8") !== source) throw new Error("Preserving different generated launcher");
writeFileSync(generated, source);
console.log(`Exact unchanged driver candidate ${expected}; parent/backend from this branch; no production responses mocked.`);
let result;
try { result = spawnSync(process.execPath, [generated, "--suite=auth"], { cwd: resolve(dir, ".."), env: process.env, stdio: "inherit", windowsHide: true }); }
finally { verify(); }
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
