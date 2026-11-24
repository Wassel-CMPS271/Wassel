// Attack tests of the public sign-in endpoints (SCRUM-294, S5-X1). k6 script, started by scripts/attack-test.sh,
// which also counts database rows and mail before and after and times /actuator/health during the attack.
// Never point it at the live school: it only targets the throwaway stack in loadtest/ (BASE_URL is the backend
// container inside that stack's network).
//
//   RUN=flood        ITERATIONS fake emails (default 10,000), each sent to forgot-password and to login
//   RUN=hammer-one   HAMMER_ONE wrong passwords (default 200) on one real account (parent1@load.test)
//   RUN=hammer-many  one wrong password on each of HAMMER_MANY real accounts (default 500, parent2..)
//   RUN=oversized    each oversized field once (emails, passwords, tokens, codes up to BIG_BYTES, default 1 MB)
//
// VUS (default 20) requests run at once, all from one address (the k6 container). The summary printed at the end is
// one JSON line (ATTACK_SUMMARY): per endpoint and status, the count of answers; RUN=oversized also logs one
// "OVERSIZED <status> <case>" line per case.

import http from "k6/http";
import exec from "k6/execution";
import { Counter, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://backend:8080";
const RUN = __ENV.RUN || "flood";
const VUS = Number(__ENV.VUS || 20);
const ITERATIONS = Number(__ENV.ITERATIONS || 10000);
const HAMMER_ONE = Number(__ENV.HAMMER_ONE || 200);
const HAMMER_MANY = Number(__ENV.HAMMER_MANY || 500);
const BIG_BYTES = Number(__ENV.BIG_BYTES || 1024 * 1024);
const RUN_ID = __ENV.RUN_ID || `${Date.now()}`;
const TARGET = __ENV.TARGET_EMAIL || "parent1@load.test";
// A real account the hammer runs never touch, so it is not locked and its oversized password is really checked.
const UNTOUCHED = __ENV.UNTOUCHED_EMAIL || "parent800@load.test";
const JSON_HEADERS = { headers: { "Content-Type": "application/json" }, timeout: "60s" };

const ENDPOINTS = ["login", "forgot", "password", "verify"];
const CODES = ["204", "400", "401", "413", "429", "500", "other"];
const answers = {};
for (const endpoint of ENDPOINTS) {
  for (const code of CODES) answers[`${endpoint}_${code}`] = new Counter(`status_${endpoint}_${code}`);
}
// The smallest request number (1-based, in the order k6 handed them out) that got a 429: where the limit started.
const first429 = new Trend("first_429_at");

const iterationsFor = { flood: ITERATIONS, "hammer-one": HAMMER_ONE, "hammer-many": HAMMER_MANY };

function oversizedCases() {
  const pad = (n) => "a".repeat(n);
  const bigEmail = (n) => `${pad(n - "@attack.invalid".length)}@attack.invalid`;
  return [
    ["login: email 256 chars", "/api/auth/login", { email: bigEmail(256), password: "Wrong-Pass-123" }],
    ["login: email 64 KB", "/api/auth/login", { email: bigEmail(65536), password: "Wrong-Pass-123" }],
    ["login: email 1 MB", "/api/auth/login", { email: bigEmail(BIG_BYTES), password: "Wrong-Pass-123" }],
    ["login: password 73 bytes, real account", "/api/auth/login", { email: UNTOUCHED, password: pad(73) }],
    ["login: password 73 bytes, unknown email", "/api/auth/login", { email: "ghost@attack.invalid", password: pad(73) }],
    ["login: password 64 KB, real account", "/api/auth/login", { email: UNTOUCHED, password: pad(65536) }],
    ["login: password 1 MB, unknown email", "/api/auth/login", { email: "ghost@attack.invalid", password: pad(BIG_BYTES) }],
    ["forgot: email 256 chars", "/api/auth/forgot-password", { email: bigEmail(256) }],
    ["forgot: email 64 KB", "/api/auth/forgot-password", { email: bigEmail(65536) }],
    ["forgot: email 1 MB", "/api/auth/forgot-password", { email: bigEmail(BIG_BYTES) }],
    ["password: token 64 KB", "/api/auth/password", { token: pad(65536), password: "Good-Password-1" }],
    ["password: token 1 MB", "/api/auth/password", { token: pad(BIG_BYTES), password: "Good-Password-1" }],
    ["password: password 73 bytes", "/api/auth/password", { token: "not-a-token", password: pad(73) }],
    ["password: password 1 MB", "/api/auth/password", { token: "not-a-token", password: pad(BIG_BYTES) }],
    ["verify: code 1 MB", "/api/auth/2fa/verify", { code: "1".repeat(BIG_BYTES) }],
  ];
}

export const options = {
  scenarios: {
    attack:
      RUN === "oversized"
        ? { executor: "shared-iterations", vus: 1, iterations: 1, maxDuration: "10m" }
        : { executor: "shared-iterations", vus: Math.min(VUS, iterationsFor[RUN]), iterations: iterationsFor[RUN], maxDuration: "60m" },
  },
  summaryTrendStats: ["min", "max", "avg", "p(95)"],
};

function post(endpoint, path, body, requestNumber) {
  const res = http.post(`${BASE}${path}`, JSON.stringify(body), { ...JSON_HEADERS, tags: { endpoint } });
  const code = String(res.status);
  (answers[`${endpoint}_${code}`] || answers[`${endpoint}_other`]).add(1);
  if (res.status === 429 && requestNumber) first429.add(requestNumber);
  if (__ENV.DEBUG && !["204", "401"].includes(code)) console.log(`${endpoint} ${code} ${res.body?.slice(0, 200)}`);
  return res;
}

export default function () {
  const i = exec.scenario.iterationInTest; // 0-based, unique across all VUs
  if (RUN === "flood") {
    const email = `ghost-${RUN_ID}-${i}@attack.invalid`;
    post("forgot", "/api/auth/forgot-password", { email });
    post("login", "/api/auth/login", { email, password: `Guess-${i}-xyz` });
  } else if (RUN === "hammer-one") {
    post("login", "/api/auth/login", { email: TARGET, password: `Wrong-Guess-${i}` }, i + 1);
  } else if (RUN === "hammer-many") {
    post("login", "/api/auth/login", { email: `parent${i + 2}@load.test`, password: `Wrong-Guess-${i}` }, i + 1);
  } else if (RUN === "oversized") {
    for (const [name, path, body] of oversizedCases()) {
      const endpoint = path.includes("forgot") ? "forgot" : path.includes("verify") ? "verify" : path.endsWith("login") ? "login" : "password";
      const res = post(endpoint, path, body);
      console.log(`OVERSIZED ${res.status} ${name}`);
    }
  } else {
    throw new Error(`Unknown RUN=${RUN}`);
  }
}

export function handleSummary(data) {
  const counts = {};
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (name.startsWith("status_") && metric.values.count > 0) counts[name.slice(7)] = metric.values.count;
  }
  const latency = data.metrics.http_req_duration?.values ?? {};
  const out = {
    run: RUN,
    vus: RUN === "oversized" ? 1 : VUS,
    requests: data.metrics.http_reqs?.values.count ?? 0,
    seconds: Math.round((data.state.testRunDurationMs ?? 0) / 100) / 10,
    statuses: counts,
    first429At: data.metrics.first_429_at ? data.metrics.first_429_at.values.min : null,
    latencyMs: { avg: Math.round(latency.avg), p95: Math.round(latency["p(95)"]), max: Math.round(latency.max) },
  };
  return { stdout: `ATTACK_SUMMARY ${JSON.stringify(out)}\n` };
}
