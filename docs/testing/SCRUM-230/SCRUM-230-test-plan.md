# SCRUM-230: Routing end-to-end verification

## Scope

One Chromium scenario drives the production Next.js frontend against the real Spring Boot backend and database. No API, authentication, optimizer, or Leaflet replacement is used in a normal run. With no ORS key, the production straight-line travel-time fallback makes the fixture deterministic; live road-time accuracy and external map-tile availability are outside this scenario.

The scenario verifies password login, the real pending HttpOnly cookie and logging-mailer 2FA code, the authenticated Head of Transport role, route creation, three student assignments, 14-seat capacity, an optimizer preview without persisted changes, applying the proposal, reload persistence, numbered Leaflet markers and popups, school arrival time, painted route geometry, and absence of browser/API errors. Cleanup deletes the route and checks that all three students are unassigned.

## Run

Use Node 24, Java 21, Maven, and installed frontend dependencies. From `frontend`:

```sh
npm run test:e2e:install
npm run test:e2e
npm run test:e2e:report
```

The runner owns ports 4173 and 18080, refuses occupied ports, generates disposable credentials, compiles the backend test launcher, builds the production frontend, waits for readiness, runs Playwright without retries, and stops its child processes. It removes the credential file on success or failure. Do not set `E2E_FAILURE_PROBE` for a normal run.

Current develop no longer supports H2. Provide an empty disposable PostgreSQL database named `wassel_e2e` on loopback:

```sh
E2E_DB_URL=jdbc:postgresql://127.0.0.1:5432/wassel_e2e E2E_DB_USERNAME=postgres E2E_MAVEN_CMD=mvn npm run test:e2e
```

Use `E2E_DB_PASSWORD` if required. Every run enables Flyway and Hibernate schema validation. The test-only launcher rejects other database URLs and refuses a nonempty public schema before migrations, as well as existing fixture data before seeding. Do not point this at a shared database. On Windows without Docker, set `E2E_POSTGRES_BIN` to a trusted PostgreSQL bin directory containing initdb.exe and postgres.exe; the runner creates a new cluster/database on port 55437. Existing artifact logs/reports are archived under e2e-artifacts/history before each run.

Windows users can provide `E2E_MAVEN_CMD` as the absolute path to an installed `mvn.cmd`, `E2E_MAVEN_REPO` as their Maven cache, and `JAVA_HOME` as their Java 21 installation. `E2E_REUSE_BUILD=1` is only for diagnosis after a matching production build; leave it unset for normal verification.

## Failure detection and evidence

`E2E_FAILURE_PROBE=apply npm run test:e2e` deliberately aborts only the Apply request. This separate negative run must return exit code 1 at the Apply step and retain a screenshot, video, trace, and error context. It is not a normal routing failure and must not replace successful-run evidence.

`E2E_FAILURE_PROBE=cleanup` is a second negative control: it deliberately leaves the route assigned. A read-only test-classpath JDBC checker reads the actual students.route_id and students.stop_position columns and must fail. No production response fields or test endpoints were added. The normal cleanup also checks that fetching the deleted route returns 404. Cleanup exceptions fail an otherwise successful test; when the scenario already failed, they are annotated without replacing its original failure.

GitHub Actions runs independent `success`, `failure-probe` and `cleanup-probe` matrix jobs with fresh PostgreSQL 16 services. The success job must pass the full browser scenario. The Apply probe verifies the nonzero exit, the specific Apply timeout, failed-test metadata, captured trace/screenshot, and credential cleanup. The cleanup probe requires exit 1 and the actual membership-check error. Unexpected success or an earlier startup failure fails either job. Maven, lint, unit tests, build, and normal E2E failures propagate directly to CI.

Reports and stack logs are in ignored `frontend/e2e-artifacts/`. CI uploads separate diagnostic artifacts for each matrix scenario; the generated credential file is excluded. Logging-mailer verification codes and automatically generated local development values are disposable, not deployment credentials.

Recovered October 20 evidence was copied before executing new checks to `C:\Users\User\Desktop\Wassel\scrum230-evidence-20261024`. Current verification logs are also retained there. Never commit these generated logs or browser artifacts.

## Reviewer repair verification — 3 November 2026

Integrated origin/develop 1785ad89aa9b1cbcdf22cbeb83fc76ace3c0fddd with a merge, retaining shared history. Resolved package scripts by keeping both develop's coverage command and existing Playwright commands. Addressed all three Moustafa review points: real membership oracle, original-failure preservation, and an explanatory comment for deterministic repository fixture seeding.

Executed on current source: PostgreSQL/Flyway routing browser **1 passed** (13.0s test); deliberate Apply and unreleased-assignment controls each **exit 1 at the required assertion**; frontend **572 passed, 6 skipped**, ESLint and production build passed; npm audit --audit-level=high passed (14 moderate advisories, no high/critical gate failure). The unchanged current develop backend core was also verified in the SCRUM-177 worktree using a separate native PostgreSQL datasource: Maven verify **1099 tests, 0 failures/errors, 2 skipped**. The routing-specific launchers compile and execute in the browser runs. Local bounded-worker verification avoids memory starvation; earlier worker/startup timeout logs are retained, not counted as passes.

Evidence is ignored under tmp/SCRUM-230-final and frontend/e2e-artifacts/history. GitHub CI for this repair must be checked after pushing; local results do not establish cloud success. Shared runner consolidation with SCRUM-177 was not applied: automatic approval review rejected the proposed cross-worktree rewrite. Existing runners and evidence remain preserved pending an approved integration approach.
