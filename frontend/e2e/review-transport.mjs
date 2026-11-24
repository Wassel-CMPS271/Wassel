// Transport E2E (SCRUM-284): reassignment, offline replay and notification email on the real stack.
// Uses the existing isolated auth runner, adding only this suite, a test clock, email on and a sanitized reporter.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const dir = dirname(fileURLToPath(import.meta.url));
let source = readFileSync(resolve(dir, "run.mjs"), "utf8");
// On GitHub the log is public, so only the sanitized reporter prints (Playwright's list reporter prints failed assertions in full).
const reporters = process.env.GITHUB_ACTIONS ? "./e2e/transport-reporter.ts" : "list,./e2e/transport-reporter.ts";
const replacements = [
 ['["auth.e2e.ts", "auth-revocation.e2e.ts"]', `["transport-reassignment.e2e.ts", "transport-replay.e2e.ts", "transport-notification-email.e2e.ts", "--reporter=${reporters}"]`],
 ['"--spring.profiles.active=local,e2e"', '"--spring.profiles.active=local,e2e", "--spring.main.sources=com.wassel.backend.e2e.WeekdayE2eClock"'],
];
for (const [before, after] of replacements) { if (source.split(before).length !== 2) throw new Error("Review shared E2E launcher marker"); source = source.replace(before, after); }
const generated = resolve(dir, `.transport-review-run-${createHash("sha256").update(source).digest("hex").slice(0, 12)}.mjs`);
if (existsSync(generated) && readFileSync(generated, "utf8") !== source) throw new Error("Preserving different generated launcher");
writeFileSync(generated, source);
// Email on (the point of the scenario); the address lookup is pointed at a closed port, so the backend makes no outside call (mail goes
// to its own log). (The parent map in the browser still loads OpenStreetMap tiles.)
// A summary left by an earlier run must never be read as this run's.
rmSync(resolve(dir, "..", "e2e-artifacts", "transport-summary.json"), { force: true });
const env = { ...process.env, NOTIFICATION_EMAIL_ENABLED: "true", NOMINATIM_BASE_URL: "http://127.0.0.1:9" };
const result = spawnSync(process.execPath, [generated, "--suite=auth", ...process.argv.slice(2)], { cwd: resolve(dir, ".."), env, stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
