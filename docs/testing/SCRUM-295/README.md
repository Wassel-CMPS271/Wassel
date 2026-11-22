# SCRUM-295 — independent Sprint 5 verification

Owner: Wassim. Scope: **verification only**; do not implement SCRUM-290–293 in this branch.
Status: **PREPARED, NOT EXECUTED**. All result fields below remain unverified until the
respective implementation, isolated test stack, and evidence are available.

## Baseline already present on develop (22 Nov 2026)

- GET /actuator/health is public and exposes only `status` (see `HealthEndpointTests`).
- All other actuator endpoints are blocked; an authenticated admin receives 404
  for nonexposed paths such as /actuator/env.
- `RoleAccessMatrixTests` enumerates every application endpoint. SCRUM-290 must
  update that matrix in its own PR when adding the admin-only read endpoint.
- JaCoCo and Vitest coverage reports already exist. Current `ci.yml` uploads the
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


## Independent coverage artifact audit (X2-05 and X2-06)

Prepared on 22 Nov 2026; **not a passing acceptance result** until SCRUM-292
provides its Day 1 baselines, candidate implementation and CI runs.

- `scripts/scrum295-coverage-audit.mjs` reads authoritative JaCoCo **report-level**
  XML counters and Vitest `coverage-summary.json` totals from an existing test
  run. It intentionally does not modify coverage results, source files or CI.
- The audit requires an explicit, *frozen* JSON contract that records each
  team's agreed coverage metric, Day 1 baseline and floor. Its floor must be
  exactly **baseline minus 2 percentage points**, with no silent decrease.
  It fails on a missing report/metric, zero denominator or a below-floor result.
- `scripts/scrum295-coverage-audit.test.mjs` contains deterministic positive
  and **negative** controls for the audit itself; its green result means our
  checker is correct on the fixtures, **not** that SCRUM-292's GitHub CI gate
  is configured or working.

Expected candidate baseline schema (numbers are **illustrative only**, not
the project's measured values):

```json
{
  "backend": { "metric": "LINE", "baseline": 82, "floor": 80 },
  "frontend": { "metric": "lines", "baseline": 72, "floor": 70 }
}
```

When Mohamad submits SCRUM-292, read `docs/quality/` to confirm the
**actual** metric types, unit, Day 1 percentages and irrevocable floors. The
owner must configure Vitest's `coverage` JSON-summary reporter (or provide an
equivalent verified JSON artifact) for this helper to run.

```bash
node --test scripts/scrum295-coverage-audit.test.mjs
node scripts/scrum295-coverage-audit.mjs \
  path/to/frozen-baseline.json \
  backend/target/site/jacoco/jacoco.xml \
  frontend/coverage/coverage-summary.json
```

For X2-06, this checker is only a **precheck**. Independently verify on
disposable CI branches that a real decrease below the JaCoCo floor fails the
backend required check and a decrease below the Vitest floor fails the frontend
required check, without changing the thresholds. Archive the candidate SHA,
the before/after values, the failing job URLs and whether the failure came
from the intended coverage gate rather than compilation or another test. Never
weaken or skip existing tests to generate a synthetic result.

## Read-only metric access smoke test

`scripts/scrum295-verify-metrics.mjs` uses built-in Node 24 test/fetch functionality,
does **not** change database state, and is **not** wired into required CI. Run it
after SCRUM-290 defines and deploys its actual admin metrics read endpoint to a test stack.

Set these variables in the terminal/process environment (never commit or paste
real session cookies to a PR or ticket):

- `SCRUM295_BASE_URL`: origin of isolated test backend, e.g. `http://localhost:8080`
- `SCRUM295_METRICS_PATH`: the **actual** new admin endpoint path from SCRUM-290,
  e.g. `/api/admin/<actual-route>` — do not guess.
- `SCRUM295_ADMIN_COOKIE`, `SCRUM295_HEAD_COOKIE`,
  `SCRUM295_DRIVER_COOKIE`, `SCRUM295_PARENT_COOKIE`: valid **full Cookie header**
  values obtained in isolated test accounts after real 2FA login.
- `SCRUM295_FIELDS`: JSON object mapping each required logical measurement to its
  actual dot-separated field path in the JSON response. Required keys:
  `http5xx`, `p95Latency`, `http429`, `failedSignIns`, `lockouts`,
  `notificationsSent`, `notificationsFailed`.
- `SCRUM295_ALLOW_REMOTE_READONLY=1` **only** if the remote origin is a
  disposable test stack; local loopback needs no override.

Then run `node --test scripts/scrum295-verify-metrics.mjs` from the repo root.

The script fails closed on missing config and requires every metric to be present,
finite and nonnegative. A green smoke test alone **does not** prove counters are
accurate: controlled deltas, p95 distribution and redeploy resets require X2-02.

## Independent k6 result audit (X2-07)

Prepared, **not executed against the real SCRUM-293 script**.

- `scripts/scrum295-load-audit.mjs` inspects k6's exported `handleSummary(data)` JSON,
  without generating traffic. It checks actual p95 latency (strictly under 1000 ms),
  an explicitly configured custom 5xx counter equal to zero, measured 40–50
  requests/second, peak active VUs of at least 300, and a measured run lasting
  at least 600 seconds.
- The audit deliberately fails if the custom 5xx metric is absent: the standard
  `http_req_failed` measurement alone cannot establish *zero 5xx* if 4xx are
  also counted.
- The checks have positive and negative fixtures in
  `scripts/scrum295-load-audit.test.mjs`. Passing these fixtures only validates
  the audit logic; it does not prove the teammate's k6 script or deployment.

Once SCRUM-293 provides the actual script, require its `handleSummary` to write
a JSON file, and identify the author's actual **5xx Counter metric name**.
Run only on the disposable stack:

```bash
node --test scripts/scrum295-load-audit.test.mjs
node scripts/scrum295-load-audit.mjs path/to/k6-summary.json actual_5xx_counter_name
```

The 100 sign-ins in one minute (after SCRUM-289), the 1,000-student /
40-bus / 800-parent seed, slow fake Brevo, road routing stub, resource caps
and host comparison require separate independent evidence. Never claim those
passed from a k6 summary alone; do not run a new load test against the live
Railway host.

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
