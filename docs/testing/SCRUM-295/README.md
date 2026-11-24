# SCRUM-295 — independent Sprint 5 verification

Owner: Wassim. Updated **24 November 2026 (Asia/Beirut)**. PR #183 remains **Draft**.
This branch contains verification tools and test fixtures only. No teammate production
source, branch, acceptance test, or Jira status was changed.

## Current evidence and verdict

Acceptance is **incomplete**. Checker self-tests are not feature acceptance.

| Gate | Actual evidence | Result / remaining work |
| --- | --- | --- |
| X2-01: admin-only metrics | PR #187 author CI ran four controller tests; independent PostgreSQL/security tests prepared against its exact head | Independent real PostgreSQL/security assertions passed; injected principals are not browser/2FA proof |
| X2-02: metric values, units, resets | Local Java: **7 passed, 1 failed**; hosted Java: **11 passed, 1 failed**, 0 errors/skips; canonical checker controls pass | Real prefix-exclusion defect below; delivery integration and deployed-restart observation still required |
| X2-03: minimal health / private actuator | Candidate contract and existing tests reviewed; independent real-application assertions prepared | Independent real-application health/privacy assertions passed (PostgreSQL 16.16, Flyway v17) |
| X2-04: external uptime / outage alerts | SCRUM-291 Jira and comments reviewed; README describes health checks but supplies no verified external monitor dashboard | BLOCKED: provider links/settings, both monitored targets, alert receipt and genuine disposable outage/recovery evidence |
| X2-05: coverage readings | Actual PR #187 CI artifacts: backend **3408/3521 = 96.7907%**, frontend **4253/4735 = 89.8205%** | Both above configured floors; genuine develop daily readings independently extracted below; owner document still lacks rows; rounding discrepancy below |
| X2-06: native coverage rejection | Disposable workflows add uncovered code and run all tests with unchanged native floors | Both native gates rejected actual below-floor regressions after zero unexpected functional failures; details below |
| X2-07: school load replay | Three genuine author summaries audited; Monday run 3 global p95 **9.8956 ms**, steady p95 **8.8133 ms**, zero recorded 5xx/failed checks | Not accepted: duration and backend-only steady throughput missing in old summaries; workload differs from ticket; post-SCRUM-289 replay outstanding |
| X2-08: isolated resource-capped stack | Authored compose/seed/stubs and Docker-stat reports inspected | New independently captured caps/dataset and replay pending; production comparison remains a documented limitation |

Frozen sources inspected:

- develop `7a938f500228f6aff0c86c1a79ed029ed0e4f65b`.
- SCRUM-293 / merged PR #185 head `cbaf70e1a574d1a0998a0d4019a7c401e26c7432`.
- SCRUM-290 / open PR #187 head `e8bca50722324279df6be686843949b06a212500`.
- SCRUM-292 / merged PR #184 head `72f274a2dd1b4e92fcd5fe10a1a73bbb25b3ef86`.

The machine-readable [artifact audit](evidence/2026-11-24-artifact-audit.json)
records source SHAs, original artifact IDs/ZIP digests, all measured values and
missing measurements. The [local metrics result](evidence/2026-11-24-local-metrics.json)
contains test identities/counts only, with no captured HTTP bodies or credentials.

## Executed checks

- Original independent tooling baseline: **40/40** Node tests passed.
- Expanded verifier controls: **85/85** Node tests passed, no skipped/cancelled tests.
  These exercise synthetic/loopback fixtures, not the production service.
- Independent Java criteria against unmodified PR #187 production source:
  **8 run, 7 passed, 1 failed, 0 errors, 0 skipped**. Both Java fixture classes
  compiled. The local command selected only `IndependentRequestMetricsCriteriaTests`;
  the four Spring/PostgreSQL tests were then executed in hosted CI and **all four passed**. PostgreSQL 16.16 started, and Flyway applied 17 migrations to v17.
- Both SCRUM-295 workflow YAML files parsed successfully. JavaScript syntax and
  `git diff --check` are checked before publication.
- PR #187's real [backend CI](https://github.com/Wassel-CMPS271/Wassel/actions/runs/45238110173/job/137915153513)
  ran `AdminMetricsControllerTests` **4/4**, `RequestMetricsFilterTests` **4/4**
  and `OperationalMetricsTests` **7/7**. Its PR description's older statement
  that controller tests were not run is stale; those 15 author tests did run.
- That CI's downloaded `backend-coverage` artifact **14850599424** and
  `frontend-coverage` artifact **14850548551** supplied the actual counts above.
  They are candidate-branch readings, not new daily develop readings.

Local Docker Desktop's engine did not answer two bounded unsandboxed server
queries (25 s and 15 s). No local load stack was started or stopped. Hosted
Ubuntu runners are used for the disposable PostgreSQL, coverage controls and
load replay; the real completed results are recorded below. The initial load attempt failed before startup on Maven Central HTTP 429; the load-only retry built the stack but its host-loopback health probe could not connect. The harness now probes health inside the internal Docker network used by k6 and provides pre-seed startup diagnostics; another actual run is required.

## Hosted execution results

[Independent run 45314387002](https://github.com/Wassel-CMPS271/Wassel/actions/runs/45314387002), test commit `f902ce7b81065da14e540e56108e4108f39c5c74`:

- **Metrics:** 12 tests, **11 passed / 1 failed**, zero errors/skips. All four
  real PostgreSQL/Flyway/security tests passed. The only failure is the normal
  actuator-prefix regression; it was not marked expected, skipped or removed.
- **Backend native coverage control:** 1852 tests, **0 failures/errors**, 4
  pre-existing skips; measured **74.8538%** below unchanged **94.7%** floor.
  Maven returned 1 specifically because the native JaCoCo gate rejected it.
- **Frontend native coverage control:** 1804 total tests, **0 unexpected
  failures/errors**, 5 pre-existing skips and the existing expected-failure
  test retained; coverage **75.3882%** below unchanged **86.6%** floor.
  Vitest returned 1 specifically for the native coverage threshold.
- **Load:** initial attempt could not build because Maven Central returned 429;
  no load execution is claimed from that attempt. The first retry built the stack but host-loopback health remained unreachable; it never seeded or ran k6. Our harness now checks the same health endpoint inside the isolated network, preserving egress isolation and the UP requirement. A new execution is pending.

The [sanitized hosted evidence](evidence/2026-11-24-hosted-probes.json) records
artifact IDs, hashes and exact native exits/counts. A successful negative-control
job means the native build **failed as required**; it is not a green product
build with uncovered code added.

[Normal PR integration CI](https://github.com/Wassel-CMPS271/Wassel/actions/runs/45314478705)
also completed successfully: Maven **1852 total, 0 failures/errors, 4 existing
skips**; frontend **1798 passed, 1 existing expected failure, 5 existing skips**
(107 files), ESLint and production build passed. Authentication browser tests
**10/10**, absences **1/1**, parent tracking **1/1**, Inbox **2/2**, integrated
parent/driver UI **1/1** passed; routing success and both deliberate probe jobs
also passed. No existing expected-failure or skipped test was changed by this PR.
Those normal CI results do not override the independent candidate defect.

## Confirmed SCRUM-290 defect

`RequestMetricsFilter.shouldNotFilter()` uses `path.startsWith("/actuator")`.
An ordinary request to **`/actuator-not-an-endpoint`**, answered 404, is therefore
excluded from all metrics. The contract excludes actual actuator endpoints
(`/actuator/*`), not unrelated prefix lookalikes. The independent test
`aLookalikePrefixIsNotAnActuatorEndpointAndMustBeCounted` expects total **1**,
observes **0**, and remains a normal failing test.

Moustafa should restrict exclusion to the actual actuator namespace and rerun
his existing tests plus this regression. No feature implementation was patched
in this branch. The Draft PR exposes the failure rather than masking it.

```bash
# In an isolated copy of pinned PR #187, add only verification/scrum295/java fixtures:
cd backend
./mvnw -B test -Dtest=IndependentRequestMetricsCriteriaTests -DfailIfNoTests=true
```

Independent coverage also checks nearest-rank p95 in **whole milliseconds**, the
latest-2000 sample, null empty ratios/p95, response classification, documented
failed-login statuses, notification arithmetic and in-memory reset behavior.
The Spring fixture uses the real application/security chain, PostgreSQL/Flyway,
controlled test-only 500/429 sources and real invalid-password/account-lock flows.
Role principals are injected test fixtures. Notification arithmetic is a unit check. Five additional independent criteria now exercise real confirmations, PostgreSQL outbox rows, retry-then-success, exhausted retries, expiry, interruption and muted delivery through the production service, using the existing mail-provider stand-in. They compile locally; hosted execution is pending. Neither stand-in delivery nor a new collector instance proves real provider delivery or an observed cross-process restart.

## SCRUM-292 coverage audit

Merged implementation documents Day 1 backend **96.72%**, frontend **88.58%**;
actual configured floors are **94.7%** and **86.6%**. Native CI artifacts are
read from report-level JaCoCo `LINE` counters and Vitest total line counters.
A stricter/raised floor is permitted; lowering a floor below baseline minus
2 percentage points is rejected.

The backend floor is **0.02 percentage points below** the literal published
96.72 - 2 = **94.72%** minimum. Frontend 86.6% is stricter than 86.58%.
The policy audit intentionally reports the backend discrepancy rather than
inventing another baseline. Mohamad should clarify the approved rounding policy
or correct his floor upward. The owner daily-readings document currently contains only 22 November. We independently downloaded real develop artifacts and preserved the missing readings in [our evidence](evidence/2026-11-24-develop-coverage-readings.json): **23 Nov: 96.7180% backend / 90.0934% frontend**, run **45239996621**; **24 Nov: 96.6599% / 90.3405%**, run **45298409430**. The owner should copy the genuine readings/links into docs/quality; absence of a row does not mean the CI evidence is absent.
Jira SCRUM-292 still says To Do even though PR #184 merged; no status was changed.

The native negative controls add a new 1000-line, deliberately uncovered fixture
only to disposable checkouts. They leave every existing test and configured
floor intact, run the full native test/coverage command, and require:

1. Functional tests actually ran without failures or execution errors.
2. Measured coverage fell below the unchanged native floor.
3. The command failed specifically with JaCoCo/Vitest's coverage rejection.

A compilation failure, test failure or missing report cannot pass the control.
Only sanitized numeric results are uploaded; generated source and build logs
are not committed. This controlled regression is verification, not a proposed
product change or a weakened test.

## SCRUM-293 report audit and replay

| Author run | Requests | Aggregate RPS | Global p95 ms | Peak active VUs | Recorded 5xx |
| --- | ---: | ---: | ---: | ---: | ---: |
| 22 Nov, Sunday | 37,766 | 55.5397 | 5.6162 | 302 | 0 |
| 23 Nov, Monday | 37,189 | 54.8160 | 11.0244 | 302 | 0 |
| 23 Nov, Monday, run 3 | 37,240 | 54.8523 | 9.8956 | 302 | 0 |

All three recorded zero failed requests/checks. Sunday lacked real school-day
runs/GPS and cannot be the final morning-peak acceptance run. Monday run 3's
whole sign-in p95 is **878.8014 ms** (password **875.7383 ms**, code **3.5980 ms**).
These are positive observations, not proof of every acceptance condition.

Limitations and discrepancies:

- Jira asks for **40–50 requests/s**, while the authored script deliberately
  models approximately **60 backend requests/s**. Its aggregate summary rate
  also includes setup and fake-mail calls. More load is useful evidence but
  does not silently redefine the approved workload. Owner must reconcile it
  or supply a matching scenario and rerun.
- Native `--summary-export` JSON lacks measured elapsed duration. Intended
  `duration: 10m` is configuration, not a measurement. Old reports also lack
  independently recorded backend-only steady throughput and completed burst
  counts. The audit marks missing evidence and returns nonzero.
- The source allows password/whole-sign-in p95 **3000 ms**, while the ticket
  states a 1000 ms p95 budget. Recorded sign-ins were below 1000 ms, but the
  weaker guard needs an explicit owner/team decision or correction.
- The owner disclosed an initial simultaneous-login stampede with eight 500s
  and ~52 s p95, and first-screen driver/parent initialization spikes (~6 s /
  ~2.4 s) clearing after ~30 s. Overall p95 must not hide these limitations.
- SCRUM-289 PR #188 and rate-limit PR #186 remain open at inspection. The
  accepted-source replay is **before** those changes; the required post-289
  burst needs another accepted combined candidate. No dependencies are merged
  here to manufacture acceptance.
- Caps are backend 1 CPU/1 GiB, PostgreSQL 1 CPU/1 GiB, fake mail 0.25 CPU/128 MiB.
  The stand-in delays mail 800 ms; absent ORS key forces straight-line routing,
  not a real road provider. Pinned addresses avoid geocoding. This differs
  from hosted production and must remain explicit.

Our reporting-only k6 entry invokes the author's setup and business callbacks
unchanged and preserves every original threshold. Additional counters measure
actual parent/driver participation, completed burst calls, steady elapsed time
and backend-only steady requests. Only sanitized summary/limits are published;
`setup_data` session tokens are removed. Its audit retains the ticket's original
RPS/latency/error/duration gates. A genuine mismatch stays a failed job.

The replay uses a uniquely named disposable Compose project, an internal-only
network, loopback-only health port, exact SQL-checked 1000/40/800/40/40 dataset,
slow fake mail and no road API key. It refuses weekends and removes only its
own project after completion. It never targets Railway or a live school.

## Running the independent tools

```bash
node --test scripts/scrum295-coverage-audit.test.mjs scripts/scrum295-load-audit.test.mjs scripts/scrum295-monitor-probe.test.mjs scripts/scrum295-verify-metrics.test.mjs scripts/scrum295-metrics-contract.test.mjs scripts/scrum295-junit-summary.test.mjs scripts/scrum295-coverage-probe-result.test.mjs
node scripts/scrum295-load-audit.mjs path/to/sanitized-summary.json server_errors
node scripts/scrum295-coverage-audit.mjs path/to/baseline-extracted-from-docs.json path/to/jacoco.xml path/to/coverage-summary.json
```

The baseline input is our explicit extraction of the published owner document;
the ticket does not require the owner to invent a new JSON contract.

For a real read-only HTTP smoke check, use the actual `/api/admin/metrics` path
and mappings exported as `METRIC_FIELDS` by `scrum295-metrics-contract.mjs`.
Set `SCRUM295_BASE_URL`, `SCRUM295_METRICS_PATH`, the four `SCRUM295_*_COOKIE`
values (ADMIN/HEAD/DRIVER/PARENT), and JSON `SCRUM295_FIELDS` in the process
environment only. Use isolated accounts authenticated through actual 2FA.
No cookies belong in files, CI artifacts, PRs or Jira. The validator checks
canonical nested fields, nullable empty p95/rates, fraction arithmetic and
restart disclosure; controlled deltas require separate evidence.

## External monitor dependency (SCRUM-291)

Still needed from Mohamad: actual external provider/dashboard links for BOTH
frontend and backend `/actuator/health`, finest free-plan cadence, verified team
alert destination, incident/downtime and alert-receipt records. Jira's only
comment is the previous handoff asking for these; no provider evidence was
supplied there. README's Railway health configuration is not external-monitor
or alert-delivery evidence.

The existing read-only `scrum295-monitor-probe.mjs` remains available. On a
**disposable monitored stack only**, collect up, intentional stop, down and
recovery observations; compare real vendor incident timestamps/alerts and
planned-deployment downtime. This script never stops services or sends alerts.
Synthetic response tests are not genuine uptime acceptance.

## Next actions / Draft rule

1. Finish the corrected network-internal load readiness/replay and five new real delivery-metric criteria; attach actual results, including failures.
2. Moustafa fixes the confirmed prefix exclusion and provides final notification
   integration evidence; rerun independent criteria against his new head.
3. Mohamad supplies monitor/outage evidence, coverage rounding clarification and
   publishes the independently recovered daily readings in the owner document; reconciles load model/budget and publishes complete timings.
4. Once SCRUM-289 is accepted, rerun the real one-minute login burst against it.
5. Keep #183 Draft until all X2-01 through X2-08 are evidenced. Do not label
   synthetic checks, author reports or pre-dependency runs as full acceptance.
