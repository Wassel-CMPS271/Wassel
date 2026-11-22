# SCRUM-295 — independent Sprint 5 verification

Owner: Wassim. Scope: **verification only**; do not implement SCRUM-290–293 in this branch.
Status: **PREPARED, NOT EXECUTED**. All result fields below remain unverified until the
respective implementation, isolated test stack, and evidence are available.

## Baseline already present on develop (22 Nov 2026)

- GET /actuator/health is public and exposes only \`status\` (see \`HealthEndpointTests\`).
- All other actuator endpoints are blocked; an authenticated admin receives 404
  for nonexposed paths such as /actuator/env.
- \`RoleAccessMatrixTests\` enumerates every application endpoint. SCRUM-290 must
  update that matrix in its own PR when adding the admin-only read endpoint.
- JaCoCo and Vitest coverage reports already exist. Current \`ci.yml\` uploads the
  backend report, but JaCoCo does not enforce a floor; frontend Vitest coverage
  also has no floor. SCRUM-292 owns those changes.
- No merged SCRUM-290–293 implementation was verified at the time of preparation.
  Do not substitute preexisting notification-delivery summary for the new metrics endpoint.

## Verification matrix

| ID | Ticket | Independent procedure | Pass condition | Evidence/status |
| --- | --- | --- | --- | --- |
| X2-01 | SCRUM-290 | On an isolated stack, read admin metrics without a cookie, then with HEAD_OF_TRANSPORT, DRIVER, PARENT and ADMIN cookies | 401 signed out; 403 non-admin; 200 admin; no sensitive user data | NOT RUN |
| X2-02 | SCRUM-290 | With scripted controlled 5xx, 429, failed sign-ins/lockouts and notification success/failures, compare counter deltas to generated events; check p95 units and timing distribution | Seven required measurements match the controlled run; no hidden logging of secrets; reset-on-redeploy limitation documented | NOT RUN |
| X2-03 | SCRUM-290 | Read GET /actuator/health and attempt other actuator paths as signed-out and admin callers | Public minimal health; all other actuator endpoints inaccessible | Existing unit tests reviewed; rerun on candidate |
| X2-04 | SCRUM-291 | Review monitor settings and README link; stop ONLY the disposable test stack, then restore it; observe front and backend monitors | Outage produces team alert; downtime recorded, including planned deploys; interval and evidence stated | NOT RUN |
| X2-05 | SCRUM-292 | Record fixed Day 1 backend JaCoCo and frontend Vitest percentages and check CI summaries/documentation | Both numeric coverages published and daily readings in docs/quality | NOT RUN |
| X2-06 | SCRUM-292 | In a temporary candidate branch, deliberately reduce measured coverage below the configured floor and rerun required CI | Backend and frontend independently fail below baseline minus 2 percentage points; no baseline/floor lowered to pass | NOT RUN |
| X2-07 | SCRUM-293 | Re-run k6 on disposable 1000-student, 40-bus, 800-parent seeded scenario; 40–50 requests/s for 10 min, 300 concurrent users, sign-in burst after SCRUM-289 | p95 < 1000 ms and zero HTTP 5xx; per endpoint error counts recorded | NOT RUN |
| X2-08 | SCRUM-293 | Verify slow fake Brevo service, stub road-router, CPU/RAM limits and cleanup | No live emails or paid routing quota; host limits and deviations from production documented | NOT RUN |

## Read-only metric access smoke test

\`scripts/scrum295-verify-metrics.mjs\` uses built-in Node 24 test/fetch functionality,
does **not** change database state, and is **not** wired into required CI. Run it
after SCRUM-290 defines and deploys its actual admin metrics read endpoint to a test stack.

Set these variables in the terminal/process environment (never commit or paste
real session cookies to a PR or ticket):

- \`SCRUM295_BASE_URL\`: origin of isolated test backend, e.g. \`http://localhost:8080\`
- \`SCRUM295_METRICS_PATH\`: the **actual** new admin endpoint path from SCRUM-290,
  e.g. \`/api/admin/<actual-route>\` — do not guess.
- \`SCRUM295_ADMIN_COOKIE\`, \`SCRUM295_HEAD_COOKIE\`,
  \`SCRUM295_DRIVER_COOKIE\`, \`SCRUM295_PARENT_COOKIE\`: valid **full Cookie header**
  values obtained in isolated test accounts after real 2FA login.
- \`SCRUM295_FIELDS\`: JSON object mapping each required logical measurement to its
  actual dot-separated field path in the JSON response. Required keys:
  \`http5xx\`, \`p95Latency\`, \`http429\`, \`failedSignIns\`, \`lockouts\`,
  \`notificationsSent\`, \`notificationsFailed\`.
- \`SCRUM295_ALLOW_REMOTE_READONLY=1\` **only** if the remote origin is a
  disposable test stack; local loopback needs no override.

Then run \`node --test scripts/scrum295-verify-metrics.mjs\` from the repo root.

The script fails closed on missing config and requires every metric to be present,
finite and nonnegative. A green smoke test alone **does not** prove counters are
accurate: controlled deltas, p95 distribution and redeploy resets require X2-02.

## Evidence record — fill after each real run

| Field | Observed value |
| --- | --- |
| Date/time and timezone | Pending |
| Head SHA of implementation / test branch | Pending |
| Disposable environment, topology, CPU/RAM limits | Pending |
| Monitor provider, probe interval, link, notification evidence | Pending |
| Backend coverage baseline / floor / measured | Pending |
| Frontend coverage baseline / floor / measured | Pending |
| k6 scenario version, duration, virtual users, achieved throughput | Pending |
| k6 p95 and units, HTTP 5xx count, other error counts | Pending |
| Smoke test output and link to run | Pending |
| Bugs filed on owning PRs | None filed yet |
| Verdict | NOT VERIFIED |

## Separation and safety

- This independent test branch does not modify other contributors' feature code,
  workflows, or accepted acceptance tests.
- Never shut down production or the deployed school, and never send 100 sign-ins
  to a real provider. Do not run load scripts against the public Railway URL.
- Keep real cookies, API keys and collected user data out of logs, artifacts, PRs and Jira.
- Re-check on the **actual** candidate HEAD SHA after dependent PRs update.
- Keep the PR in Draft until X2-01 through X2-08 are evidenced and reviewed.
