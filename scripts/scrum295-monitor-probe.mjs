/**
 * SCRUM-295: non-destructive uptime reachability probe for a DISPOSABLE test stack.
 *
 * This does not stop services, trigger alerts, or assert an external monitor
 * captured downtime. It merely collects independent backend/frontend observations
 * before, during and after a controlled outage performed by an authorized operator.
 *
 * Usage: set SCRUM295_MONITOR_BACKEND_ORIGIN and SCRUM295_MONITOR_FRONTEND_ORIGIN;
 * set SCRUM295_EXPECT_BACKEND / SCRUM295_EXPECT_FRONTEND to "up" or "down".
 * Local origins only unless SCRUM295_ALLOW_REMOTE_TEST=1 for an isolated test host.
 * Run: node scripts/scrum295-monitor-probe.mjs
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const knownLiveHosts = new Set(["wassel-production.up.railway.app"]);

export function validatedOrigin(input, allowRemote = false) {
  let url;
  try { url = new URL(input); }
  catch { throw new Error("Provide a valid HTTP(S) test stack origin"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Test URL must be an HTTP(S) origin without path, credentials, query or fragment");
  }
  if (knownLiveHosts.has(url.hostname)) {
    throw new Error("Refusing known live backend; use an isolated disposable test stack");
  }
  if (!localHosts.has(url.hostname)) {
    if (!allowRemote || url.protocol !== "https:") {
      throw new Error("Remote disposable test stacks require HTTPS and SCRUM295_ALLOW_REMOTE_TEST=1");
    }
  }
  return url.origin;
}

export async function checkTarget(origin, kind, fetchFn = fetch) {
  if (!["backend", "frontend"].includes(kind)) {
    throw new Error("Unknown monitor target kind");
  }
  const address = kind === "backend" ? origin + "/actuator/health" : origin + "/";
  try {
    const response = await fetchFn(address, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000),
      headers: { Accept: kind === "backend" ? "application/json" : "text/html" },
    });
    const status = response.status;
    if (kind === "frontend") {
      return { kind, status, up: status >= 200 && status < 400, reason: "http-status" };
    }
    if (status !== 200) {
      return { kind, status, up: false, reason: "health-not-200" };
    }
    const payload = await response.json();
    return {
      kind,
      status,
      up: payload?.status === "UP" &&
        !Object.hasOwn(payload, "components") && !Object.hasOwn(payload, "details"),
      reason: "minimal-health-payload",
    };
  } catch (error) {
    return {
      kind, status: null, up: false,
      reason: error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "timeout" : "request-or-response-error",
    };
  }
}

export function checkExpectation(observations, expectations) {
  if (observations?.length !== 2) throw new Error("Expected backend and frontend observations");
  return observations.map((observed) => {
    const expected = expectations?.[observed.kind];
    if (!["up", "down"].includes(expected)) {
      throw new Error("Missing explicit up/down expectation for " + observed.kind);
    }
    return {
      ...observed, expected, pass: observed.up === (expected === "up"),
    };
  });
}

async function main() {
  const allowRemote = process.env.SCRUM295_ALLOW_REMOTE_TEST === "1";
  const backend = validatedOrigin(process.env.SCRUM295_MONITOR_BACKEND_ORIGIN, allowRemote);
  const frontend = validatedOrigin(process.env.SCRUM295_MONITOR_FRONTEND_ORIGIN, allowRemote);
  const expectations = {
    backend: process.env.SCRUM295_EXPECT_BACKEND,
    frontend: process.env.SCRUM295_EXPECT_FRONTEND,
  };
  if (!["up", "down"].includes(expectations.backend) ||
      !["up", "down"].includes(expectations.frontend)) {
    throw new Error("Set SCRUM295_EXPECT_BACKEND and SCRUM295_EXPECT_FRONTEND to up or down");
  }
  const before = new Date().toISOString();
  const observations = await Promise.all([
    checkTarget(backend, "backend"), checkTarget(frontend, "frontend"),
  ]);
  const results = checkExpectation(observations, expectations);
  console.log(JSON.stringify({
    recordedAt: before, backend, frontend,
    results, pass: results.every((x) => x.pass),
  }, null, 2));
  if (results.some((x) => !x.pass)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("SCRUM-295 monitor probe failed closed: " + error.message);
    process.exitCode = 2;
  });
}
