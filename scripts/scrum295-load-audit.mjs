/**
 * SCRUM-295: read-only k6 evidence inspection and strict acceptance audit.
 * Reads handleSummary and native --summary-export formats without inventing
 * missing measurements. Aggregate RPS can include setup and mail-stub traffic;
 * it is not silently relabelled as backend-only steady-state throughput.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function values(summary, name) {
  const row = summary.metrics?.[name];
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  if (Object.hasOwn(row, "values")) {
    if (!row.values || typeof row.values !== "object" || Array.isArray(row.values)) {
      throw new Error("Malformed k6 values for " + name);
    }
    // Do not choose one of two contradictory measurements.
    for (const field of ["count", "rate", "max", "p(95)"]) {
      if (Object.hasOwn(row, field)) throw new Error("Ambiguous k6 metric format for " + name);
    }
    return row.values;
  }
  return row;
}

function measured(value, name, missing, integer = false) {
  if (value === undefined || value === null) { missing.push(name); return null; }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Missing/non-numeric k6 measurement: " + name);
  }
  if (integer && !Number.isSafeInteger(value)) throw new Error("k6 counts and peak VUs must be safe integers");
  return value;
}

export function inspectSteadyState(summary, fiveXxMetricName) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary) ||
      typeof fiveXxMetricName !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fiveXxMetricName)) {
    throw new Error("Missing k6 summary or invalid explicit 5xx counter name");
  }
  const missing = [];
  const p95 = measured(values(summary, "http_req_duration")?.["p(95)"], "p95", missing);
  const aggregateRate = measured(values(summary, "http_reqs")?.rate, "RPS", missing);
  const requests = measured(values(summary, "http_reqs")?.count, "HTTP count", missing, true);
  const errors = measured(values(summary, fiveXxMetricName)?.count, "explicit 5xx counter", missing, true);
  const peakVus = measured(values(summary, "vus")?.max, "peak active VUs", missing, true);
  let durationMs;
  let rate = aggregateRate;
  if (summary.independentMeasured) {
    const steadyRequests = measured(summary.independentMeasured.steadyBackendRequests, "steady backend HTTP count", missing, true);
    durationMs = measured(summary.independentMeasured.steadyElapsedMs, "actual steady duration", missing);
    rate = steadyRequests === null || durationMs === null || durationMs === 0 ? null : steadyRequests / (durationMs / 1000);
    if (rate === null) missing.push("backend-only steady request rate");
  } else {
    durationMs = measured(summary.state?.testRunDurationMs, "actual duration", missing);
    if (Object.keys(summary.metrics ?? {}).some(name => /\{phase:(signin|setup|stub)/.test(name))) missing.push("backend-only steady request rate");
  }
  const checks = [
    { name: "p95 under 1000 ms", actual: p95, pass: p95 !== null && p95 < 1000 },
    { name: "zero HTTP 5xx", actual: errors, pass: errors === 0 },
    { name: "40-50 requests/sec achieved", actual: rate, pass: rate !== null && rate >= 40 && rate <= 50 },
    { name: "300 peak active VUs", actual: peakVus, pass: peakVus !== null && peakVus >= 300 },
    { name: "10 minutes measured", actual: durationMs === null ? null : durationMs / 1000, pass: durationMs !== null && durationMs >= 600_000 },
  ];
  const extra = (name, field) => measured(values(summary, name)?.[field], name + "." + field, []);
  return {
    requests, checks, complete: missing.length === 0, missing,
    pass: missing.length === 0 && checks.every(check => check.pass),
    observations: {
      aggregateRequestsPerSecond: aggregateRate,
      backendSteadyRequestsPerSecond: summary.independentMeasured ? rate : null,
      parentActors: summary.independentMeasured?.parentActors ?? null,
      driverActors: summary.independentMeasured?.driverActors ?? null,
      completedBurst: summary.independentMeasured?.completedBurst ?? null,
      steadyP95Millis: extra("http_req_duration{phase:steady}", "p(95)"),
      passwordP95Millis: extra("http_req_duration{phase:signin-password}", "p(95)"),
      codeP95Millis: extra("http_req_duration{phase:signin-code}", "p(95)"),
      signInP95Millis: extra("sign_in_duration", "p(95)"),
      failedSignIns: extra("sign_in_failures", "count"),
      failedRequestRate: extra("http_req_failed", "value") ?? extra("http_req_failed", "rate"),
      failedChecks: extra("checks", "fails"),
    },
    scope: "Aggregate HTTP metrics may include setup and mail-stub calls. Peak VUs do not alone prove 300 sustained users. Duration is never inferred from count/rate or intended configuration.",
  };
}

export function verifySteadyState(summary, fiveXxMetricName) {
  const result = inspectSteadyState(summary, fiveXxMetricName);
  if (!result.complete) throw new Error("Missing/non-numeric k6 " + result.missing.join(", "));
  return { requests: result.requests, checks: result.checks, pass: result.pass };
}

function main() {
  if (process.argv.length !== 4) throw new Error("Usage: node scripts/scrum295-load-audit.mjs <k6-summary.json> <explicit_5xx_counter_name>");
  const [filename, metricName] = process.argv.slice(2);
  const result = inspectSteadyState(JSON.parse(readFileSync(filename, "utf8")), metricName);
  console.log("k6 requests recorded: " + result.requests);
  for (const check of result.checks) console.log((check.actual === null ? "UNVERIFIED " : check.pass ? "PASS " : "FAIL ") + check.name + " — measured: " + check.actual);
  console.log(result.scope);
  if (!result.complete) { console.error("Missing evidence: " + result.missing.join(", ")); process.exitCode = 2; }
  else if (!result.pass) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) { console.error("SCRUM-295 load audit failed closed: " + error.message); process.exitCode = 2; }
}
