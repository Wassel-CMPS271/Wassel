#!/usr/bin/env node
// Smoke test of the deployed app (SCRUM-217): run it after every deploy. See "Smoke test after a deploy" in the README.
//
//   SMOKE_PASSWORD=... \
//   SMOKE_ADMIN_EMAIL=... SMOKE_HEAD_EMAIL=... SMOKE_DRIVER_EMAIL=... SMOKE_PARENT_EMAIL=... \
//   node scripts/smoke-test.mjs
//
// Each account signs in for real: password, then the code emailed to it, which the script asks you to type in.
// Only Node 18+ is needed (no npm install). Exit code 0 means every check passed for all four roles; 1 means a check
// failed; 2 means nothing failed but a role was skipped (its email was not set), so the run is not a pass.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const BASE = (process.env.SMOKE_BASE_URL ?? "https://wassel-sooty.vercel.app").replace(/\/$/, "");

const ROLES = [
  { role: "ADMIN", env: "ADMIN", home: "/admin", api: null },
  { role: "HEAD_OF_TRANSPORT", env: "HEAD", home: "/head-of-transport", api: "/api/head-of-transport/routes" },
  { role: "DRIVER", env: "DRIVER", home: "/driver", api: "/api/driver/runs/today" },
  { role: "PARENT", env: "PARENT", home: "/parent", api: "/api/parent/children" },
];

let failures = 0;
let skipped = 0;

function check(ok, what, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
  return ok;
}

function cookie(response, name) {
  return response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`));
}

// Secure, HttpOnly and SameSite=Strict, the SCRUM-217 security criterion for the sign-in cookies.
function checkCookieFlags(header, name) {
  if (!check(Boolean(header), `${name} cookie is set`)) return;
  const flags = header.split(";").map((part) => part.trim().toLowerCase());
  check(flags.includes("secure"), `${name} is Secure`);
  check(flags.includes("httponly"), `${name} is HttpOnly`);
  check(flags.includes("samesite=strict"), `${name} is SameSite=Strict`);
}

const valueOf = (header) => header.split(";")[0];

async function call(path, { method = "GET", body, cookies = [] } = {}) {
  return fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookies.length ? { Cookie: cookies.join("; ") } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function site() {
  console.log(`\nThe site: ${BASE}`);
  const plain = await fetch(BASE.replace(/^https:/, "http:") + "/", { redirect: "manual" });
  const location = plain.headers.get("location") ?? "";
  check(plain.status >= 300 && plain.status < 400 && location.startsWith("https://"),
    "plain http:// redirects to https://", `${plain.status} -> ${location || "no Location"}`);
  check((await call("/login")).status === 200, "the sign-in page loads");
  check((await call("/api/auth/me")).status === 401, "the API answers through the site, 401 when signed out");
}

async function signIn(entry, ask) {
  const email = process.env[`SMOKE_${entry.env}_EMAIL`];
  const password = process.env[`SMOKE_${entry.env}_PASSWORD`] ?? process.env.SMOKE_PASSWORD;
  console.log(`\n${entry.role}: ${email ?? "(no SMOKE_" + entry.env + "_EMAIL)"}`);
  if (!email || !password) {
    console.log("  SKIP  no email or password for this role");
    skipped++;
    return;
  }

  const login = await call("/api/auth/login", { method: "POST", body: { email, password } });
  if (!check(login.status === 204, "password accepted, code emailed", `HTTP ${login.status}`)) return;
  const pending = cookie(login, "wassel_2fa");
  checkCookieFlags(pending, "wassel_2fa");
  if (!pending) return;

  const code = (await ask(`  Code emailed to ${email}: `)).trim();
  const verify = await call("/api/auth/2fa/verify", { method: "POST", body: { code }, cookies: [valueOf(pending)] });
  if (!check(verify.status === 200, "code accepted, signed in", `HTTP ${verify.status}`)) return;
  const user = await verify.json();
  check(user.role === entry.role, "signed in with the expected role", user.role);
  const session = cookie(verify, "wassel_token");
  checkCookieFlags(session, "wassel_token");
  if (!session) return;
  const cookies = [valueOf(session)];

  const me = await call("/api/auth/me", { cookies });
  check(me.status === 200 && (await me.json()).role === entry.role, "the session works (/api/auth/me)");
  check((await call(entry.home, { cookies })).status === 200, `its own area loads (${entry.home})`);
  if (entry.api) {
    const own = await call(entry.api, { cookies });
    let detail = `HTTP ${own.status}`;
    if (own.status === 200 && entry.role === "HEAD_OF_TRANSPORT") {
      const routes = await own.json();
      detail = `${routes.length} route(s)${routes.length ? `, first: "${routes[0].name}"` : ""}`;
      check(Array.isArray(routes), "the routes screen's data loads from the real backend", detail);
      if (Array.isArray(routes) && routes.length === 0) {
        console.log("  WARN  the school has no routes yet, so the list is empty; create one to see real data");
      }
    } else {
      check(own.status === 200, `its own data loads (${entry.api})`, detail);
    }
  }
  // Another role's data is refused: the backend, not only the screen, keeps the areas apart.
  const foreign = entry.role === "HEAD_OF_TRANSPORT" ? "/api/parent/children" : "/api/head-of-transport/routes";
  check((await call(foreign, { cookies })).status === 403, `another role's data is refused (${foreign})`);

  const logout = await call("/api/auth/logout", { method: "POST", cookies });
  const cleared = cookie(logout, "wassel_token") ?? "";
  check(logout.ok && /max-age=0/i.test(cleared), "signing out clears the session cookie", `HTTP ${logout.status}`);
}

const readline = createInterface({ input: stdin, output: stdout });
try {
  await site();
  for (const entry of ROLES) {
    await signIn(entry, (question) => readline.question(question));
  }
} finally {
  readline.close();
}

console.log(`\n${failures} failed, ${skipped} skipped.`);
process.exit(failures ? 1 : skipped ? 2 : 0);
