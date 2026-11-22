/**
 * SCRUM-295: independent, read-only coverage measurement audit.
 * Consumes existing JaCoCo XML and Vitest coverage-summary JSON artifacts.
 * This tool checks measurements and frozen floors; it does NOT certify that
 * the owning project's CI gate fails when coverage drops. See README.
 *
 * Usage:
 * node scripts/scrum295-coverage-audit.mjs \
 *   docs/quality/coverage-baseline.json \
 *   backend/target/site/jacoco/jacoco.xml \
 *   frontend/coverage/coverage-summary.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function isNonnegativeInteger(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

function percent(covered, missed) {
  if (!isNonnegativeInteger(covered) || !isNonnegativeInteger(missed)) {
    throw new Error("Coverage counters must be nonnegative safe integers");
  }
  if (covered + missed === 0) {
    throw new Error("Coverage denominator must not be zero");
  }
  return (100 * covered) / (covered + missed);
}

export function jacocoPercent(xml, counterType) {
  if (typeof xml !== "string" || !xml.includes("<report")) {
    throw new Error("Missing JaCoCo report XML");
  }
  if (/<group\b/.test(xml)) {
    throw new Error("Grouped JaCoCo reports need explicit aggregation; refusing ambiguous scope");
  }
  const end = xml.lastIndexOf("</report>");
  if (end < 0) throw new Error("JaCoCo report has no closing </report>");
  const lastPackageEnd = xml.lastIndexOf("</package>");
  const start = lastPackageEnd >= 0 ? lastPackageEnd + "</package>".length : xml.indexOf(">", xml.indexOf("<report")) + 1;
  const reportCounters = xml.slice(start, end).matchAll(/<counter\b([^>]*?)\/>/g);
  const values = [];
  for (const match of reportCounters) {
    const attrs = Object.fromEntries(
      [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]])
    );
    if (attrs.type === counterType) {
      if (!/^(?:0|[1-9]\d*)$/.test(attrs.covered || "") ||
          !/^(?:0|[1-9]\d*)$/.test(attrs.missed || "")) {
        throw new Error("Malformed JaCoCo " + counterType + " counters");
      }
      values.push(percent(Number(attrs.covered), Number(attrs.missed)));
    }
  }
  if (values.length !== 1) {
    throw new Error("Expected exactly one report-level JaCoCo " + counterType + " counter; got " + values.length);
  }
  return values[0];
}

export function vitestPercent(json, metric) {
  const row = json?.total?.[metric];
  if (!row || !isNonnegativeInteger(row.covered) || !isNonnegativeInteger(row.total) ||
      row.total === 0 || row.covered > row.total) {
    throw new Error("Missing or invalid Vitest total." + metric + " coverage counters");
  }
  if (typeof row.pct !== "number" || !Number.isFinite(row.pct)) {
    throw new Error("Vitest total." + metric + ".pct is missing or invalid");
  }
  const actual = percent(row.covered, row.total - row.covered);
  // Vitest percentage is displayed rounded; use exact covered / total for the gate.
  if (Math.abs(row.pct - actual) > 0.51) {
    throw new Error("Vitest pct disagrees with the recorded covered/total counters");
  }
  return actual;
}

export function verifyCoverage(contract, jacocoXml, vitestSummary) {
  if (!contract || typeof contract !== "object") throw new Error("Missing coverage baseline contract");
  const specs = [
    { name: "backend", allowed: ["LINE", "INSTRUCTION", "BRANCH", "METHOD", "CLASS", "COMPLEXITY"] },
    { name: "frontend", allowed: ["lines", "statements", "functions", "branches"] },
  ];
  const actuals = {};
  for (const { name, allowed } of specs) {
    const setting = contract[name];
    if (!setting || !allowed.includes(setting.metric) ||
        !Number.isFinite(setting.baseline) || !Number.isFinite(setting.floor) ||
        setting.baseline < 2 || setting.baseline > 100 || setting.floor < 0 || setting.floor > 100) {
      throw new Error("Missing/invalid " + name + " baseline, floor, or coverage metric");
    }
    if (Math.abs((setting.baseline - 2) - setting.floor) > 0.000001) {
      throw new Error(name + " floor must equal Day 1 baseline minus 2 percentage points");
    }
    actuals[name] = name === "backend"
      ? jacocoPercent(jacocoXml, setting.metric)
      : vitestPercent(vitestSummary, setting.metric);
  }
  const results = specs.map(({ name }) => ({
    name,
    metric: contract[name].metric,
    baseline: contract[name].baseline,
    floor: contract[name].floor,
    measured: actuals[name],
    pass: actuals[name] + 1e-9 >= contract[name].floor,
  }));
  return { results, pass: results.every((r) => r.pass) };
}

function main() {
  if (process.argv.length !== 5) {
    throw new Error("Usage: node scripts/scrum295-coverage-audit.mjs <frozen-baseline.json> <jacoco.xml> <coverage-summary.json>");
  }
  const [contractFile, jacocoFile, vitestFile] = process.argv.slice(2);
  const contract = JSON.parse(readFileSync(contractFile, "utf8"));
  const jacocoXml = readFileSync(jacocoFile, "utf8");
  const summary = JSON.parse(readFileSync(vitestFile, "utf8"));
  const report = verifyCoverage(contract, jacocoXml, summary);
  for (const r of report.results) {
    console.log(
      r.name + " " + r.metric + ": baseline=" + r.baseline.toFixed(2) +
      "% floor=" + r.floor.toFixed(2) + "% measured=" + r.measured.toFixed(2) +
      "% => " + (r.pass ? "PASS" : "FAIL")
    );
  }
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error("SCRUM-295 coverage audit failed closed: " + error.message);
    process.exitCode = 2;
  }
}
