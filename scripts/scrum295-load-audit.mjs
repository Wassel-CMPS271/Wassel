/**
 * SCRUM-295: read-only audit of a k6 steady-state load-test summary.
 * Requires a machine-readable JSON produced by k6 handleSummary(data).
 * Does not run traffic or send sign-in mail; do not use on live school data.
 * The sign-in burst, dataset size, provider stubs and resource limits require
 * separate evidence, as documented in docs/testing/SCRUM-295/README.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function finiteNonnegative(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export function verifySteadyState(summary, fiveXxMetricName) {
  if (!summary || typeof summary !== "object" ||
      typeof fiveXxMetricName !== "string" ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fiveXxMetricName)) {
    throw new Error("Missing k6 summary or invalid explicit 5xx counter name");
  }
  const metrics = summary.metrics;
  const p95 = metrics?.http_req_duration?.values?.["p(95)"];
  const rate = metrics?.http_reqs?.values?.rate;
  const requests = metrics?.http_reqs?.values?.count;
  const errors = metrics?.[fiveXxMetricName]?.values?.count;
  const peakVus = metrics?.vus?.values?.max;
  const durationMs = summary.state?.testRunDurationMs;

  if (![p95, rate, requests, errors, peakVus, durationMs].every(finiteNonnegative)) {
    throw new Error("Missing/non-numeric k6 p95, RPS, HTTP count, explicit 5xx counter, peak VUs or duration");
  }
  if (![requests, errors, peakVus].every(Number.isSafeInteger)) {
    throw new Error("k6 counts and peak VUs must be safe integers");
  }
  // k6 reports http_req_duration in milliseconds and http_reqs.rate in req/s.
  // Check the actual run duration and achieved rate, not intended config alone.
  const checks = [
    { name: "p95 under 1000 ms", actual: p95, pass: p95 < 1000 },
    { name: "zero HTTP 5xx", actual: errors, pass: errors === 0 },
    { name: "40-50 requests/sec achieved", actual: rate, pass: rate >= 40 && rate <= 50 },
    { name: "300 peak active VUs", actual: peakVus, pass: peakVus >= 300 },
    { name: "10 minutes measured", actual: durationMs / 1000, pass: durationMs >= 600_000 },
  ];
  return { requests, checks, pass: checks.every((x) => x.pass) };
}

function main() {
  if (process.argv.length !== 4) {
    throw new Error("Usage: node scripts/scrum295-load-audit.mjs <k6-summary.json> <explicit_5xx_counter_name>");
  }
  const [filename, metricName] = process.argv.slice(2);
  const result = verifySteadyState(JSON.parse(readFileSync(filename, "utf8")), metricName);
  console.log("k6 requests recorded: " + result.requests);
  for (const check of result.checks) {
    console.log((check.pass ? "PASS " : "FAIL ") + check.name + " — measured: " + check.actual);
  }
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error("SCRUM-295 load audit failed closed: " + error.message);
    process.exitCode = 2;
  }
}
