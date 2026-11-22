// Load test for a normal school at the morning peak (SCRUM-293, S5-G). Runs against the throwaway stack in
// docker-compose.yml, never against the live school. See README.md for how to run it.
//
//   - Before the clock starts, setup() signs the 300 users in (10 at a time) so they are already signed in, as
//     at a real peak, where sessions last an hour; the sign-in load is the burst below, not a stampede at second zero
//   - 260 parents poll their child's bus every ~6 s (about 43 requests a second), a few also read the inbox
//   - 40 drivers each send their position every 10 s (4 requests a second)
//   - 300 users at once, 40-50 requests a second in all, for DURATION (10 minutes)
//   - 100 more parents sign in during one minute, halfway through (the sign-in burst)
//
// Pass: p95 under 1 s for everything except sign-in, and zero 5xx answers. Every sign-in is the real two steps
// (password, then the code the mail stand-in received), so a slow mail provider is part of what is measured.

import http from "k6/http";
import exec from "k6/execution";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://backend:8080";
const STUB = __ENV.MAIL_STUB || "http://mail-stub:9000";
const PASSWORD = "LoadTest-Pass-1";
const DURATION = __ENV.DURATION || "10m";
const PARENT_VUS = Number(__ENV.PARENT_VUS || 260);
const DRIVER_VUS = Number(__ENV.DRIVER_VUS || 40);
const BURST_SIGNINS = Number(__ENV.BURST_SIGNINS || 100);
const BURST_START = __ENV.BURST_START || "5m";

const serverErrors = new Counter("server_errors");
const tooManyRequests = new Counter("too_many_requests");
const signInFailures = new Counter("sign_in_failures");

export const options = {
  scenarios: {
    parents: { executor: "constant-vus", vus: PARENT_VUS, duration: DURATION, exec: "parent" },
    drivers: { executor: "constant-vus", vus: DRIVER_VUS, duration: DURATION, exec: "driver" },
    sign_in_burst: {
      executor: "constant-arrival-rate",
      rate: BURST_SIGNINS,
      timeUnit: "1m",
      duration: "1m",
      startTime: BURST_START,
      preAllocatedVUs: 60,
      maxVUs: 120,
      exec: "burst",
    },
  },
  thresholds: {
    "http_req_duration{phase:steady}": ["p(95)<1000"],
    "http_req_duration{phase:signin}": ["p(95)<3000"],
    server_errors: ["count==0"],
    sign_in_failures: ["count==0"],
  },
  setupTimeout: "10m",
  // k6 empties a VU's cookie jar at the start of every iteration by default; a signed-in user keeps its session.
  noCookiesReset: true,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "max"],
};

let logged = 0; // failed answers this VU has printed (only with DEBUG_FAILURES=1), so the output stays short

const JSON_HEADERS = { "Content-Type": "application/json" };

// Every call to the app goes through here: one place to tag it and to count 5xx and 429 answers.
function app(method, path, body, name, phase) {
  const res = http.request(method, `${BASE}${path}`, body === undefined ? null : JSON.stringify(body), {
    headers: JSON_HEADERS,
    tags: { name, phase },
  });
  if (res.status >= 400 && logged < 3 && __ENV.DEBUG_FAILURES) {
    logged += 1;
    console.log(`${name} answered ${res.status}: ${String(res.body).slice(0, 160)}`);
  }
  if (res.status >= 500) serverErrors.add(1);
  if (res.status === 429) tooManyRequests.add(1);
  return res;
}

// The real two-step sign-in: password, then the six-digit code the mail stand-in received for this address.
function signIn(email) {
  const login = app("POST", "/api/auth/login", { email, password: PASSWORD }, "login", "signin");
  let ok = check(login, { "login answered 204": (r) => r.status === 204 });
  if (ok) {
    const stub = http.get(`${STUB}/code?email=${encodeURIComponent(email)}`, { tags: { name: "stub", phase: "stub" } });
    const code = stub.status === 200 ? stub.json("code") : null;
    const verify = code ? app("POST", "/api/auth/2fa/verify", { code }, "verify", "signin") : null;
    ok = check(verify, { "verify answered 200": (r) => r !== null && r.status === 200 });
  }
  if (!ok) signInFailures.add(1);
  return ok;
}

// Signs in a group of accounts at once (each with its own cookie jar) and returns their session tokens.
function signInMany(emails) {
  const jar = emails.map(() => new http.CookieJar());
  http.batch(
    emails.map((email, i) => ({
      method: "POST",
      url: `${BASE}/api/auth/login`,
      body: JSON.stringify({ email, password: PASSWORD }),
      params: { headers: JSON_HEADERS, jar: jar[i], tags: { name: "setup-login", phase: "setup" } },
    })),
  );
  const codes = http.batch(
    emails.map((email) => ["GET", `${STUB}/code?email=${encodeURIComponent(email)}`, null, { tags: { phase: "setup" } }]),
  );
  const verified = http.batch(
    emails.map((email, i) => ({
      method: "POST",
      url: `${BASE}/api/auth/2fa/verify`,
      body: JSON.stringify({ code: codes[i].status === 200 ? codes[i].json("code") : "" }),
      params: { headers: JSON_HEADERS, jar: jar[i], tags: { name: "setup-verify", phase: "setup" } },
    })),
  );
  return verified.map((r) => (r.status === 200 && r.cookies.wassel_token ? r.cookies.wassel_token[0].value : null));
}

export function setup() {
  const emails = [];
  for (let n = 1; n <= PARENT_VUS; n++) emails.push(`parent${n}@load.test`);
  for (let n = 1; n <= DRIVER_VUS; n++) emails.push(`driver${n}@load.test`);
  const tokens = {};
  for (let i = 0; i < emails.length; i += 10) {
    const group = emails.slice(i, i + 10);
    signInMany(group).forEach((token, k) => {
      if (token) tokens[group[k]] = token;
    });
  }
  console.log(`setup: ${Object.keys(tokens).length} of ${emails.length} accounts signed in`);
  return { tokens };
}

// Uses the session from setup() when there is one; otherwise signs in the slow way.
function start(email, data) {
  const token = data.tokens[email];
  if (token) {
    http.cookieJar().set(BASE, "wassel_token", token);
    return true;
  }
  return signIn(email);
}

let me = null; // this VU's account number, chosen on its first iteration and kept
let signedIn = false;
let child = null;
let run = null;
let tick = 0;

export function parent(data) {
  if (me === null) me = (exec.scenario.iterationInTest % PARENT_VUS) + 1;
  const email = `parent${me}@load.test`;
  if (!signedIn) {
    signedIn = start(email, data);
    if (signedIn) {
      const children = app("GET", "/api/parent/children", undefined, "children", "steady");
      child = children.status === 200 ? children.json()[0] : null;
    } else {
      sleep(65); // a new code is allowed once a minute per account
      return;
    }
  }
  tick += 1;
  if (child) {
    const bus = app("GET", `/api/parent/children/${child.studentId}/bus-location`, undefined, "bus-location", "steady");
    check(bus, { "bus location 200": (r) => r.status === 200 });
  }
  if (tick % 5 === 0) {
    const unread = app("GET", "/api/parent/inbox/unread-count", undefined, "unread-count", "steady");
    check(unread, { "unread count 200": (r) => r.status === 200 });
  }
  if (tick % 20 === 0) {
    app("GET", "/api/parent/inbox", undefined, "inbox", "steady");
    app("GET", "/api/parent/children", undefined, "children", "steady");
  }
  sleep(5.5 + Math.random());
}

export function driver(data) {
  if (me === null) me = (exec.scenario.iterationInTest % DRIVER_VUS) + 1;
  const email = `driver${me}@load.test`;
  if (!signedIn) {
    signedIn = start(email, data);
    if (!signedIn) {
      sleep(65);
      return;
    }
  }
  if (run === null) {
    // Today's runs: on a weekend or a holiday there are none, and the driver only keeps polling its list.
    const today = app("GET", "/api/driver/runs/today", undefined, "driver-today", "steady");
    check(today, { "driver today 200": (r) => r.status === 200 });
    const runs = today.status === 200 ? today.json("runs") || [] : [];
    const morning = runs.find((r) => r.direction === "MORNING") || runs[0];
    if (morning) {
      if (morning.state === "NOT_STARTED") app("POST", `/api/driver/runs/${morning.id}/start`, undefined, "run-start", "steady");
      app("PUT", `/api/driver/runs/${morning.id}/location-sharing`, { enabled: true }, "location-sharing", "steady");
      run = morning;
    } else {
      sleep(10);
      return;
    }
  }
  tick += 1;
  const lat = 33.8938 + Math.sin(tick / 20) * 0.01 + me * 0.0001;
  const lng = 35.5018 + Math.cos(tick / 20) * 0.01;
  const sent = app("PUT", `/api/driver/runs/${run.id}/location`, { latitude: lat, longitude: lng, accuracyMeters: 8 }, "location", "steady");
  check(sent, { "location 204": (r) => r.status === 204 });
  sleep(10);
}

// One parent who has never signed in, once. 100 of them in a minute.
export function burst() {
  const email = `parent${500 + (exec.scenario.iterationInTest % 300) + 1}@load.test`;
  if (signIn(email)) {
    app("GET", "/api/parent/children", undefined, "children", "steady");
  }
}
