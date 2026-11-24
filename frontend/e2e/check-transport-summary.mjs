// CI gate (SCRUM-284): the transport summary must hold nothing that is not on the allowlist, and only then reaches the job summary.
// The reporter checked the run password while it still existed; this re-checks the patterns on the file and on its Markdown.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { leakFindings, toMarkdown } from "./transport-evidence.ts"; // Node 24 strips the types; the file uses no other TypeScript.
const fail = message => { console.error(message); process.exit(1); };
const file = resolve("e2e-artifacts/transport-summary.json");
// The reporter writes a placeholder when the tests begin, and the launcher clears old files first, so no file at all
// means the stack never reached the tests (the main step has already failed the job).
if (!existsSync(file)) { console.log("No transport summary: the stack never reached the tests."); process.exit(0); }
const text = readFileSync(file, "utf8");
const summary = JSON.parse(text);
if (summary.leakCheck !== "passed") fail("Transport summary is incomplete or was withheld: the reporter did not finish its leak check");
if (!Array.isArray(summary.tests) || summary.tests.length === 0) fail("Transport summary has no tests");
const markdown = toMarkdown(summary);
const leaks = leakFindings(text + markdown);
if (leaks.length) fail(`Transport summary leaks: ${leaks.join(", ")}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
console.log("Transport summary is clean.");
