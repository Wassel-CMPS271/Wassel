// Uses the existing isolated auth runner, adding only this suite and a test clock.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const dir = dirname(fileURLToPath(import.meta.url));
let source = readFileSync(resolve(dir, "run.mjs"), "utf8");
const replacements = [
 ['["auth.e2e.ts", "auth-revocation.e2e.ts"]', '["parent-inbox.e2e.ts"]'],
 ['"--spring.profiles.active=local,e2e"', '"--spring.profiles.active=local,e2e", "--spring.main.sources=com.wassel.backend.e2e.WeekdayE2eClock"'],
];
for (const [before, after] of replacements) { if (source.split(before).length !== 2) throw new Error("Review shared E2E launcher marker"); source = source.replace(before, after); }
const generated = resolve(dir, `.parent-inbox-review-run-${createHash("sha256").update(source).digest("hex").slice(0, 12)}.mjs`);
if (existsSync(generated) && readFileSync(generated, "utf8") !== source) throw new Error("Preserving different generated launcher");
writeFileSync(generated, source);
const result = spawnSync(process.execPath, [generated, "--suite=auth"], { cwd: resolve(dir, ".."), env: process.env, stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
