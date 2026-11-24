/** Independent assertions from PR #187's published admin-metrics contract. No HTTP or mutations. */
import assert from "node:assert/strict";

export const METRIC_FIELDS = Object.freeze({
  http5xx: "requests.serverErrors", p95Latency: "requests.p95Millis",
  http429: "requests.tooManyRequests", failedSignIns: "signIns.failed",
  lockouts: "signIns.lockouts", notificationsSent: "notifications.sent",
  notificationsFailed: "notifications.failed",
});
export const COUNTERS = Object.freeze(["requests.total", "requests.serverErrors", "requests.tooManyRequests", "signIns.failed", "signIns.lockouts", "notifications.sent", "notifications.failed"]);
const at = (body, path) => path.split(".").reduce((value, key) => value?.[key], body);
function count(value, name) { assert.ok(Number.isSafeInteger(value) && value >= 0, name + " must be a nonnegative safe integer"); }
function keys(value, expected, name) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), name + " must be an object");
  assert.deepEqual(Object.keys(value).sort(), expected.slice().sort(), name + " has missing or unexpected fields");
}
function rate(actual, numerator, denominator, name) {
  if (denominator === 0) assert.equal(actual, null, name + " must be null without observations");
  else {
    assert.ok(typeof actual === "number" && Number.isFinite(actual) && actual >= 0 && actual <= 1, name + " must be a fraction");
    assert.ok(Math.abs(actual - numerator / denominator) <= 1e-9, name + " disagrees with its counters");
  }
}
export function verifyMetricsSnapshot(body) {
  keys(body, ["since", "resetsOnRestart", "requests", "signIns", "notifications"], "metrics");
  assert.ok(typeof body.since === "string" && /^\d{4}-\d{2}-\d{2}T/.test(body.since) && Number.isFinite(Date.parse(body.since)), "since must be an ISO timestamp");
  assert.equal(body.resetsOnRestart, true, "resetsOnRestart must be true");
  keys(body.requests, ["total", "serverErrors", "errorRate", "tooManyRequests", "p95Millis", "latencySample"], "requests");
  keys(body.signIns, ["failed", "lockouts"], "signIns");
  keys(body.notifications, ["sent", "failed", "successRate"], "notifications");
  for (const path of COUNTERS) count(at(body, path), path);
  count(body.requests.latencySample, "latencySample");
  assert.ok(body.requests.latencySample <= 2000, "latencySample exceeds the documented 2000-request window");
  if (body.requests.latencySample === 0) assert.equal(body.requests.p95Millis, null, "p95Millis must be null without samples");
  else count(body.requests.p95Millis, "p95Millis");
  rate(body.requests.errorRate, body.requests.serverErrors, body.requests.total, "errorRate");
  rate(body.notifications.successRate, body.notifications.sent, body.notifications.sent + body.notifications.failed, "successRate");
  return body;
}

export function verifyMetricDeltas(before, after, expected) {
  verifyMetricsSnapshot(before); verifyMetricsSnapshot(after);
  assert.equal(after.since, before.since, "backend restarted between counter snapshots");
  keys(expected, COUNTERS, "expected counter deltas");
  const actual = {};
  for (const path of COUNTERS) {
    count(expected[path], "expected " + path);
    actual[path] = at(after, path) - at(before, path);
    assert.equal(actual[path], expected[path], path + " delta does not match the scripted run");
  }
  return actual;
}
