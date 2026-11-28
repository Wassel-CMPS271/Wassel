import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyMetricsSnapshot, verifyMetricDeltas, COUNTERS } from "./scrum295-metrics-contract.mjs";

export const snapshot = () => ({
  since: "2026-11-23T06:00:00Z", resetsOnRestart: true,
  requests: { total: 10, serverErrors: 1, errorRate: 0.1, tooManyRequests: 1, p95Millis: 25, latencySample: 10 },
  signIns: { failed: 2, lockouts: 1 },
  notifications: { sent: 3, failed: 1, successRate: 0.75 },
});

test("published metric shape, millisecond p95 and ratio units are accepted", () => {
  const data = snapshot(); assert.equal(verifyMetricsSnapshot(data), data);
});
test("cold-start null rates and p95 are accepted only with their empty observations", () => {
  const data = snapshot();
  for (const path of COUNTERS) { const [group,key] = path.split("."); data[group][key] = 0; }
  data.requests.errorRate = null; data.requests.p95Millis = null; data.requests.latencySample = 0;
  data.notifications.successRate = null;
  verifyMetricsSnapshot(data);
});
for (const [name, edit] of [
  ["missing reset disclosure", data => delete data.resetsOnRestart],
  ["false reset disclosure", data => data.resetsOnRestart = false],
  ["invalid start timestamp", data => data.since = "not-a-date"],
  ["negative counter", data => data.signIns.failed = -1],
  ["fractional counter", data => data.signIns.failed = 1.5],
  ["numeric string", data => data.signIns.failed = "2"],
  ["infinite counter", data => data.signIns.failed = Infinity],
  ["wrong error ratio", data => data.requests.errorRate = 0.2],
  ["wrong delivery ratio", data => data.notifications.successRate = 0.5],
  ["percentage instead of fraction", data => data.notifications.successRate = 75],
  ["missing p95 with samples", data => data.requests.p95Millis = null],
  ["fractional milliseconds", data => data.requests.p95Millis = 25.5],
  ["oversized rolling window", data => data.requests.latencySample = 2001],
  ["sensitive extra field", data => data.token = "fixture-not-a-real-token"],
]) test("rejects " + name, () => { const data = snapshot(); edit(data); assert.throws(() => verifyMetricsSnapshot(data)); });

test("all scripted deltas must match, not merely stay nonnegative", () => {
  const before = snapshot(); const after = structuredClone(before);
  after.requests.total += 5; after.requests.serverErrors += 1; after.requests.tooManyRequests += 1;
  after.requests.errorRate = 2 / 15; after.requests.latencySample += 5; after.signIns.failed += 2;
  const expected = Object.fromEntries(COUNTERS.map(path => [path, 0]));
  expected["requests.total"] = 5; expected["requests.serverErrors"] = 1;
  expected["requests.tooManyRequests"] = 1; expected["signIns.failed"] = 2;
  assert.deepEqual(verifyMetricDeltas(before, after, expected), expected);
  expected["signIns.failed"] = 1;
  assert.throws(() => verifyMetricDeltas(before, after, expected), /does not match/);
});
test("a restart cannot be passed off as normal counter deltas", () => {
  const before = snapshot(); const after = snapshot(); after.since = "2026-11-23T07:00:00Z";
  assert.throws(() => verifyMetricDeltas(before, after, Object.fromEntries(COUNTERS.map(path => [path, 0]))), /restarted/);
});
test("every expected counter delta is required", () => {
  assert.throws(() => verifyMetricDeltas(snapshot(), snapshot(), {}), /missing or unexpected/);
});
