/**
 * SCRUM-295: independent, READ-ONLY verification of the Sprint 5 admin metrics endpoint.
 *
 * Run only against an isolated local/test deployment, not a real school's live system.
 * Requires configured endpoints, real authenticated cookies for all four roles, and the
 * author's actual metric JSON field paths. Never store cookies in this repository.
 *
 * See docs/testing/SCRUM-295/README.md for all required environment variables.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const needed = [
  "SCRUM295_BASE_URL",
  "SCRUM295_METRICS_PATH",
  "SCRUM295_ADMIN_COOKIE",
  "SCRUM295_HEAD_COOKIE",
  "SCRUM295_DRIVER_COOKIE",
  "SCRUM295_PARENT_COOKIE",
  "SCRUM295_FIELDS",
];
const missing = needed.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  throw new Error("SCRUM-295 configuration missing: " + missing.join(", "));
}

const base = new URL(process.env.SCRUM295_BASE_URL);
if (!["http:", "https:"].includes(base.protocol)) {
  throw new Error("SCRUM295_BASE_URL must be HTTP(S)");
}
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!localHosts.has(base.hostname) && process.env.SCRUM295_ALLOW_REMOTE_READONLY !== "1") {
  throw new Error("Remote targets require SCRUM295_ALLOW_REMOTE_READONLY=1; never target a real school.");
}
if (base.username || base.password || base.search || base.hash || base.pathname !== "/") {
  throw new Error("SCRUM295_BASE_URL must be an origin with no credentials, path, query, or hash");
}
const metricsPath = process.env.SCRUM295_METRICS_PATH;
if (!/^\/api\/admin\/[a-z0-9/_-]+$/i.test(metricsPath)) {
  throw new Error("SCRUM295_METRICS_PATH must be a relative /api/admin/... route");
}

const cookies = {
  admin: process.env.SCRUM295_ADMIN_COOKIE,
  head: process.env.SCRUM295_HEAD_COOKIE,
  driver: process.env.SCRUM295_DRIVER_COOKIE,
  parent: process.env.SCRUM295_PARENT_COOKIE,
};

let paths;
try {
  paths = JSON.parse(process.env.SCRUM295_FIELDS);
} catch {
  throw new Error("SCRUM295_FIELDS must be JSON mapping metric names to JSON field paths");
}
const required = [
  "http5xx", "p95Latency", "http429", "failedSignIns",
  "lockouts", "notificationsSent", "notificationsFailed",
];
for (const metric of required) {
  if (typeof paths?.[metric] !== "string" || !/^[\w-]+(?:\.[\w-]+)*$/.test(paths[metric])) {
    throw new Error("SCRUM295_FIELDS missing a valid dot-separated field path for: " + metric);
  }
}

function fieldAt(body, path) {
  return path.split(".").reduce((value, key) => value?.[key], body);
}

async function request(path, cookie) {
  const response = await fetch(new URL(path, base), {
    method: "GET",
    headers: cookie ? { Cookie: cookie, Accept: "application/json" } : { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
  });
  return response;
}

test("health remains public and contains no component details", async () => {
  const res = await request("/actuator/health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "UP");
  assert.equal(Object.hasOwn(body, "components"), false);
  assert.equal(Object.hasOwn(body, "details"), false);
});

test("non-health actuator endpoints remain private", async () => {
  assert.equal((await request("/actuator/env")).status, 401);
  assert.equal((await request("/actuator/env", cookies.admin)).status, 404);
});

test("admin metrics require a valid session", async () => {
  assert.equal((await request(metricsPath)).status, 401);
});

for (const role of ["head", "driver", "parent"]) {
  test("admin metrics reject " + role + " with 403", async () => {
    assert.equal((await request(metricsPath, cookies[role])).status, 403);
  });
}

test("admin receives all seven required finite, nonnegative metric values", async () => {
  const res = await request(metricsPath, cookies.admin);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /application\/json/i);
  const body = await res.json();
  for (const metric of required) {
    const value = fieldAt(body, paths[metric]);
    assert.equal(typeof value, "number", metric + " must be numeric at " + paths[metric]);
    assert.ok(Number.isFinite(value) && value >= 0, metric + " must be finite and nonnegative");
  }
});
