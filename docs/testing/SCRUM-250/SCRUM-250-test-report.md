# SCRUM-250 — Independent driver frontend tests

## 17 November 2026 — accepted Driver integration and direct real-browser CI

Normally merged accepted develop **ed4736d64b402a02cb30a3f1253a97109b4f3b7e**, including merged Driver #144 (reviewed source 2cb70da) and roster #142. The previous sample-client integration blocker is resolved: Driver Today calls the real authenticated **/api/driver/runs/today** endpoint, and its independent delivery gate passes. All **65** independent acceptance cases and their original assertions are preserved; no teammate feature source or branch was edited.

| Current-source check | Actual result |
| --- | --- |
| Original 65 independent driver cases on accepted HEAD | **63 passed / 2 failed / 0 skipped** |
| Full frontend | **1,272 passed / 2 failed / 1 existing expected failure / 5 existing skips** (1,280; 78 files) |
| ESLint / production build / git diff --check | Passed |
| Standalone TypeScript | Same **13 accepted-develop baseline diagnostics**, zero introduced; compiler remains nonzero |
| Direct integrated Driver + real PostgreSQL/Flyway/Chromium | **1/1 passed**, runner exit 0; all 17 migrations applied |

The two failures are unchanged acceptance expectations against the new Driver UI:
1. **prevents duplicate confirmations while leaving other students actionable**: while a pickup is pending in the durable queue, the row removes **Not present** rather than leaving the expected disabled button. This failure does not establish that duplicate requests occur; preserve the entire acceptance case and agree/fix the pending-control UX with the feature owner.
2. **keeps a failed confirmation scoped to its student and retries the same status**: after mocked HTTP 409, the queue drops/refetches the conflicting item and returns normal actions without the expected explicit **Try again** button. Confirm the intended conflict-recovery UX against SCRUM-244/273 and resolve the expectation with independent review; no silent test rewrite was made.

The real production browser scenario verifies actual password and 2FA, authenticated GET today, Start/End, pickup/drop-off/not-present, reload persistence, real sharing/location/withdrawal requests and Parent LIVE response, role denial and 360px/no crashes. Device GPS is simulated; no business response is mocked. The advancing browser test clock matches the isolated Monday school clock, retaining real queue date validation. This is now **accepted source**, not merely an unmerged candidate. It does not certify physical phone GPS or the full offline/reconnect/reload/cross-tab matrix.

Added **review-driver-integrated.mjs** and a dedicated PostgreSQL browser CI job selecting the existing scenario directly from this branch. The shared run.mjs and historical read-only review-driver.mjs remain unchanged; the 65 normal cases still fail normally where required. Current-head CI must be read after push and is expected to retain the two acceptance failures.

Evidence is ignored under tmp/SCRUM-250-20261117-accepted/ and preserved e2e-artifacts histories. No logs, credentials, generated artifacts or detached review overlays are committed. Historical sections below retain their original source/date. **Keep #148 Draft and not merge-ready** until the two pending/conflict UX expectations are resolved, all acceptance checks pass and independent review is complete. No Jira/Draft status changes or merges were performed.

## 16 November 2026 — new driver replay flow and real browser verification

### Source preservation and harness updates

Normally merged accepted develop **cc6783f96bcea48c42c06c3afff6084e1121eee1**. All **65 independent acceptance scenarios** remain present; no skip, expected-failure marker or relaxed acceptance outcome was added. No teammate source/branch was edited. Fresh detached checkouts retain each review attempt; tracked production files stayed clean.

PR #144 moved from e3ec666 to **d1ad8229318b77562472fe4b698143180c24ac0a** during this session. Its real Today/replay flow adds App Router access and durable storage on every tap. Standalone suites now supply framework router context; the confirmation component spy observes the new public replay adapter as well as the old direct adapter. Fixture dates match the run's date and local storage is cleared between cases. The all-absent assertion still requires the same completion wording and `role=status`, now scoped correctly alongside the additional queue status. The duplicate dispatch assertion awaits asynchronous durable storage and still requires exactly one API call; pending/retry assertions remain unchanged.

### Exact results

- Accepted develop/default branch final focused run: **64 passed / 1 failed** (65). Failure: production Driver Today still imports `getDriverTodaySample`/`confirmStudentSample` and never calls the real `/api/driver/runs/today` endpoint. This remains a genuine delivery blocker.
- Accepted full frontend regression: **826 passed / 1 failed**, plus 1 existing expected failure and 6 existing skips (834 total). Same real-endpoint failure. Final-head hosted CI is checked separately after push.
- Latest #144 candidate, after harness isolation: **63 passed / 2 failed** (65), preserved in `driver-latest-final.log`:
  1. **prevents duplicate confirmations while leaving other students actionable**: the one-call assertion passes, but the queue's projected pending pickup removes `Not present` rather than rendering that control disabled as the existing acceptance test expects.
  2. **keeps a failed confirmation scoped to its student and retries the same status**: after HTTP 409/refetch the row shows the error and normal action controls, but no explicit `Try again` control expected by the existing test.
- These are observable **acceptance/UX differences**, not proof that duplicate submissions or backend 409 handling are defective. SCRUM-244 requires no double submission and a retryable plain error; SCRUM-273/263 adds queued projection and dropping/refetching stale 409s. Majd/independent review must resolve the intended pending/retry interaction without blind unsafe replay. The two failures were retained, not hidden to get green CI.
- Before proper harness setup, new-head runs showed 35 router-provider failures, then 7 date/storage/adapter mismatches. Those intermediate logs remain preserved; they are not reported as 35/7 production defects. Historical e3ec666 **65/65** evidence remains dated to that older head.
- **Real browser against latest #144 and accepted PostgreSQL/Flyway backend: 1/1 passed**, `real-browser-aligned-clock.log`: real password/2FA, real GET Today, consent/location/withdrawal and Parent LIVE, Start/End, pickup/drop-off/not-present PUTs, reload persistence, role denial and 360px without crashes/overflow. Device GPS is a browser fixture; production responses are real. This test does not certify offline reconnect or physical GPS.
- The initial real-browser attempt timed out before the pickup PUT: backend WeekdayE2eClock used November 2 while browser Date was November 16, so the new durable queue correctly withheld an earlier-day item. The test browser now uses an advancing clock aligned with the isolated backend; all original HTTP/state/privacy/layout assertions pass. No production clock/code was changed; the initial timeout trace is retained.
- Final ESLint: passed. Production build: passed. Final standalone TypeScript: the same **13 diagnostics as fresh develop**, no introduced diagnostic. `git diff --check`: passed. Local standalone junction-copy warning remains disclosed.
- New ignored evidence: `tmp/SCRUM-250-20261116/`, isolated candidate checkouts and their ignored E2E artifacts. No secrets, traces, mail logs or generated credentials are committed.

### Completion blockers

Keep #148 Draft. #144 is still unmerged/Draft; accepted develop remains sample-backed. Resolve the two pending/retry acceptance differences with the feature owner, complete independent review/integration of #144, then rerun all 65 and full regression on accepted source with no candidate override. Real browser success on the candidate does not remove the accepted-source endpoint failure. No Jira status was changed.


## Fresh readiness audit — 15 November 2026

#144 is now marked Ready, but its head is still `e3ec66670324a77edfe014dec7a00f18ee39ac3c`; the production replay adapter remains null and no formal approval exists. Develop is unchanged at `3798b40`. The existing #148 branch already contains it, so no redundant merge or feature edit was made.

Re-executed all original independent driver acceptance cases against the exact tracked-clean candidate: **65 passed / 0 failed**. Fresh log: ignored `tmp/SCRUM-250-20261115-review/candidate-65.log`. The same accepted-source endpoint gate remains a genuine failure (64/65; full 826 pass/1 fail in current-head CI before this report update), because the accepted Driver Today screen still uses sample data. No assertion, skip or expected-failure marker changed.

The new SCRUM-279 test now runs this actual candidate driver UI and the production Parent UI together against the same accepted PostgreSQL/Flyway backend. It verifies actual login/2FA, UI Start/Share/Stop, real consent/location APIs, Parent Leaflet/ETA, withdrawal, child switching, roles and both 360px layouts. Browser GPS is simulated; this is not offline replay, physical-GPS or feature-merge certification. Evidence and a live-head guard are on #149; #150 preserves the combined GPS/Inbox interface. The original 65 tests are not replaced by that new test.

**Review/completion:** the independent tests can be inspected, but #148 remains blocked for complete acceptance until the real client is integrated into develop. Ask Majd to finish #144's replay/auth-expiry/reconnect/phone work and obtain review. Its Ready flag does not resolve those requirements. Keep #148 Draft; changing Ready requires Wassim's explicit approval. No teammate branch, Jira status or PR merge was changed.


## Latest develop and preserved driver acceptance — 15 November 2026

Normally merged accepted develop `3798b40d2364a738f29dbf2c1d33bbaa1cd9601c` into the existing test branch without conflicts/history rewriting. All original 65 assertions are byte-for-byte unchanged relative to preserved `a09c3bd`; no feature implementation was copied or edited. All prior reports and evidence remain. The accepted backend now includes GPS, ETA, idempotent replay and reassignment (Flyway V1–V14).

| Executed check | Result |
| --- | --- |
| Original 65 acceptance tests on current branch / accepted feature source | **64 passed / 1 genuine failure**: Driver Today does not call GET `/api/driver/runs/today` |
| Same 65 on exact unchanged #144 head `e3ec66670324a77edfe014dec7a00f18ee39ac3c` | **65 passed / 0 failed** |
| Full frontend regression on current test branch | **826 passed / 1 genuine failure**, 1 existing expected failure, 6 existing skips (834 tests; 60 files) |
| ESLint / production build / git diff --check | Passed |
| Standalone TypeScript | Exit 2: same **13 develop baseline diagnostics**, zero introduced |
| Real browser: exact #144 frontend + accepted `3798b40` backend | **1 passed**, launcher exit 0, fresh PostgreSQL/Flyway |

The real browser used actual password/2FA, authenticated GET Today, start/pickup/drop-off/not-present/end, reload persistence, browser-simulated GPS with real consent/location APIs and Parent LIVE/withdrawal, role denial, 360px/no overflow and no page crashes. The original candidate source remains tracked-clean; a generated test-only launcher selects the accepted backend, while test overlays and the ticking weekday clock remain isolated. This verifies a candidate implementation, not the production sample client, physical phone GPS or the still-null replay adapter. The generated candidate build again emits the previously documented Windows standalone/junction EPERM tracing warning; it exits 0 and the production Next server/browser scenario passes, so a standalone deployment is not certified by this run.

The one normal branch failure is preserved at `real-endpoint.independent.test.tsx:23`: accepted Driver Today still imports sample-run data instead of invoking the real endpoint. It is neither skipped nor converted to an expected failure. #144 has that real wiring but remains an unfinished draft with `confirmationReplayApi = null` and outstanding auth-expiry/phone/reconnect acceptance. Its backend dependencies are now merged; Majd must finish and independently verify the feature in his own branch. The tester does not hide the delivery failure or extract/modify that feature to turn tests green.

Evidence: ignored `tmp/SCRUM-250-20261115/` (candidate-65, current focused/full regression, lint/build/typecheck/baseline comparison, real-browser log and exit). Historical evidence and unchanged tests remain. Hosted frontend CI should continue to fail the genuine endpoint gate until the production feature is accepted; check the updated head directly rather than infer success from candidate results.

**Readiness: keep #148 a draft.** Finish/review/accept #144, update this test branch normally, rerun all 65 on actual HEAD plus full regression/lint/build/browser/CI, then obtain independent review. No teammate source or branch, Jira status, assertions or skips were changed; no PR was merged.


## Accepted Inbox/backend refresh and independent retest — 14 November 2026

Merged accepted develop `5da9d2c2f9b829747c47571dfb541d32a1f6aa64` into the existing #148 branch. All **65 original independent acceptance tests and assertions remain unchanged**. Latest #144 is still a draft at `e3ec66670324a77edfe014dec7a00f18ee39ac3c`.

| Executed check | Actual result |
| --- | --- |
| Original 65 cases on exact latest #144 | **65 passed / 0 failed / 0 skipped** |
| Full accepted-source regression | **816 passed / 1 genuine real-endpoint failure / 1 existing expected failure / 6 existing skips** (824; 59 files) |
| ESLint / production build | Passed |
| Standalone TypeScript | Exactly 13 current accepted-develop diagnostics; zero introduced |
| Exact #144 frontend + accepted 5da9d2c backend, real PostgreSQL/Flyway/Chromium | **1 passed**, runner exit 0 |

Real browser verification retained actual password/2FA, GET today/start/confirm/end, pickup/drop-off/not-present persistence after reload, real GPS consent/location body and parent LIVE/withdrawal, wrong-role denial and 360px/no crashes. Both candidate and accepted-backend tracked source remained unchanged. No mocked business responses or feature merge.

The review runner now safely overlays our small test-classpath-only ticking Monday school-clock source into the detached backend if absent, refuses differing existing content/tracked edits, and passes it as an explicit test source. This allows a real run scenario on a Saturday rather than skipping the production holiday. Auth/JWT still use real time; the tested school date is controlled (2026-11-02), not a claim of real Nov 14 activity. The same support is used by our GPS/Inbox browser suites. Content-derived overlay names preserve earlier test/launcher versions. The Windows candidate build emitted a standalone symlink-copy warning; it exited successfully and the actual Next production server/browser scenario passed. This is not standalone deployment certification.

**Remaining genuine failure:** accepted Driver Today still uses sample runs, so the request-based `/api/driver/runs/today` test remains red. Majd must finish/accept #144's real-client integration and its outstanding phone/auth/offline work. Replay #155 has advanced to `9eaaca7c545d88062f27bc5c3a0b2bab6e062266` but is unmerged; the frontend replay client remains null. After integration, rerun the same 65 cases and required CI on HEAD. Keep #148 a draft. No teammate branch/code or Jira status changed; no PR merged.

Evidence: ignored `tmp/SCRUM-250-20261114/` and preserved candidate Playwright artifacts/history. The November 10/12 evidence remains historical and intact.


## Dependency refresh and independent review — 12 November 2026

Accepted develop `4cbfcc7172520e683366d6eaab482ff95015dba0` includes #143 GPS. Reused the existing branch and all **65 independent acceptance tests**. No assertion or case was skipped, removed or weakened. The only fixture change adds `locationSharing: false` compatibly to the run factory for the candidate's additive Run field.

Latest driver candidate: draft #144 at `e3ec66670324a77edfe014dec7a00f18ee39ac3c`. Exact detached review checkout, all tracked production files unchanged. Candidate tests execute via the guarded test-only overlay; accepted backend `4cbfcc7` can now be selected separately. The launcher verifies it is a clean ancestor of origin/develop. Content-addressed review tests/launchers preserve previous overlay versions.

| Executed check | Actual result |
| --- | --- |
| All original acceptance cases on exact latest #144 | **65 passed / 0 failed / 0 skipped** (5 files) |
| Accepted-source full regression | **816 passed / 1 genuine real-endpoint failure / 1 pre-existing expected failure / 6 pre-existing skips** (824; 59 files) |
| ESLint / production build | Passed |
| Standalone TypeScript | Exactly 13 accepted-develop diagnostics; zero introduced |
| Actual PostgreSQL/browser run+GPS | **1 passed**, launcher exit 0; canonical real GPS and run clients verified |

Extended the real browser probe with explicit geolocation opt-in, actual PUT sharing Run flag, PUT location's canonical latitude/longitude/accuracy-only body, authenticated Parent LIVE read and immediate withdrawal to UNAVAILABLE, while retaining password+2FA, GET today, start/confirm/end, persistence, wrong-role checks, 360px and cleanup. Browser geolocation is an explicit browser fixture; server responses are real. It does not prove a physical phone, offline replay or an accepted frontend merge.

Preserved failed setup evidence: initial helper response-type error; occupied disposable PostgreSQL port; Chromium cannot read an empty 204 body via response.text(). Fixed test harness issues without changing production code or weakening status/payload assertions. Isolated native databases, generated credentials, mail logs and traces remain ignored.

Operations review independently verifies the body deadline and durable cross-tab queue fix on this #144 head. Its updated behavior-based regression tests still fail on the original defective heads. See SCRUM-282's current report.

**Still blocked on accepted integration:** develop's Driver Today still imports sample runs. Majd must finish #144's remaining production work, integrate accepted replay #155 once ready (the replay client is still null), verify authorization-expiry/phone/offline flows, obtain review and merge through repository rules. Only then rerun the same 65 tests on integrated HEAD and required CI, and complete #148. Candidate passes do not make this PR ready. Jira stays In Progress; #148 stays a draft.

The final browser source ran as an immutable content-addressed overlay in `SCRUM-250-PR144-review-20261112-v2`; candidate and accepted-backend tracked status remained clean before/after. Both real browser tests (driver candidate, separate Parent production test) applied all 10 Flyway migrations through V10. Generated credentials were cleaned up.

One full-regression attempt hit two Vitest worker-start timeouts under parallel local workload; the log is retained. With other full-suite runs finished, the complete rerun executed all 59 files/824 tests and retained only the genuine sample-client failure. No test timeout or assertion was weakened.

Evidence: ignored `tmp/SCRUM-250-20261112/` and the exact detached candidate's dated/archived Playwright artifacts; prior evidence preserved.


## Follow-up verification — 10 November 2026

Accepted base: develop `8d62167fe2439843187218cabc40419304bd8d40`, including merged SCRUM-249 / PR #147. Preserved this worktree/branch, all 65 independent acceptance cases, original commits and historical evidence. No Majd production change was modified or merged. PR #144 remains a draft at `d890429ab09e24869cf3d389c7bad3776927332a`.

| Executed check | Result |
| --- | --- |
| Original 65 cases on accepted develop | **64 passed / 1 failed / 0 skipped**: real-endpoint gate still fails |
| Full frontend regression on this branch plus accepted develop | **816 passed / 1 same failure / 1 existing expected failure / 6 existing skips (824; 59 files)** |
| Same 65 cases on isolated exact PR #144 | **65 passed / 0 failed / 0 skipped** |
| Real PostgreSQL/Flyway Chromium probe on exact PR #144 | **1 passed**; actual frontend, backend, login/2FA and driver actions |
| ESLint and production build on test branch | **Passed** |
| Isolated candidate production build | **Passed**, using the existing auth E2E runner |
| Standalone TypeScript | **13 existing develop diagnostics** (Admin invite fixtures, routing callback, Parent JSON enum inference); no SCRUM-250 diagnostic |

### How isolation and all 65 cases were preserved

Detached review checkout: `C:\Users\User\Desktop\Wassel-ticket-worktrees\SCRUM-250-PR144-review-20261110`. Its tracked files were clean before and after the check; the only additions are untracked independent tests/support and a separate generated test launcher. Its backend has no diff from accepted develop. Neither the active feature checkout nor Majd's branch was changed.

The component suites now share the same spies for legacy sample imports and real run-client imports. Standalone page cases receive only the authenticated-user hook normally provided by DriverLayout; the authorization suite still uses the actual RoleGuard. The separate real-endpoint gate does not mock runs, request(), or the sample client. Therefore baseline sample wiring still fails and the candidate's real HTTP wiring passes.

All original test titles and **106 assertion call sites** were compared to preserved commit `2c265ba7e467a3cb3d5cdc83b52dd04084d99d72` using the TypeScript syntax tree, allowing only the spy identifier rename. The final HTTP student visibility assertion now waits for the unchanged entrance animation, retaining `toBeVisible()` and the original timeout. The first candidate attempt's transient opacity failure is preserved separately. No assertion was removed, softened, skipped or marked expected-failure. The independent stop fixture includes `removedFromRoute: false` to satisfy both contract revisions.

### Real browser evidence and its limits

`driver-client-review.e2e.ts`, launched against the unchanged candidate, used the existing isolated auth/demo seed, native PostgreSQL, Flyway, the production Next frontend and real Spring APIs. No fetch interception, fake tokens or fabricated production responses were used.

Verified: Head and Driver real password/emailed-code authentication; a real Head-created route assigned to the seeded authenticated driver and two students; actual GET `/api/driver/runs/today`; POST Start; PUT Picked up, Dropped off and Not present; saved confirmations after a full reload; POST End persisted as FINISHED; authenticated Parent GET/Start denied with 403; actual route deletion cleanup (204); 360px document without horizontal overflow or browser crashes. The resulting 360px screenshot was inspected. Generated disposable credentials were removed by the runner. Backend seed, frontend production build and browser all completed successfully.

This is an **online run-client slice**, not GPS/offline/replay verification. It does not prove another driver's ownership boundary or a complete accessibility audit. The new GPS and replay clients in #144 are still null, so their unfinished behavior must not be called verified. Separate 65-case component/adapter coverage retains errors/retries, legal transitions, all-absent/no-run states, maps/tel and button/authorization criteria.

### Reproduce without changing feature code

Create a fresh detached review worktree at the exact candidate SHA and install its unchanged lockfile dependencies (or reuse a matching existing installation). The guarded test-only overlay refuses a wrong head, tracked changes, tracked target files or a different existing overlay; it never deletes a worktree or rewrites production files.

```powershell
node frontend/e2e/review-driver.mjs --checkout=C:/path/to/isolated-review --head=d890429ab09e24869cf3d389c7bad3776927332a --mode=unit
# Use the same documented E2E_POSTGRES_BIN, E2E_MAVEN_CMD and JAVA_HOME as the existing auth runner.
# Select an unused E2E_POSTGRES_PORT (this run used 55445).
node frontend/e2e/review-driver.mjs --checkout=C:/path/to/isolated-review --head=d890429ab09e24869cf3d389c7bad3776927332a --mode=browser
```

Browser mode adapts only the test-file selection in a separate untracked copy of the existing candidate's auth launcher. The original runner and production configuration remain untouched. The browser probe is explicitly selected by this review launcher; normal routing/auth/absence CI selection is unchanged.

Ignored evidence: this worktree's `tmp/SCRUM-250-20261110/{develop-65.log,full-develop.log,candidate-browser.log,assertion-preservation.json,lint.log,build.log,typecheck.log,results.json}`; isolated candidate's `tmp/SCRUM-250-20261110/{candidate-65.log,candidate-65-rerun.log}` and `frontend/e2e-artifacts/` (including the inspected screenshot). Raw auth logs/traces, generated databases and credentials are not committed or uploaded.

### Exact remaining work for Majd

1. Deliver the already working real run-client wiring to accepted develop: replace page sample Today/confirmation imports and RunAction sample Start/End imports with `runs.ts`, remove the production sample source and honor the current run contract, including removed stops. A separately completed minimal wiring change could unblock Sprint 3 without treating unfinished GPS work as ready. This testing branch does not make that production edit.
2. Before #144 is ready, fix SCRUM-282's two reproduced driver defects: keep request deadlines active through body consumption and prevent cross-tab queue read/write loss. Preserve both failing regression tests.
3. Reconcile the proposed GPS/replay interfaces with accepted SCRUM-261/263 contracts, wire real authenticated clients, and verify consent, permission denial, reconnect/idempotent replay, authorization/session expiry and reload/account isolation on real backend/mobile flows. Those dependencies remain unfinished.
4. Integrate with latest develop, pass the same 65 cases and full CI on the actual integrated head, obtain independent review, and only then complete SCRUM-250. PR #148 remains a blocked draft and Jira remains In Progress while develop still fails the endpoint gate. No feature or blocked test PR was merged.


## Current-source verification — 9 November 2026

Reused the existing branch/test files and merged current develop 8a249e8 without rewriting any preserved commit or changing Majd's production source. The former feature stack PRs #89/#93/#103 are merged. Their run screen/actions still use runs.sample.ts on develop. PR #144 contains real endpoint wiring but remains an unfinished draft and is not an accepted integration base.

- Exact five independent suites: **64 passed, 1 failed, 0 skipped (65 total)**. The failure remains the unmocked GET /api/driver/runs/today completion gate. Onboard warning, all maps/call cases, transitions, absent/all-absent stops, retry and frontend authorization pass. No failing test is skipped or marked expected-failure.
- Full frontend regression: **773 passed, 1 failed (same gate), 1 existing expected failure, 6 existing skipped (781 total, 56 files)**. The broader independent-only command also ran: 146 pass/1 same failure/1 existing expected failure (148 total).
- ESLint and production build: **passed**. Standalone type checking is recorded separately against the known develop baseline; an initial concurrent build/typecheck collided with transient generated .next/types files and is not a source defect.
- New real-backend driver action E2E remains **blocked/unverified**, because the screen still bypasses the real client. Historical fixture-only mobile evidence below is preserved and is not relabelled as a current real-backend pass.

Evidence is ignored under tmp/SCRUM-250-20261109. The final diff contains only the original seven independent test/helper/report files. A blocked draft PR is permitted by the current execution request so the genuine failing gate can be reviewed in CI. Keep Jira In Progress and do not merge or mark complete until Majd finishes real client wiring/sample removal, the unchanged gate passes, and real backend/mobile regression is verified. Historical no-push/no-partial-PR restrictions below describe earlier sessions; the current request explicitly permits clearly blocked drafts.

## Current independent verification — 3 November 2026

Preserved the original seven test/report files first in local snapshot 2f958fa. Updated only the test branch by merging exact PR #103 head d11b762fb726c2c8825b6c544a44cadd48c87df5 and PR #93's later approved fix f525a8a1952ed0fe99bd5d47b23f3b1375f1db42. Correct stack: #103 → #93 → #89 → develop. PR #89 still conflicts with current develop. No Majd production implementation was edited by the tester.

**Independent suite: 64 passed, 1 failed, 0 skips (65 total).** The unchanged onboard-child End Run warning now passes with the approved fix; all nine maps/call cases pass. The remaining reproducible failure is real-endpoint integration: the page still imports getDriverTodaySample/confirmStudentSample and RunAction still imports sample start/end calls, so an unmocked screen never GETs /api/driver/runs/today. Backend SCRUM-233/234/235/239 is now merged; this is an outstanding feature criterion, not an unavailable backend excuse. Findings are posted on #89 and #93. No expected-failure annotation, skip or weakened assertion was added.

Maps/call test locators were adapted to the feature's valid descriptive accessible names ("Open directions to [name]'s stop" and "Call [name]'s parent"); coordinate, zero-coordinate, missing/partial pin, phone, empty-phone, keyboard and >=44px assertions are unchanged. Initial locator mismatches and a resource-starved authorization timeout are retained in earlier logs; the bounded rerun passes authorization and all link cases. No product defect was claimed for the descriptive labels.

**Full regression: 605 passed, 1 failed (the same real-endpoint gate), 7 existing skipped**, 44 files. ESLint and serial production build passed. An earlier build was stopped only to relieve local memory pressure; its logs remain preserved. A Chromium 360px production-frontend UI check passed actual maps/tel hrefs, coordinates, >=44px geometry, keyboard focus, no horizontal overflow or page errors. The settled-animation screenshot was inspected. This browser check used an explicit session fixture and the feature's existing sample run source; it is **not** real backend E2E. Earlier animation-in-progress screenshots are retained.

Ignored evidence: tmp/SCRUM-250-final/{independent-bounded.log,full-regression.log,lint.log,build-serial.log,mobile-check-settled-final.log,driver-360px-settled.png}. PR #103's exact two-file diff was reviewed and a formal COMMENT review posted; no automatic approval/merge. Existing P1 warning feedback on #93 was confirmed fixed, while the real-endpoint criterion remains explicitly open.

Remaining: Majd must wire the real authenticated run client, remove the sample source, account for the current contract (including removedFromRoute), reconcile the stack with develop and pass feature checks/review. Retest the unchanged independent real-endpoint gate and actual browser/backend actions when available. Then transplant only the seven independent test/support/report files onto the accepted merged feature base, refresh all checks and submit a complete develop test PR. Until then keep SCRUM-250 In Progress, local and preserved; do not submit inherited unmerged feature code as a test PR. No teammate Jira status changed.

## Historical verification — 30 October 2026

Date: 2026-10-30, Asia/Beirut. Tester: Wassim Fawaz, independent of the feature author.

## Status and source

**In Progress; blocked by a reproduced feature defect and missing dependencies.** No SCRUM-250 commit, push, PR, approval, or merge was performed. No failing test was skipped, marked expected-failure, or weakened. No production code or teammate Jira status was changed.

| Dependency | Reviewed source / status |
|---|---|
| [SCRUM-243 / PR #89](https://github.com/Wassel-CMPS271/Wassel/pull/89) | Open to develop; `cc6a97c94520cbc36a4961a553f66427935b0063` |
| [SCRUM-244 / PR #93](https://github.com/Wassel-CMPS271/Wassel/pull/93) | Open, stacked on #89; `28025143de4a19e1042eb62705218d5ddf475711` |
| SCRUM-245 | Jira To Do; no implementation branch or PR found |
| [SCRUM-233 / PR #90](https://github.com/Wassel-CMPS271/Wassel/pull/90) | Open; daily runs not merged |
| [SCRUM-234 / PR #94](https://github.com/Wassel-CMPS271/Wassel/pull/94) | Open, stacked on #90; start/end not merged |
| SCRUM-235 / SCRUM-239 | Jira To Do; real confirmations / absence flags pending |

Worktree: `C:\Users\User\.codex\worktrees\scrum-250-driver-tests\Wassel`. Branch: `test/SCRUM-250-driver-screen-tests`, created at PR #93's exact head. #93 was reviewed against #89 rather than treating its inherited changes as a standalone develop diff. Existing worktrees, branches, stashes, and recovered evidence were preserved. Root instructions and frontend/CLAUDE.md were read; app-level AGENTS.md files were absent.

This is a provisional testing base. Once dependencies merge, transplant **only** the independent tests and report onto the merged develop implementation. Do not submit Majd's unmerged feature commits as a test PR.

## Method

Jira criteria were retrieved before feature code was inspected. Expected behavior comes from SCRUM-243/244/245 and docs/contracts/runs.md, not production rule helpers or the author's assertions. `driverContract.ts` builds independent inputs. The UI suites replace only the current sample-client boundary; page, StopCard, RunAction, transition helpers, layout and RoleGuard remain real. A separate unmocked-screen fetch test deliberately exposes the outstanding real-endpoint gate. HTTP adapter tests use real request() with stubbed fetch and check session cookies, methods, JSON bodies, server errors and retry. Passing adapter tests do not prove the screen is wired to them.

Real animation visibility is awaited, rather than removed from assertions. No timeouts were increased. Maps destination checks allow standard Google/Apple/OSM/native links rather than requiring the example provider in Jira.

## Acceptance coverage

| Criterion | Independent test / evidence | Result |
|---|---|---|
| 243: next morning/afternoon run, ordered students | first unfinished run, ordered names, all-finished state | Pass |
| 243: highlighted next stop and done stops | next/done rows; morning versus afternoon confirmation semantics | Pass |
| 243: absent and all-absent stop | skip, confirmation overrides absence, all-absent roster including siblings at one address | Pass |
| 243: no run and loading | holiday, SCHOOL_DAY/HALF_DAY without route, unresolved load | Pass |
| 243: 360px usability | narrow-viewport action test; actual production Chromium layout/keyboard check | Pass for current screen/sample |
| 243: real endpoint, sample deleted | real-endpoint.independent.test.tsx requires an actual GET and renders its response | **Fail: provisional sample wiring** |
| 244: Start/End only when legal | NOT_STARTED / IN_PROGRESS / FINISHED matrix | Pass |
| 244: student buttons and >=44px targets | legal confirmation matrix; absent child pickup; computed sizes | Pass |
| 244: updates without reload | start/pickup/dropoff/end lifecycle, Not present advances next stop, one day load | Pass |
| 244: plain errors and retry | failed start/end/student confirmation, generic 5xx versus server detail | Pass |
| 244: no double-submit | deferred requests and repeated taps; other students remain enabled | Pass |
| 244: real mutation endpoints, no samples | runs.ts adapter contract passes; feature still imports sample actions | **Blocked: integration pending** |
| Contract: warn when children remain onboard | morning pickedUp=1, droppedOff=0 must confirm before ending | **Fail: product defect** |
| Concurrent confirmations | out-of-order successful replies preserve both displayed students | Pass |
| Role-based visibility | actual driver layout/RoleGuard: pending auth, DRIVER, other three roles, 401, outage | Pass (frontend only) |
| 245: maps at stop coordinates | positive destination and valid zero-coordinate cases | **Fail: implementation absent** |
| 245: call the guardian | actual tel link from this student's phone | **Fail: implementation absent** |
| 245: hide unavailable links | partial/missing coordinates, empty/whitespace phone | Assertions pass; overall feature remains unverified without positive cases |
| 245: tappable links | native focusable maps/call links with >=44px minimum height | **Fail: implementation absent** |

Suites: `driver.independent.test.tsx` (35), `maps-call.independent.test.tsx` (9), `real-endpoint.independent.test.tsx` (1), `authorization.independent.test.tsx` (7), `runs.independent.test.ts` (13). UI files sit next to the driver page; the adapter suite sits next to runs.ts.

## Verification

| Check | Result |
|---|---|
| Final independent suites | **65 tests: 59 passed, 6 failed, none skipped** |
| Full frontend regression | **607 tests: 594 passed, 6 failed, 7 existing skipped**, 43 files |
| Existing tests outside new suites | **535 passed, 7 skipped, no failures** |
| ESLint, including final test revisions | Passed |
| Production npm run build | Passed |
| Standalone tsc --noEmit | Fails at pre-existing routing.independent.test.tsx:105 (TS2322); the baseline-only check reproduces the identical error with all SCRUM-250 files excluded |
| git diff --check | Passed; new-file whitespace checked separately |
| Actual 360px Chromium | Passed: viewport/document both 360px, all seven driver action targets 44px tall and in bounds, no browser errors, confirm focus and Escape behavior correct |
| New SCRUM-250 GitHub CI run | Not submitted while acceptance tests fail and dependencies are missing |

The six failures are exactly the onboard warning, maps destination, zero-coordinate maps, guardian tel link, maps/call touch targets, and real HTTP screen gate. The first test-development run also caught transient opacity-zero assertions; awaiting actual entrance visibility corrected those harness issues while preserving the six real acceptance failures. No feature assertion was weakened.

The supplemental browser check uses the production build and real components with only /api/auth/me intercepted. The screen's existing sample client remains visible as a delivery gap. It does not prove real login/backend integration, all possible long strings, or future maps/call layout. Local evidence is in ignored `tmp/SCRUM-250/`: independent/regression JSON and logs, lint/build/typecheck logs, mobile metrics, screenshot and script. The browser script uses existing Playwright from the preserved SCRUM-230 worktree; no package or CI dependency was added. Its owned local server was stopped after the check.

## Defects and reviews

**D1 — Onboard-child end warning.** RunAction's unconfirmedCount only counts next/pending stops. Morning PICKED_UP stops are already done, so a run with all children picked up and none dropped off ends immediately, contradicting the contract's counts-based warning. Posted [REQUEST_CHANGES on #93](https://github.com/Wassel-CMPS271/Wassel/pull/93#pullrequestreview-5711466760), anchored to RunAction.tsx line 27. The author should include children onboard (`pickedUp - droppedOff > 0`) while preserving the all-absent/no-onboard case. The existing feature test `ends a run with every stop done straight away, without asking` uses PICKED_UP stops and also needs reconciliation by the feature owner; it was not edited.

**D2 — Maps/call missing.** SCRUM-245 is not implemented in the available stack; four positive/link-size tests fail. The blocker is recorded on SCRUM-250, not fabricated as a defect on a different feature PR.

**D3 — Real screen integration pending.** The unmocked page makes zero /api/driver/runs/today calls and its mutations use samples. This is provisionally allowed while backend dependencies are unmerged, but fails final completion. Posted a [COMMENT review on #89](https://github.com/Wassel-CMPS271/Wassel/pull/89#pullrequestreview-5711467600) documenting the follow-up without approving or merging.

**Baseline type error.** Existing SCRUM-229 test line 105 assigns a callback inferred as void to a Handler requiring Response, Promise<Response>, or undefined. No SCRUM-250 file is reported by tsc. A temporary config excluded only the new tests/fixture without moving files or modifying project configuration; it exited 2 with the identical TS2322 at the same existing line (`typecheck-baseline.log`). The existing routing test is left unchanged.

## CI and next steps

Existing frontend-build runs npm test with default Vitest discovery, which includes these five new suites. No CI filter/config change is needed. Current feature CI was green: [#89](https://github.com/Wassel-CMPS271/Wassel/actions/runs/40884567459), [#93](https://github.com/Wassel-CMPS271/Wassel/actions/runs/40953904014), [#90](https://github.com/Wassel-CMPS271/Wassel/actions/runs/40898529742), [#94](https://github.com/Wassel-CMPS271/Wassel/actions/runs/40965248082). #93 targets #89's branch, so its current run is a push run; pull_request filters name develop/main. These green runs do not include the new independent tests.

From frontend: `npm ci`, `npm test -- --maxWorkers=2`, `npm run lint`, `npm run build`. For only independent tests, pass the five suite paths to npm test after `--`. Two workers only bound local resource use; no assertions, retry policy or timeouts change.

Completion requires: D1 fixed by the feature owner; SCRUM-245 available and passing; real SCRUM-233/234/235/239 integration and sample removal; baseline typecheck issue resolved or explicitly handled by its owner; rebase only independent changes onto merged develop; rerun full verification; then commit, push, create a regular develop PR, request an independent reviewer, verify its CI and move SCRUM-250 to In Review. Done requires a merged, satisfied PR. SCRUM-250 remains In Progress with the blockers recorded.
