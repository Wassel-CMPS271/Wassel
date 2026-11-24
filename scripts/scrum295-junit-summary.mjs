/** Extract counts and test identities only; never publish captured HTTP bodies, cookies or logs. */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
export function summarizeJUnit(xml) {
  const opening = /<testsuite\b([^>]*)>/.exec(xml);
  if (!opening || !xml.includes("</testsuite>")) throw new Error("Missing JUnit testsuite");
  const attrs = Object.fromEntries([...opening[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1],m[2]]));
  const result = { name: attrs.name, cases: [] };
  for (const key of ["tests","failures","errors","skipped"]) {
    if (!/^\d+$/.test(attrs[key] ?? "")) throw new Error("Invalid JUnit " + key);
    result[key] = Number(attrs[key]);
    if (!Number.isSafeInteger(result[key])) throw new Error("Unsafe JUnit count");
  }
  if (result.failures + result.errors + result.skipped > result.tests) throw new Error("Inconsistent JUnit counts");
  result.passed = result.tests - result.failures - result.errors - result.skipped;
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const data = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1],m[2]]));
    const body = match[2] ?? "";
    result.cases.push({ name: data.name, status: /<failure\b/.test(body) ? "failed" : /<error\b/.test(body) ? "error" : /<skipped\b/.test(body) ? "skipped" : "passed" });
  }
  if (result.cases.length !== result.tests) throw new Error("JUnit case count does not match");
  for (const [state,key] of [["failed","failures"],["error","errors"],["skipped","skipped"]]) {
    if (result.cases.filter(row => row.status === state).length !== result[key]) throw new Error("JUnit statuses do not match counts");
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, output] = process.argv.slice(2);
  if (!directory || !output || process.argv.length !== 4) throw new Error("Usage: node scripts/scrum295-junit-summary.mjs <surefire-directory> <safe-summary.json>");
  const files = readdirSync(directory).filter(file => /^TEST-independent\.scrum295\..*\.xml$/.test(file));
  if (!files.length) throw new Error("No independent metrics JUnit reports were produced");
  const suites = files.sort().map(file => summarizeJUnit(readFileSync(resolve(directory,file),"utf8")));
  const result = { candidateSha: "e8bca50722324279df6be686843949b06a212500", suites };
  mkdirSync(dirname(output),{recursive:true}); writeFileSync(output, JSON.stringify(result,null,2)+"\n");
  for (const suite of suites) console.log(suite.name + ": " + suite.passed + " passed, " + suite.failures + " failed, " + suite.errors + " errors, " + suite.skipped + " skipped");
}
