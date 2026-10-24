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

Default execution uses disposable in-memory H2 in PostgreSQL compatibility mode. To exercise real PostgreSQL and Flyway, provide an empty disposable database named `wassel_e2e` on loopback:

```sh
E2E_DB_URL=jdbc:postgresql://127.0.0.1:5432/wassel_e2e E2E_DB_USERNAME=postgres E2E_MAVEN_CMD=mvn npm run test:e2e
```

Use `E2E_DB_PASSWORD` if required. PostgreSQL runs enable Flyway and Hibernate schema validation. H2 runs use Hibernate create/drop. The test-only launcher rejects other database URLs and refuses existing accounts, vehicles, or students. Do not point this at a shared database.

Windows users can provide `E2E_MAVEN_CMD` as the absolute path to an installed `mvn.cmd`, `E2E_MAVEN_REPO` as their Maven cache, and `JAVA_HOME` as their Java 21 installation. `E2E_REUSE_BUILD=1` is only for diagnosis after a matching production build; leave it unset for normal verification.

## Failure detection and evidence

`E2E_FAILURE_PROBE=apply npm run test:e2e` deliberately aborts only the Apply request. This separate negative run must return exit code 1 at the Apply step and retain a screenshot, video, trace, and error context. It is not a normal routing failure and must not replace successful-run evidence.

GitHub Actions runs independent `success` and `failure-probe` matrix jobs with fresh PostgreSQL 16 services. The success job must pass the full browser scenario. The probe job verifies the nonzero exit, the specific Apply timeout, failed-test metadata, captured trace/screenshot, and credential cleanup; unexpected success or an earlier startup failure fails the job. Maven, lint, unit tests, build, and normal E2E failures propagate directly to CI.

Reports and stack logs are in ignored `frontend/e2e-artifacts/`. CI uploads separate diagnostic artifacts for each matrix scenario; the generated credential file is excluded. Logging-mailer verification codes and automatically generated local development values are disposable, not deployment credentials.

Recovered October 20 evidence was copied before executing new checks to `C:\Users\User\Desktop\Wassel\scrum230-evidence-20261024`. Current verification logs are also retained there. Never commit these generated logs or browser artifacts.
