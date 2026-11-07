# SCRUM-285: release security, deployment, performance and monitoring checks

Run on 7 November 2026 against `develop` at `4f92880` and the live apps (frontend `https://wassel-sooty.vercel.app`, backend `https://wassel-production.up.railway.app`). Only our own apps were touched, with read-only requests. No account passwords were used, and nothing in the live database was changed.

## Result in one paragraph

The deployment is in good shape: no committed secrets, every API route refuses a signed-out caller, CORS accepts only our site, no management or debug endpoint is exposed, and the database migrations apply cleanly on PostgreSQL 16. One real problem was found and **fixed in this PR**: the backend ran Tomcat 11.0.24 and Jackson 3.1.5, which have 12 known advisories (4 critical, 5 high). Moving Spring Boot from 4.1.1 to 4.1.2 fixes all of them. Three limits remain and are listed at the end: the backend has no health endpoint, the live school has no head, driver or parent account to run the smoke test with, and the Railway trial credit ends around 18 November.

## Acceptance criteria

| Criterion | Evidence | Result |
|---|---|---|
| Verify deployment configuration, secure secrets handling and the deployed app's critical access boundaries | sections 1 and 2 | Pass |
| Run security and dependency checks, PostgreSQL/Flyway verification and deployed smoke tests | sections 3, 4 and 5 | Pass, with the smoke-test limit in section 5 |
| Measure and record performance and monitoring/health behaviour | sections 6 and 7 | Recorded; monitoring gap listed |
| Document failures, remediation or accepted limits, and keep the evidence for the release candidate | sections 3 and 8 | Done (this file) |

## 1. Deployment configuration and secrets

| Check | How | Result |
|---|---|---|
| No secret in the repository | Searched every tracked file for private keys, AWS, Brevo, GitHub and JWT token shapes, and for `password/secret/token = "literal"` | None found. The only hits were test fixtures and a README example with a placeholder |
| No secret in the history | Listed every file name ever committed | Only `.env.example` and `.env.staging.example` ever existed. `.env` and `.env.staging` are in `.gitignore` |
| Secrets live in the host, not the code | Railway Variables tab for the backend (names only, values stay masked): `ADMIN_PASSWORD`, `BREVO_API_KEY`, `DB_PASSWORD`, `DB_URL`, `JWT_SECRET`, `MAIL_PASSWORD`, `ORS_API_KEY` and others are all set there | Pass |
| Safe defaults in `application.yml` | Read it | Cookies `Secure` by default (`JWT_COOKIE_SECURE:true`), demo data off by default, `ddl-auto: validate`, JWT secret has no default (the app refuses to start under 32 bytes), school location required |
| Demo data is not on in production | Railway has no `DEMO_*` variables | Pass for safety. It also means the live school has no head, driver or parent account (see section 5) |
| Container | `backend/Dockerfile` | Builds with Maven then runs on a slim JRE. It runs as root, which is the image default. Accepted: Railway isolates the container, and the file is shared with the staging stack |

## 2. Access boundaries on the live apps (read-only probes)

| Probe | Expected | Observed |
|---|---|---|
| `http://` to `https://`, frontend and backend | redirect | 308 and 301 to https |
| 9 API routes through the site with no cookie (`/api/auth/me`, head of transportation routes, drivers, parents, admin school times, driver runs, parent children, runs, absences) | 401 | 401 on all 9 |
| Management and debug paths on the backend (`/actuator`, `/actuator/env`, `/actuator/heapdump`, `/v3/api-docs`, `/swagger-ui`, `/h2-console`, `/.env`, `/.git/config`, `/error`) | not 200 | 401 on all (nothing exists, and Spring answers 401 for any unknown path) |
| `/.env` and `/.git/config` on the frontend | not 200 | 404 |
| CORS from `https://evil.example` | refused | 403, no CORS headers |
| CORS from `https://wassel-sooty.vercel.app` | allowed with credentials | 200, `access-control-allow-origin: https://wassel-sooty.vercel.app`, `allow-credentials: true` |
| Role boundaries behind sign-in | every endpoint against every role | Covered by `RoleAccessMatrixTests` (SCRUM-254), part of the 1178 backend tests in section 4. The test fails if an endpoint has no row in its table |

## 3. Dependency checks

| Scope | Tool | Result |
|---|---|---|
| Frontend, what ships (`npm audit --omit=dev`) | npm audit, and CI's "Audit dependencies" step on every PR | 0 vulnerabilities |
| Frontend, build tools | `npm audit` | 6 moderate, all through `@typescript-eslint` and `minimatch` (a denial-of-service in a glob pattern). They are lint tooling and never reach the deployed app. CI fails only on high or critical, so this passes. Accepted |
| Backend, runtime libraries (107) | `mvn dependency:list`, then the OSV vulnerability database | **12 advisories in 3 libraries** (below) |

Backend findings and remediation:

| Library | Advisories | Fixed by |
|---|---|---|
| `tomcat-embed-core` 11.0.24 | 4 critical: DIGEST authentication replay bypass, FORM authentication authorization flaw, HTTP/2 no-authority SNI bypass, improper access control | Tomcat 11.0.25 or newer |
| `jackson-core` 3.1.5 | 2 high: unbounded error token length, quadratic number-parsing backtracking | 3.1.7 |
| `jackson-databind` 3.1.5 | 3 high (denial of service through quadratic reference completion, XML duration parsing, unknown type ids), 2 moderate (missing base type, path scheme allow-list) | 3.1.7 |

Does the app actually use the flawed parts? Probably not: we use neither the DIGEST nor the FORM authenticator and Railway terminates TLS, and our JSON bodies are small. That is not a reason to leave them, because the fix is a patch release.

**Remediation (this PR):** `backend/pom.xml` moves the Spring Boot parent from 4.1.1 to 4.1.2, which manages Tomcat 11.0.27 and Jackson 3.1.7. Checked afterwards: the dependency list shows those versions, and the same OSV query returns **0 advisories for all 107 runtime libraries**. The full backend suite passes on 4.1.2 (section 4).

The live backend keeps the old versions until this PR is merged and Railway redeploys `develop`.

## 4. PostgreSQL and Flyway

| Check | Result |
|---|---|
| Full backend build, `./mvnw clean verify`, on Spring Boot 4.1.2 | **1178 tests, 0 failures, 0 errors, 1 skipped**, BUILD SUCCESS, 6 min 28 s on this laptop |
| Database | Testcontainers, **PostgreSQL 16.15**. The Docker image is `postgres:16`, and Railway's database version was not checked |
| Migrations | Flyway: "Successfully applied **9 migrations**" (V1 to V9) on an empty database, then Hibernate `validate` accepts the schema |
| Packaged jar | Builds, 180 MB, including the repackaged application |
| Frontend (unchanged by this PR) | 572 tests, lint and build pass on the last `develop` run in CI |

The first attempt at this run failed with 708 errors because Docker Desktop was stopped (the tests start the PostgreSQL container). It was rerun with Docker running. This is a known requirement, written in `backend/CLAUDE.md`.

## 5. Deployed smoke test

`scripts/smoke-test.mjs` (SCRUM-217, merged) was run with no accounts set, which runs only the three public checks:

| Check | Result |
|---|---|
| plain `http://` redirects to `https://` | pass (308) |
| the sign-in page loads | pass |
| the API answers through the site, 401 when signed out | pass |

The four sign-in checks (cookie flags, session, own data, other roles refused, sign-out) **could not be run**: the live school has only the admin account, and the other three roles need an inbox that can receive the emailed code. To run them, turn on demo data on Railway (`DEMO_DATA_ENABLED`, `DEMO_PASSWORD`, `DEMO_EMAIL_BASE` set to a Gmail address you own), or invite a head of transportation and create the driver and parent from the app. The cookie flags (`Secure`, `HttpOnly`, `SameSite=Strict`) are therefore **not verified on the live site** by this run. This stays open for the release candidate (SCRUM-286).

## 6. Performance

15 requests each from this laptop (Lebanon) to the live apps, one at a time. Numbers include the distance, so they read slower than a user in the same region as the servers.

| Request | Median | Slowest of 15 |
|---|---|---|
| Landing page (Vercel) | 282 ms | 567 ms |
| Sign-in page (Vercel) | 361 ms | 1083 ms |
| API 401 through the site, Vercel to Railway | 319 ms | 551 ms |
| API 401 straight to the backend | 306 ms | 334 ms |
| Wrong-password sign-in, unknown account (8 requests) | 370 ms | 600 ms |

Reading: the proxy adds about 15 ms over calling the backend directly, and nothing ran longer than 1.1 s. Heavier calls (generating a fleet of routes) were measured earlier in `backend/CLAUDE.md`: 13.5 s for 150 students on 10 vehicles on straight-line times, which is the one slow operation and runs on request, not on page load. Signed-in calls with real data could not be timed on the live site (section 5).

Suggested criteria for the team to confirm: a page or API call answers in under 1 s at the median and under 2 s at the slowest; generating routes finishes in under 20 s for the demo size. Today's numbers meet them.

## 7. Monitoring and health

| What exists | Where |
|---|---|
| Structured JSON logs (ECS) with the severity in a field | the backend writes them to the console |
| Logs and metrics on production | Railway's own Logs, Metrics and Deployments tabs, and Vercel's deployment logs |
| Logs search and dashboards | Loki and Grafana in the **staging** stack only (`docker-compose.staging.yml`), not on the live deployment |
| Failure logging of interest | wrong sign-in codes (WARN, with the user id and attempt number), sign-in lockout, mail failures (ERROR) |

**Gap: no health endpoint.** The backend has no actuator. `anyRequest().authenticated()` means every unknown URL, including `/actuator/health`, answers 401. So Railway can only tell the process is listening on its port, not that the app and database are healthy, and nobody can point an uptime monitor at it. The smoke test's "API answers through the site, 401 when signed out" is the working substitute today.

Recommendation, not done in this PR because it adds a public endpoint: add `spring-boot-starter-actuator`, expose only `health` (no details), allow `GET /actuator/health` without sign-in in `SecurityConfig`, and set it as Railway's healthcheck path. Then an uptime monitor can watch it. Accepted for the release candidate if the team prefers not to add it.

## 8. Failures, remediation and accepted limits

| # | Finding | Status |
|---|---|---|
| 1 | Backend ran Tomcat 11.0.24 and Jackson 3.1.5 with 12 known advisories | **Fixed in this PR** (Spring Boot 4.1.2). Takes effect on the live app after merge and redeploy. Re-run the OSV check after the deploy |
| 2 | No health endpoint, so no real health check or uptime monitor | **Open**, recommendation in section 7. Decision for the team |
| 3 | The live school has no head, driver or parent account, so the signed-in smoke test cannot run | **Open**, belongs to SCRUM-286. Fix: enable demo data or create the accounts |
| 4 | Railway trial credit: "17 days or $3.16 left" on 1 November, so about 18 November. When it ends the backend and database stop | **Open**, needs a decision before the demo: pay for a plan or move the backend and database |
| 5 | 6 moderate npm advisories in lint tooling | Accepted: dev only, never shipped, below the CI failure level |
| 6 | Container runs as root | Accepted: Railway isolates it, the Dockerfile is shared with staging |
| 7 | Performance measured only for public pages and 401s | Accepted: no signed-in session exists on the live site yet. Re-measure with the smoke test accounts |

No new bug tickets were needed for fixed or accepted items. Findings 2, 3 and 4 need an owner: suggest 3 goes into SCRUM-286 (release candidate) and 2 and 4 are raised with the team.

## How to repeat these checks

```bash
# backend advisories (needs Docker only for the test run below)
cd backend && ./mvnw -B -q dependency:list -DincludeScope=runtime -DoutputFile=runtime.txt
# then POST the group:artifact and version pairs to https://api.osv.dev/v1/querybatch (ecosystem "Maven")

./mvnw -B clean verify          # Docker Desktop must be running: starts PostgreSQL 16, applies the migrations
cd ../frontend && npm audit --omit=dev
node ../scripts/smoke-test.mjs  # with SMOKE_* accounts set, see the README
```
