/**
 * SCRUM-295: black-box self-tests for the independent metrics access verifier.
 * Uses an in-process loopback HTTP fixture; no real account or production API.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { METRIC_FIELDS } from "./scrum295-metrics-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const verifier = join(here, "scrum295-verify-metrics.mjs");
const metrics = {
  http5xx: 0, p95Latency: 25.5, http429: 1, failedSignIns: 1,
  lockouts: 0, notificationsSent: 2, notificationsFailed: 0,
};
const fields = Object.fromEntries(Object.keys(metrics).map((key) => [key, key]));
const auth = {
  admin: "test_role=admin",
  head: "test_role=head",
  driver: "test_role=driver",
  parent: "test_role=parent",
};

async function fixture(options = {}) {
  const server = createServer((request, response) => {
    const cookie = request.headers.cookie || "";
    const role = cookie.split("; ").find((x) => x.startsWith("test_role="))?.split("=")[1];
    let code = 404;
    let data = null;
    if (request.method === "GET" && request.url === "/actuator/health") {
      code = 200; data = { status: "UP" };
    } else if (request.method === "GET" && request.url === "/actuator/env") {
      code = role ? 404 : 401;
    } else if (request.method === "GET" && (request.url === "/api/admin/test-metrics" || request.url === "/api/admin/metrics")) {
      code = !role ? 401 : role === "admin" ? 200
        : (role === options.unauthorizedAllowedRole ? 200 : 403);
      if (code === 200) data = options.payload ?? (options.omitCounter
        ? Object.fromEntries(Object.entries(metrics).filter(([key]) => key !== options.omitCounter))
        : metrics);
    }
    response.writeHead(code, { "content-type": "application/json" });
    response.end(JSON.stringify(data ?? { status: code }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return { server, origin: "http://127.0.0.1:" + addr.port };
}

async function runVerifier(origin, envExtra = {}) {
  const env = {
    ...process.env,
    SCRUM295_BASE_URL: origin,
    SCRUM295_METRICS_PATH: "/api/admin/test-metrics",
    SCRUM295_ADMIN_COOKIE: auth.admin,
    SCRUM295_HEAD_COOKIE: auth.head,
    SCRUM295_DRIVER_COOKIE: auth.driver,
    SCRUM295_PARENT_COOKIE: auth.parent,
    SCRUM295_FIELDS: JSON.stringify(fields),
    ...envExtra,
  };
  // Node's test runner injects NODE_TEST_CONTEXT; propagating it makes a nested
  // --test subprocess silently skip tests and return 0, masking negative controls.
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--test", verifier], {
    env, stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = [];
  child.stdout.on("data", (x) => chunks.push(x));
  child.stderr.on("data", (x) => chunks.push(x));
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { code, output: Buffer.concat(chunks).toString("utf8") };
}

async function againstFixture(options, check) {
  const { server, origin } = await fixture(options);
  try { return await check(origin); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("passes the healthy endpoint with all role restrictions and metrics", async () => {
  await againstFixture({}, async (origin) => {
    const result = await runVerifier(origin);
    assert.equal(result.code, 0, result.output);
  });
});

test("fails if a non-admin role can access the admin metrics endpoint", async () => {
  await againstFixture({ unauthorizedAllowedRole: "parent" }, async (origin) => {
    const result = await runVerifier(origin);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /admin metrics reject parent/);
  });
});

test("fails if a required metric is absent", async () => {
  await againstFixture({ omitCounter: "http429" }, async (origin) => {
    const result = await runVerifier(origin);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /http429 must be numeric/);
  });
});

test("fails closed on missing admin API path", async () => {
  await againstFixture({}, async (origin) => {
    const result = await runVerifier(origin, { SCRUM295_METRICS_PATH: "/actuator/env" });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /relative \/api\/admin/);
  });
});


const canonical = () => ({
  since: "2026-11-23T06:00:00Z", resetsOnRestart: true,
  requests: { total: 10, serverErrors: 1, errorRate: 0.1, tooManyRequests: 1, p95Millis: 25, latencySample: 10 },
  signIns: { failed: 2, lockouts: 1 }, notifications: { sent: 3, failed: 1, successRate: 0.75 },
});
const canonicalEnv = { SCRUM295_METRICS_PATH: "/api/admin/metrics", SCRUM295_FIELDS: JSON.stringify(METRIC_FIELDS) };

test("canonical endpoint performs all seven smoke checks using the actual nested contract", async () => {
  await againstFixture({ payload: canonical() }, async origin => {
    const result = await runVerifier(origin, canonicalEnv);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /tests 7/);
  });
});
test("canonical cold-start null p95 is not replaced with a fabricated zero", async () => {
  const payload = canonical();
  payload.requests = { total: 0, serverErrors: 0, errorRate: null, tooManyRequests: 0, p95Millis: null, latencySample: 0 };
  payload.signIns = { failed: 0, lockouts: 0 }; payload.notifications = { sent: 0, failed: 0, successRate: null };
  await againstFixture({ payload }, async origin => {
    const result = await runVerifier(origin, canonicalEnv);
    assert.equal(result.code, 0, result.output); assert.match(result.output, /tests 7/);
  });
});
test("canonical endpoint must disclose restart semantics", async () => {
  const payload = canonical(); payload.resetsOnRestart = false;
  await againstFixture({ payload }, async origin => {
    const result = await runVerifier(origin, canonicalEnv);
    assert.notEqual(result.code, 0); assert.match(result.output, /resetsOnRestart/);
  });
});
test("canonical endpoint rejects a fabricated success ratio", async () => {
  const payload = canonical(); payload.notifications.successRate = 1;
  await againstFixture({ payload }, async origin => {
    const result = await runVerifier(origin, canonicalEnv);
    assert.notEqual(result.code, 0); assert.match(result.output, /disagrees with its counters/);
  });
});
