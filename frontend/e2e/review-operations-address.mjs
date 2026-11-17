// Isolated real-stack address verification; shared runner remains unchanged.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const dir = dirname(fileURLToPath(import.meta.url));
const marker = '["auth.e2e.ts", "auth-revocation.e2e.ts"]';
const source = readFileSync(resolve(dir, "run.mjs"), "utf8");
if (source.split(marker).length !== 2) throw new Error("Review shared launcher before selecting address suite");
const content = source.replace(marker, '["operations-address.e2e.ts"]');
const generated = resolve(dir, `.operations-address-run-${createHash("sha256").update(content).digest("hex").slice(0, 12)}.mjs`);
if (existsSync(generated) && readFileSync(generated, "utf8") !== content) throw new Error("Preserving different generated launcher");
writeFileSync(generated, content);
const result = spawnSync(process.execPath, [generated, "--suite=auth"], { cwd: resolve(dir, ".."), env: process.env, stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
