import assert from "node:assert/strict";
import { test } from "node:test";
import { verifySteadyState, inspectSteadyState } from "./scrum295-load-audit.mjs";

const summary = () => ({
  metrics: {
    http_req_duration: { values: { "p(95)": 850 } },
    http_reqs: { values: { rate: 45, count: 27000 } },
    custom_http_5xx_errors: { values: { count: 0, rate: 0 } },
    vus: { values: { max: 300 } },
  },
  state: { testRunDurationMs: 600000 },
});

function modified(edit) {
  const s = summary();
  edit(s);
  return verifySteadyState(s, "custom_http_5xx_errors");
}

test("clean ten-minute 45 RPS summary meets the measurable gates", () => {
  const result = verifySteadyState(summary(), "custom_http_5xx_errors");
  assert.equal(result.pass, true);
  assert.equal(result.checks.length, 5);
});

test("p95 of exactly one second is not under the limit", () => {
  const result = modified((s) => s.metrics.http_req_duration.values["p(95)"] = 1000);
  assert.equal(result.pass, false);
  assert.equal(result.checks[0].pass, false);
});

test("one server error is a failure even if the 4xx rate is acceptable", () => {
  const result = modified((s) => s.metrics.custom_http_5xx_errors.values.count = 1);
  assert.equal(result.pass, false);
  assert.equal(result.checks[1].pass, false);
});

test("slow achieved request rate fails", () => {
  assert.equal(modified((s) => s.metrics.http_reqs.values.rate = 39.9).pass, false);
});

test("excessive achieved request rate is outside the planned window", () => {
  assert.equal(modified((s) => s.metrics.http_reqs.values.rate = 50.1).pass, false);
});

test("fewer than 300 active VUs fails", () => {
  assert.equal(modified((s) => s.metrics.vus.values.max = 299).pass, false);
});

test("shorter than ten minutes fails", () => {
  assert.equal(modified((s) => s.state.testRunDurationMs = 599999).pass, false);
});

test("missing 5xx counter must not be silently read as zero", () => {
  assert.throws(() => verifySteadyState(summary(), "another_counter"), /Missing\/non-numeric/);
});

test("missing peak virtual users must not be silently accepted", () => {
  const s = summary();
  delete s.metrics.vus;
  assert.throws(() => verifySteadyState(s, "custom_http_5xx_errors"), /Missing\/non-numeric/);
});

test("a malformed or negative metric must fail closed", () => {
  const s = summary();
  s.metrics.http_req_duration.values["p(95)"] = -1;
  assert.throws(() => verifySteadyState(s, "custom_http_5xx_errors"), /Missing\/non-numeric/);
});


function nativeSummary() {
  const source = summary();
  return { metrics: Object.fromEntries(Object.entries(source.metrics).map(([name, row]) => [name, row.values])), state: source.state };
}

test("native k6 metrics with an actual duration meet the same strict gates", () => {
  assert.equal(verifySteadyState(nativeSummary(), "custom_http_5xx_errors").pass, true);
});

test("native export missing duration remains incomplete despite plausible count and rate", () => {
  const source = nativeSummary();
  delete source.state;
  const before = JSON.stringify(source);
  const result = inspectSteadyState(source, "custom_http_5xx_errors");
  assert.equal(result.complete, false);
  assert.equal(result.pass, false);
  assert.equal(result.checks[4].actual, null);
  assert.deepEqual(result.missing, ["actual duration"]);
  assert.throws(() => verifySteadyState(source, "custom_http_5xx_errors"), /Missing\/non-numeric/);
  assert.equal(JSON.stringify(source), before);
});

test("recorded run-3-shaped measurements retain excessive RPS and missing duration failures", () => {
  const source = nativeSummary();
  delete source.state;
  source.metrics.http_reqs = { count: 37240, rate: 54.85227258632939 };
  source.metrics.vus.max = 302;
  const result = inspectSteadyState(source, "custom_http_5xx_errors");
  assert.equal(result.requests, 37240);
  assert.equal(result.checks[1].pass, true);
  assert.equal(result.checks[2].pass, false);
  assert.equal(result.checks[4].pass, false);
  assert.equal(result.pass, false);
});

test("reserved maximum VUs cannot stand in for observed active VUs", () => {
  const source = nativeSummary();
  source.metrics.vus_max = { max: 360 };
  delete source.metrics.vus;
  assert.throws(() => verifySteadyState(source, "custom_http_5xx_errors"), /Missing\/non-numeric/);
});

test("ambiguous mixed metric formats are rejected", () => {
  const source = summary();
  source.metrics.http_reqs.rate = 45;
  assert.throws(() => verifySteadyState(source, "custom_http_5xx_errors"), /Ambiguous/);
});

test("duration is not coerced from a numeric string", () => {
  const source = nativeSummary();
  source.state.testRunDurationMs = "600000";
  assert.throws(() => verifySteadyState(source, "custom_http_5xx_errors"), /Missing\/non-numeric/);
});


test("mixed sign-in/setup traffic cannot be passed as measured steady backend throughput", () => {
  const source = summary(); source.metrics["http_req_duration{phase:signin}"] = { values: { "p(95)": 850 } };
  const result = inspectSteadyState(source, "custom_http_5xx_errors");
  assert.equal(result.complete,false); assert.equal(result.pass,false);
  assert.ok(result.missing.includes("backend-only steady request rate"));
});
test("measured backend-only count and steady elapsed time replace a misleading aggregate rate", () => {
  const source = summary();
  source.metrics.http_reqs.values.rate = 45;
  source.independentMeasured = { steadyBackendRequests: 36000, steadyElapsedMs: 600000, parentActors: 260, driverActors: 40, completedBurst: 100 };
  const result = inspectSteadyState(source, "custom_http_5xx_errors");
  assert.equal(result.checks[2].actual,60); assert.equal(result.checks[2].pass,false); assert.equal(result.pass,false);
});
test("a long setup cannot disguise a short actual steady phase", () => {
  const source = summary(); source.state.testRunDurationMs = 900000;
  source.independentMeasured = { steadyBackendRequests: 13499, steadyElapsedMs: 300000 };
  const result = inspectSteadyState(source, "custom_http_5xx_errors");
  assert.equal(result.checks[4].actual,300);assert.equal(result.checks[4].pass,false);assert.equal(result.pass,false);
});
