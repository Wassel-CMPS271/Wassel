# SCRUM-177 — Authentication browser tests

## Current verification — 3 November 2026

Integrated origin/develop `1785ad89aa9b1cbcdf22cbeb83fc76ace3c0fddd` by merge. SCRUM-98's actual revoke/restore endpoints and SCRUM-171's account lockout are present. Both former revocation skips are removed; they are required in the normal and CI suite. Added a real five-wrong-password lockout case that verifies even the correct password is then rejected without pending/session cookies.

**Current-source real browser result: 10 passed, 0 failed, 0 skipped (19.4s)** on fresh native PostgreSQL/Flyway, production seeders and production frontend. Revoked-parent sign-in and next-request session rejection both passed, with actual authorized restore cleanup. All four role/password/2FA/home/logout cases and incorrect credentials still pass. No mocked production responses, forged JWTs or SQL enabled toggles. Frontend **572 passed, 6 existing skips**; lint, production build, dependency audit at high severity and PR diff checks pass. Current full backend **1099 tests, 0 failures/errors, 2 skips**, native PostgreSQL. Earlier resource-starved startup evidence is retained and not counted as success.

Fresh evidence: tmp/SCRUM-177-final/{browser-serial.log,frontend-tests.log,lint.log,audit.log,backend-verify-native.log,backend-verify-console.log}; production build log and final browser report are in ignored frontend/e2e-artifacts. Prior evidence was copied before reexecution.

The attempted common Playwright runner/config reconciliation across SCRUM-230/177 was rejected by automatic approval review. The user explicitly chose **defer until PR #85 merges**. Keep the existing verified runner intact; the complete authentication branch may be pushed for PostgreSQL CI, but do not open a conflicting/duplicated infrastructure PR until #85 is merged and the integration is reconciled. No shared history rewrite or force push. Jira stays In Progress until the complete PR and required checks are ready.

Cloud CI also exposed an unchanged develop absence-test timezone bug (UTC LocalDate.now versus the production Beirut Clock); it is reported to the owner on PR #97. Local passing native PostgreSQL results are not a claim that that cloud check passes. Refresh the old dependency and next-step notes below against this current section.

## Historical verification and preservation

30 October 2026. Jira: In Progress. No implementation commit, push or PR: SCRUM-98 remains incomplete.

Preservation update, 31 October 2026: the user authorized a local-only commit of this verified implementation, tests and report. All 14 files matched the saved verification manifest before this note was added. The 30 October results and blockers below remain historical evidence; no tests were rerun for preservation. This local commit does not complete SCRUM-177 or authorize a push/PR. Raw evidence stays local and ignored.

## Branch and preserved dependencies

Worktree: `C:\Users\User\.codex\worktrees\scrum-177-auth-e2e\Wassel`

Branch: `test/SCRUM-177-auth-e2e`, based on `origin/develop` at `8f052a72d5a829ca5260dcf5e6dfbf4c9a9f3b82`.

Inspected SCRUM-177 and SCRUM-98 and SCRUM-230 PR #85. PR #85 is open/unmerged; only its Playwright runner/config were reused and adapted here. Its worktree, routing tests, commits and evidence were left untouched. This branch does not cherry-pick an unfinished routing feature. Reconcile shared package/config/CI changes when the two branches merge.

SCRUM-98 is To Do. PR #95 remains open/unmerged at `9a3c303fc3714f64e75a6e831971f2c89ac936d1`. No revocation implementation, SQL user toggles or test-only revoke endpoint were fabricated.

## Implemented acceptance criteria

- Playwright Chromium setup, documented one-command stack runner (`npm run test:e2e`) and dependency install command.
- Real password + 2FA login for ADMIN, Head of Transportation (actual enum `HEAD_OF_TRANSPORT`), DRIVER and PARENT; assert role-specific home and authenticated `/api/auth/me` role.
- Assert pending HttpOnly/SameSite Strict 2FA cookie does not authorize `/me`; successful verification replaces it with the session cookie.
- Wrong password and wrong code show exact backend errors; wrong-code recovery uses the actual fresh code, without bypassing 2FA.
- Browser logout removes access; protected home redirects to login. Parent is redirected away from Admin home and receives 403 from a real Admin API endpoint.
- Two real revoke/restore browser tests prepared, explicitly skipped pending SCRUM-98. They cover a revoked Parent's login and an already authenticated Parent's next request. Recheck paths/schema and extend role coverage if the final SCRUM-98 contract changes.
- PostgreSQL-backed GitHub Actions core-auth job authored. It has no continue-on-error; compile, migrations, seed, build, readiness and test failures produce a nonzero exit. Cloud execution remains unverified because the incomplete ticket is not pushed.

The runner compiles a test-classpath launcher, then runs the actual application, Spring security, password/code services, AdminSeeder and DemoDataSeeder. The frontend is a production build. The fresh 2FA code is read from the isolated LoggingMailer ECS JSON event after the login request starts and for the exact email; no fixed OTP or mocked API responses are used. This mechanism is documented for teammate review; no claim of a separate agreement from Mohamad is made.

Safety: generated per-run passwords/JWT secrets and unique school id; loopback-only disposable database named wassel_e2e; public schema must be empty **before Flyway**; existing users rejected as an additional check. Ports are checked before launch. Only owned processes are stopped. Raw logs/databases/credentials/browser artifacts are ignored and not uploaded by CI. No production backend file or endpoint changed.

## Executed results

| Check | Result |
|---|---|
| Final real browser auth run, latest launcher/source | **7 passed, 2 dependency skips**, 19.6 seconds; runner exit 0 |
| Real PostgreSQL 16.14 + Flyway | **Passed**; all 5 migrations validated/applied, Hibernate validate, production Admin/Demo seed ready |
| Production frontend build used by browser | **Passed**; subsequent runs reused the unchanged frontend build while recompiling the latest backend launcher |
| Full frontend `npm test` | **511 passed, 7 existing skipped**, 38 test files |
| Final frontend ESLint | **Passed**, no warnings |
| Full Maven `verify`, native disposable PostgreSQL | **Passed**; 777 tests run, 0 failures, 0 errors, 1 skipped; JaCoCo/package completed |
| Default Docker/Testcontainers authentication Maven run | **Environment failure**; 68 tests run, 53 context errors because Docker is unavailable; not weakened or hidden |
| Nonempty-database safety probe | **Passed**; launcher exit 1 with “refuses a nonempty database before migrations”, read-only preflight against our migrated disposable DB |
| `git diff --check` | **Passed** |
| Revoked-user / revoked-session verification | **Pending SCRUM-98**, neither counted as passed |
| GitHub CI / docker-compose.staging.yml stack | **Not executed**; Docker daemon unavailable and branch not pushed |

The full Maven verification used only command-line datasource overrides to a **separate new native PostgreSQL** instance on loopback port 55438. It ran the unchanged full test suite and real migrations, without H2 or disabling tests. Reproduction helper is preserved in ignored `tmp/SCRUM-177/verify-backend.mjs`; the normal Testcontainers configuration remains unchanged. E2E used its own fresh PostgreSQL on port 55437; no existing application database was reused.

Initial browser run: 5 passed/2 failed/2 pending. Both failures were test mistakes: a broad alert locator also selected Next's route announcer, and the authorization check named a nonexistent endpoint. The assertions were corrected to the actual visible error and documented Admin endpoint, preserving 401/403 expectations. Original reports/traces/screenshots remain in `tmp/SCRUM-177/browser-run-1`; the next passing run is archived in `browser-run-2`. Final logs/report remain under `frontend/e2e-artifacts` and `tmp/SCRUM-177/browser-final-console.log`. Credentials are removed after each run. Windows Maven launch and Docker failure logs are also preserved locally. The initial PostgreSQL readiness attempt timed out because the minimal binary package lacked pg_isready; the runner now checks its own PostgreSQL readiness event and creates the database using single-user mode before starting the server.

## Changed files (14)

- `.github/workflows/ci.yml`, `.gitignore`.
- `frontend/package.json`, `frontend/package-lock.json`, `frontend/eslint.config.mjs`, `frontend/README.md`.
- `frontend/playwright.config.ts`.
- `frontend/e2e/run.mjs`, `auth-helpers.ts`, `auth.e2e.ts`, `auth-revocation.e2e.ts`.
- `backend/src/test/java/com/wassel/backend/e2e/AuthE2eApplication.java`.
- `backend/src/test/resources/application-e2e.yml`.
- This report.

## Exact completion steps

1. Complete/merge SCRUM-98 (PR #95 or final replacement); inspect its actual permissions, path/status/body contracts and update only these independent tests if necessary.
2. On a fresh isolated PostgreSQL stack, run `npm run test:e2e -- --revocation`; require both prepared cases to pass without skips. Include them in the full CI gate once the dependency is on the base.
3. Confirm the documented LoggingMailer mechanism with the auth owner, and run the staging-compose deployment once a working Docker environment is available. The native real-app result is not a claim that compose was tested.
4. Reconcile PR #85's shared Playwright infrastructure and latest develop; repeat regression/lint/build/browser verification and review all changes for secrets/scope.
5. Only when complete, commit related files, push this branch, open a regular develop PR with independent review, verify GitHub CI and move Jira to In Review. Do not merge without required approval.
