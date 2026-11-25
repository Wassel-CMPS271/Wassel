// Attack tests of the public sign-in endpoints (SCRUM-294, S5-X1). k6 script, started by scripts/attack-test.sh,
// which also counts database rows and mail before and after and times /actuator/health during the attack.
// Never point it at the live school: it only targets the throwaway stack in loadtest/ (BASE_URL is the backend
// container inside that stack's network).
//
//   RUN=flood        ITERATIONS fake emails (default 10,000), each sent to forgot-password and to login
//   RUN=hammer-one   HAMMER_ONE wrong passwords (default 200) on one real account (parent1@load.test)
//   RUN=hammer-many  one wrong password on each of HAMMER_MANY real accounts (default 500, parent2..)
//   RUN=oversized    each oversized field once (emails, passwords, tokens, codes up to BIG_BYTES, default 1 MB)
//   RUN=mailcap      mail to REAL accounts, one request at a time, reading the mail stand-in's count after each step:
//                    a control (one reset link, one sign-in code: the count must move by exactly 1 each), then the 60 s
//                    cooldowns (forgot-password, login, resend on the same account: the count must not move), then
//                    reset links for MAILCAP_ACCOUNTS accounts (default 40, parent702..), paced under the per-address
//                    limit, against SCRUM-289's reset share. One "MAILSTEP <step> mail=<n> <status>=<count>..." line
//                    per step.
//   RUN=endpoints    each of the six limited endpoints, one request at a time, its limit + PROBE_EXTRA (default 5)
//                    times. One "ENDPOINT <name> limit=<n> pass=<n> limited=<n> first429=<n> noretry=<n>" line each.
//   RUN=xff          XFF_REQUESTS logins (default 60) with a different X-Forwarded-For, X-Real-IP and Forwarded
//                    address on each: the limit must still count them as one address.
//
// VUS (default 20) requests run at once in flood and hammer, all from one address (the k6 container); the other runs
// send one at a time. The limits (LIMIT_LOGIN and the rest) are passed in by attack-test.sh, read off the backend.
// The summary printed at the end is one JSON line (ATTACK_SUMMARY): per endpoint and status, the count of answers.
// Statuses are bucketed as 204, 400, 401, 413, 429, 5xx (any 500 to 599), 0 (no answer: timeout or refused
// connection) and other; a 429 without Retry-After is also counted as <endpoint>_429noretry.

import http from "k6/http";
import exec from "k6/execution";
import { sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://backend:8080";
const MAIL_STUB = __ENV.MAIL_STUB || "http://mail-stub:9000";
const RUN = __ENV.RUN || "flood";
const VUS = Number(__ENV.VUS || 20);
const ITERATIONS = Number(__ENV.ITERATIONS || 10000);
const HAMMER_ONE = Number(__ENV.HAMMER_ONE || 200);
const HAMMER_MANY = Number(__ENV.HAMMER_MANY || 500);
const BIG_BYTES = Number(__ENV.BIG_BYTES || 1024 * 1024);
const RUN_ID = __ENV.RUN_ID || `${Date.now()}`;
const PASSWORD = __ENV.SEED_PASSWORD || "LoadTest-Pass-1"; // loadtest/seed.sql's throwaway password
const TARGET = __ENV.TARGET_EMAIL || "parent1@load.test";
// A real account the hammer runs never touch, so it is not locked and its oversized password is really checked.
const UNTOUCHED = __ENV.UNTOUCHED_EMAIL || "parent800@load.test";
const MAILCAP_ACCOUNTS = Number(__ENV.MAILCAP_ACCOUNTS || 40);
const PROBE_EXTRA = Number(__ENV.PROBE_EXTRA || 5);
const XFF_REQUESTS = Number(__ENV.XFF_REQUESTS || 60);
const LIMITED = __ENV.LIMITED === "true"; // is the backend's rate limit on
const WINDOW_S = Number(__ENV.WINDOW_S || 60);
const LIMITS = {
  login: Number(__ENV.LIMIT_LOGIN || 30),
  verify: Number(__ENV.LIMIT_VERIFY || 60),
  resend: Number(__ENV.LIMIT_RESEND || 20),
  logout: Number(__ENV.LIMIT_LOGOUT || 60),
  forgot: Number(__ENV.LIMIT_FORGOT || 10),
  password: Number(__ENV.LIMIT_PASSWORD || 30),
};
const JSON_HEADERS = { "Content-Type": "application/json" };

const ENDPOINTS = ["login", "forgot", "password", "verify", "resend", "logout"];
const PATHS = {
  login: "/api/auth/login",
  forgot: "/api/auth/forgot-password",
  password: "/api/auth/password",
  verify: "/api/auth/2fa/verify",
  resend: "/api/auth/2fa/resend",
  logout: "/api/auth/logout",
};
const BUCKETS = ["204", "400", "401", "413", "429", "429noretry", "5xx", "0", "other"];
const answers = {};
for (const endpoint of ENDPOINTS) {
  for (const bucket of BUCKETS) answers[`${endpoint}_${bucket}`] = new Counter(`status_${endpoint}_${bucket}`);
}
// The smallest request number (1-based, in the order k6 handed them out) that got a 429: where the limit started.
// With VUS > 1 requests overlap, so this is approximate; the exact threshold is checked in RUN=endpoints.
const first429 = new Trend("first_429_at");

const iterationsFor = { flood: ITERATIONS, "hammer-one": HAMMER_ONE, "hammer-many": HAMMER_MANY };

function bucketOf(status) {
  if (status === 0) return "0";
  if (status >= 500 && status <= 599) return "5xx";
  return ["204", "400", "401", "413", "429"].includes(String(status)) ? String(status) : "other";
}

function post(endpoint, body, { requestNumber, headers = {} } = {}) {
  const res = http.post(`${BASE}${PATHS[endpoint]}`, body === null ? null : JSON.stringify(body), {
    headers: { ...JSON_HEADERS, ...headers },
    timeout: "60s",
    tags: { endpoint },
  });
  const bucket = bucketOf(res.status);
  answers[`${endpoint}_${bucket}`].add(1);
  if (res.status === 429) {
    if (!res.headers["Retry-After"]) answers[`${endpoint}_429noretry`].add(1);
    if (requestNumber) first429.add(requestNumber);
  }
  if (__ENV.DEBUG && !["204", "401"].includes(bucket)) console.log(`${endpoint} ${res.status} ${res.body?.slice(0, 200)}`);
  return res;
}

function oversizedCases() {
  const pad = (n) => "a".repeat(n);
  const bigEmail = (n) => `${pad(n - "@attack.invalid".length)}@attack.invalid`;
  return [
    ["login: email 256 chars", "login", { email: bigEmail(256), password: "Wrong-Pass-123" }],
    ["login: email 64 KB", "login", { email: bigEmail(65536), password: "Wrong-Pass-123" }],
    ["login: email 1 MB", "login", { email: bigEmail(BIG_BYTES), password: "Wrong-Pass-123" }],
    ["login: password 73 bytes, real account", "login", { email: UNTOUCHED, password: pad(73) }],
    ["login: password 73 bytes, unknown email", "login", { email: "ghost@attack.invalid", password: pad(73) }],
    ["login: password 64 KB, real account", "login", { email: UNTOUCHED, password: pad(65536) }],
    ["login: password 1 MB, unknown email", "login", { email: "ghost@attack.invalid", password: pad(BIG_BYTES) }],
    ["forgot: email 256 chars", "forgot", { email: bigEmail(256) }],
    ["forgot: email 64 KB", "forgot", { email: bigEmail(65536) }],
    ["forgot: email 1 MB", "forgot", { email: bigEmail(BIG_BYTES) }],
    ["password: token 64 KB", "password", { token: pad(65536), password: "Good-Password-1" }],
    ["password: token 1 MB", "password", { token: pad(BIG_BYTES), password: "Good-Password-1" }],
    ["password: password 73 bytes", "password", { token: "not-a-token", password: pad(73) }],
    ["password: password 1 MB", "password", { token: "not-a-token", password: pad(BIG_BYTES) }],
    ["verify: code 1 MB", "verify", { code: "1".repeat(BIG_BYTES) }],
  ];
}

function mailSent() {
  const res = http.get(`${MAIL_STUB}/stats`, { timeout: "10s" });
  const sent = res.status === 200 ? res.json("sent") : null;
  if (typeof sent !== "number") throw new Error(`mail stand-in /stats answered ${res.status}: ${res.body}`);
  return sent;
}

// Runs one mailcap step: fn() sends its requests and returns their statuses; logs the step's mail delta and statuses.
function mailStep(name, fn) {
  const before = mailSent();
  const statuses = fn();
  const after = mailSent();
  const counts = {};
  for (const s of statuses) counts[s] = (counts[s] || 0) + 1;
  const parts = Object.entries(counts).map(([s, n]) => `${s}=${n}`).join(" ");
  console.log(`MAILSTEP ${name} mail=${after - before} n=${statuses.length} ${parts}`);
}

function runMailcap() {
  const resetAccount = "parent700@load.test";
  const loginAccount = "parent701@load.test";
  mailStep("control-reset", () => [post("forgot", { email: resetAccount }).status]);
  // Same account, inside its 60 s cooldown: 204 every time, nothing sent. 1 + 9 stays inside the forgot-password limit.
  mailStep("reset-cooldown", () => Array.from({ length: 9 }, () => post("forgot", { email: resetAccount }).status));
  let pending = null;
  mailStep("control-login", () => {
    const res = post("login", { email: loginAccount, password: PASSWORD });
    pending = res.cookies.wassel_2fa ? res.cookies.wassel_2fa[0].value : null;
    return [res.status];
  });
  // The right password again inside the code's 60 s cooldown: 429, nothing sent (21 logins, inside the login limit).
  mailStep("login-cooldown", () =>
    Array.from({ length: 20 }, () => post("login", { email: loginAccount, password: PASSWORD }).status),
  );
  // Resend with the pending cookie from the control: inside the cooldown, so 429 and nothing sent.
  mailStep("resend-cooldown", () => {
    if (!pending) return ["no-pending-cookie"];
    return Array.from({ length: 15 }, () => post("resend", null, { headers: { Cookie: `wassel_2fa=${pending}` } }).status);
  });
  // Reset links for many real accounts, against the reset share (SCRUM-289). Paced in batches of the forgot-password
  // limit, one window apart, so the per-address limit (SCRUM-288) never answers and only the cap can stop the mail.
  mailStep("reset-share", () => {
    const statuses = [];
    for (let i = 0; i < MAILCAP_ACCOUNTS; i++) {
      if (LIMITED && i % LIMITS.forgot === 0) sleep(WINDOW_S + 2);
      statuses.push(post("forgot", { email: `parent${702 + i}@load.test` }).status);
    }
    return statuses;
  });
}

// One request to each limited endpoint, as an anonymous caller would send it (nothing is stored by any of them).
function probeBody(endpoint, i) {
  switch (endpoint) {
    case "login":
      return { email: `probe-${RUN_ID}-${i}@attack.invalid`, password: "Wrong-Pass-123" };
    case "forgot":
      return { email: `probe-${RUN_ID}-${i}@attack.invalid` };
    case "password":
      return { token: "not-a-token", password: "Good-Password-1" };
    case "verify":
      return { code: "123456" };
    default:
      return null; // resend and logout take no body
  }
}

function runEndpoints() {
  for (const endpoint of ENDPOINTS) {
    const limit = LIMITS[endpoint];
    let pass = 0;
    let limited = 0;
    let noretry = 0;
    let firstAt = 0;
    for (let i = 1; i <= limit + PROBE_EXTRA; i++) {
      const res = post(endpoint, probeBody(endpoint, i));
      if (res.status === 429) {
        limited++;
        if (!res.headers["Retry-After"]) noretry++;
        if (!firstAt) firstAt = i;
      } else {
        pass++;
      }
    }
    console.log(`ENDPOINT ${endpoint} limit=${limit} pass=${pass} limited=${limited} first429=${firstAt} noretry=${noretry}`);
  }
}

function runXff() {
  for (let i = 1; i <= XFF_REQUESTS; i++) {
    const fake = `203.0.${Math.floor(i / 250)}.${(i % 250) + 1}`;
    post(
      "login",
      { email: `xff-${RUN_ID}-${i}@attack.invalid`, password: "Wrong-Pass-123" },
      { requestNumber: i, headers: { "X-Forwarded-For": fake, "X-Real-IP": fake, Forwarded: `for=${fake}` } },
    );
  }
}

const serial = { executor: "shared-iterations", vus: 1, iterations: 1, maxDuration: "30m" };
export const options = {
  scenarios: {
    attack: iterationsFor[RUN]
      ? { executor: "shared-iterations", vus: Math.min(VUS, iterationsFor[RUN]), iterations: iterationsFor[RUN], maxDuration: "60m" }
      : serial,
  },
  summaryTrendStats: ["min", "max", "avg", "p(95)"],
};

export default function () {
  const i = exec.scenario.iterationInTest; // 0-based, unique across all VUs
  if (RUN === "flood") {
    const email = `ghost-${RUN_ID}-${i}@attack.invalid`;
    post("forgot", { email });
    post("login", { email, password: `Guess-${i}-xyz` });
  } else if (RUN === "hammer-one") {
    post("login", { email: TARGET, password: `Wrong-Guess-${i}` }, { requestNumber: i + 1 });
  } else if (RUN === "hammer-many") {
    post("login", { email: `parent${i + 2}@load.test`, password: `Wrong-Guess-${i}` }, { requestNumber: i + 1 });
  } else if (RUN === "oversized") {
    for (const [name, endpoint, body] of oversizedCases()) {
      const res = post(endpoint, body);
      console.log(`OVERSIZED ${res.status} ${name}`);
    }
  } else if (RUN === "mailcap") {
    runMailcap();
  } else if (RUN === "endpoints") {
    runEndpoints();
  } else if (RUN === "xff") {
    runXff();
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
    vus: iterationsFor[RUN] ? VUS : 1,
    limited: LIMITED,
    requests: data.metrics.http_reqs?.values.count ?? 0,
    seconds: Math.round((data.state.testRunDurationMs ?? 0) / 100) / 10,
    statuses: counts,
    first429At: data.metrics.first_429_at ? data.metrics.first_429_at.values.min : null,
    latencyMs: { avg: Math.round(latency.avg), p95: Math.round(latency["p(95)"]), max: Math.round(latency.max) },
  };
  return { stdout: `ATTACK_SUMMARY ${JSON.stringify(out)}\n` };
}
