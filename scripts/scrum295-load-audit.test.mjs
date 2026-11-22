import assert from "node:assert/strict";
import { test } from "node:test";
import { verifySteadyState } from "./scrum295-load-audit.mjs";

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
