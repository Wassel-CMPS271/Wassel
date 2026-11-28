# SCRUM-282 — Independent operations UI tests

## 28 November 2026 — review fixes: normal imports and real clients

Addressed Majd's 26 November **CHANGES_REQUESTED** review on existing PR #151. Driver #144, roster/address #142 and live-control #168 are already merged. Latest inspected `origin/develop` is **f29b72ec69b4c22389c7a3b9b2d77d06a426f757**; its operations production modules match this branch. The branch started clean at **a8488b752d80e2526488efeb52fb05d0c5bb4d21**. No develop/feature PR was merged during this work, and no teammate production code, branch, Jira status or review decision was changed.

### Corrected independent tests

- Deleted `operationsCandidate.ts` and all candidate selectors, Git subprocesses, dynamic compilation and copied API interfaces. All six suites use ordinary imports of current working-tree modules and public DTO types. `operationsContract.ts` supplies typed test fixtures/HTTP helpers only; it supplies no business API implementation.
- Roster decisions, GPS permission/sharing/position submission and Admin authentication/logout now exercise the real authenticated clients and `request()` through stubbed **fetch**, rather than replacing client methods. Exact methods, paths, cookie credentials, payloads and no supplied ownership are asserted.
- Kept durable keys, cross-tab interleaving, account isolation, deadline-through-response-body, delayed-conflict draft and navigation/privacy assertions. Added specific UI/client recovery checks for 400, 401, 403, 404, 409 and 422, explicit retry versus no blind resubmission, and no false success. Network/5xx decisions retain the row; transient replay retries retain the same key. Added actual GPS position-wire coverage.
- Fixed the reassignment tautology: assertions inspect the **returned server receipt**, its driver/counts and the unchanged source driver. API-only error cases are named as propagation checks, not UI recovery coverage. History uses the full public DTO.
- Removed the incorrect oracle that treated exclusion of every `NOT_STARTED` run as an accepted requirement. The test still checks active location joins and exclusion of finished runs; missing not-started/late behavior is explicitly recorded as incomplete in [the feature-owner blocker report](SCRUM-274-feature-blockers.md), not counted as passing acceptance.

The former 58-case available slice now has **71 independent cases** (13 added): queue/state 16, GPS permission/transport 5, roster 13, address client 10, live control/client 20, Admin 7. No failure was skipped, deleted, marked expected-failure or weakened to manufacture a pass. The invalid fixture-to-fixture and missing-feature oracles above were corrected explicitly.

### Executed bounded verification

| Check | Actual result |
| --- | --- |
| Rewritten independent suites + safe-reporter regression | **72 passed / 0 failed / 0 skipped**, 7 files, exit 0, 25.33 seconds (71 acceptance + 1 evidence/privacy test) |
| Current-source snapshot before the reporter-only compatibility fix, in a separate directory with **no `.git` or Git ancestor** | **72 passed / 0 failed / 0 skipped**, 7 files, exit 0, 19.99 seconds; `git rev-parse` fails there as expected |
| Focused ESLint on all changed tests, fixture and test runner/reporter | Passed after fixing the introduced const/unused-import findings |
| TypeScript `--noEmit --incremental false` | **Fails on 13 existing diagnostics** in unrelated Admin invitation/routing/Parent test fixtures; baseline HEAD archive and changed branch output are byte-identical (SHA-256 `F79F114CA0A883EE654B80CD15AA8D1025F15E42AE7447CDA583B4AEAB372F26`), **0 introduced diagnostics**. The new GPS DOM fixture typing was corrected. |
| Playwright compilation/discovery | **2 scenarios collected**, exit 0: address decisions and offline replay. Discovery is not browser execution. |

The 422 rejection diagnostic in the unit log is an expected exercised error path, not a failing test. Full frontend coverage/build, Maven and real database/browser execution are left to the normal current-head CI runs rather than repeating the approximately ten-minute local regression for a test-only review fix. Their new results are **pending at this report commit** and must be read on the actual pushed SHA; the PR description will link those results after execution. Historical passes below are not new verification claims.

An additional check of the exact native Playwright reporter command caught a CommonJS/import.meta loading error in the newly added reporter. The reporter now obtains its root from Playwright's config file instead. The exact CLI now loads that reporter and collects **both scenarios**, exit 0; the final reporter privacy/path regression **1/1** and reporter/runner ESLint pass. The 71 independent acceptance files are unchanged by this compatibility fix. This was an own test-infrastructure defect, not a product or teammate test failure.

### CI review corrections

- Deleted duplicate `operations-independent.yml`. The unchanged required **frontend-build** gate still runs the **entire** frontend suite with the existing **86.6%** coverage floor and ordinary failure behavior; JSON results are now uploaded with this acceptance-scope report as `frontend-test-results` alongside the existing coverage artifact. No check ID, coverage floor or test selection was weakened.
- `operations-address-e2e.yml` now has explicit relevant path filters, no special test-branch push trigger, and retains PR-to-develop/develop-push/manual execution. Its real PostgreSQL job uses the new native `--suite=operations` in `e2e/run.mjs`; the source-patching `review-operations-address.mjs` wrapper is deleted. Other suites and existing wrapper markers are preserved.
- The operations browser artifact `operations-acceptance-evidence` contains only a whitelisted status/timing/test-name summary and this report. A regression checks that errors, stdout/stderr, attachments and credential sentinels cannot be serialized. Credentials, auth/mail/backend logs, raw traces, screenshots and video are not uploaded by this workflow. Prior safe summaries are archived before a new local run to prevent stale-success evidence.

### Completion blockers — keep Draft

The available tests are now reproducible against current source without Git. This does **not** complete missing SCRUM-274 behavior. Majd must expose supported `NOT_STARTED` reassignment and, with the backend/product owners, resolve the absent Head lateness contract/UI or obtain a formal scope split. Head live-control phone-width and real-backend reassignment acceptance also remain unverified. See the [precise owner actions](SCRUM-274-feature-blockers.md).

Keep PR #151 **Draft**, request re-review of these test fixes when appropriate, and do not mark the overall ticket complete based only on green available cases. Generated evidence remains ignored in main-repository `tmp/SCRUM-282-review-fixes-20261128/`; the initial archive and all earlier report sections are preserved. No PR was merged and no Jira/Draft status changed.



## 26 November 2026 — develop synchronization and push-CI fix

The earlier green PR workflow used GitHub's test merge with current develop, while push CI tested the older feature branch and failed 11 live-control delivery gates. At Wassim's explicit request, merged accepted develop **6d20edfa0ac82aad86a2eb2e43a26ef7d9c4a383** into the existing `test/SCRUM-282-operations-ui-tests` branch. Merge commit **794fedaa7738bd7e8ab97585ce318560233d0496** preserves both parents (`5cd9e83` and `6d20edf`); the merge completed without unresolved conflicts or a history rewrite. `liveRuns.ts` and the real `getRunLocations` export are now in the branch itself.

All six independent suites and their loader remain byte-identical to the preserved originals. Candidate overrides were cleared: the 58 tests use actual merged **HEAD**, not an archive, draft candidate or selected external ref. The merged source tree `626ad43395102f5be39e2794f9dca6b7667029c2` exactly matches the previous green PR test merge `480f67a`, confirming the push/PR source discrepancy is resolved. No compatibility change or assertion relaxation was necessary.

| Verification on merged branch | Actual result |
| --- | --- |
| All independent operations acceptance | **58 passed / 0 failed / 0 skipped**, 6 files, exit 0, 34.60 seconds |
| Complete frontend regression with V8 coverage | **1,878 passed / 0 failed / 1 existing expected failure / 5 existing skips**, 1,884 cases, all 115 files passed, exit 0, 573.01 seconds |
| Line coverage | **92.02% (4,663 / 5,067)**; unchanged required floor **86.6%** passed |
| Full frontend ESLint | Passed, exit 0 |
| Production build | Passed, exit 0; known local Windows standalone tracing/symlink EPERM warning retained in the log |
| `git diff --check` / independent-suite SHA-256 checks | Passed; no original test or loader changed |

No test was removed, newly skipped, marked expected-failure or weakened. The expected-failure and five skips above are existing develop tests whose declarations were not edited. Existing React `act(...)` and jsdom navigation notices are preserved in the raw full-run log. The production implementation matches accepted develop; the PR diff contains only SCRUM-282 infrastructure, independent tests and reports. No teammate branch or Jira status was modified, and PR #151 was not merged into develop.

Before this synchronization, shared [push CI 45768064262](https://github.com/Wassel-CMPS271/Wassel/actions/runs/45768064262) failed, while shared [PR CI 45768072583](https://github.com/Wassel-CMPS271/Wassel/actions/runs/45768072583) passed. The corresponding PR independent operations jobs and both real address/replay browser scenarios also passed; those runs used the earlier PR integration checkout and are not claimed as new runs for this merge. Following publication of this report, inspect the new **push** and **pull_request** workflows separately on the actual new branch head. Their results were not available at report commit time; no queued or unexecuted check is counted as passed here.

**Remaining acceptance scope:** the push-CI missing-module cause is fixed. Keep #151 Draft while the documented SCRUM-274 Head late/not-started API/UI requirement is unresolved (accepted code still has `serverLateFlag: null`, with no recorded scope deferral), and until required current-head CI and remaining real live-control/reassignment acceptance are verified. GPS freshness or a parent LATE Inbox entry must not be used to invent a Head lateness contract. No Jira status, Draft status or merge permission was bypassed.

Preserved ignored evidence: main repository `tmp/SCRUM-282-sync-20261126/`, containing the original-suite hash manifest, `independent-58.log` / `.json`, `frontend-coverage.log` / `.json`, coverage summary, `frontend-lint.log`, and `frontend-build.log`. Generated coverage/build artifacts and credentials are excluded from the commit. Earlier report sections retain their original source/date and are superseded by this branch-integration result where applicable.

## 26 November 2026 — merged live-control verification and CI refresh

### Current source and dependency status

Verified latest `develop` **6d20edfa0ac82aad86a2eb2e43a26ef7d9c4a383**. Driver #144, roster/address #142 and live-control **#168 are merged**. Jira lists SCRUM-273/274/275 as Done; SCRUM-282 remains In Progress and was not changed. #168's merged head is `0e336a939bc663aaea9677c87d1c345f25848880`. This resolves the former unmerged live-control UI/client dependency, not every SCRUM-274 acceptance criterion.

The existing SCRUM-282 worktree was clean at **0df221fe7d1cae87992af61987ea2b78e568ca90** before this work. All six independent suites and their test-only loader were preserved byte-for-byte, verified by SHA-256 before and after execution. Tests ran in an isolated archive of latest develop with only this branch's independent suites/loader added. The Git-source loader's three candidate selectors were explicitly pinned to the accepted develop SHA above; no draft implementation or moving feature branch was selected. The matching package lock was checked before dependency reuse. No teammate source, branch, Jira status or PR was modified or merged.

### Executed checks

| Check on latest develop | Actual result |
| --- | --- |
| All existing independent operations acceptance | **58 passed / 0 failed / 0 skipped**, 6 files, exit 0, 52.72 seconds |
| Original Driver/GPS/queue, roster/address client and Admin slice | **39/39 passed** |
| Live-control independent slice, now on merged source | **19/19 passed**; all 11 former missing-feature gates resolved on this source |
| Existing live-control page/polling/reassignment/view/freshness regressions | **170 passed / 0 failed**, 8 files, exit 0, 57.14 seconds |
| Existing waiting-tap and page queue regressions | **44 passed / 0 failed**, 2 files, exit 0, 29.85 seconds |
| Focused ESLint: independent suites, helper and both operations E2E specs | Passed, exit 0 |
| Playwright discovery/compilation of address and replay specs | **2 scenarios discovered**, exit 0; browser scenarios were **not executed** |
| Workflow YAML / preservation checks | Passed; both CI jobs and all acceptance commands retained; obsolete draft selector removed |
| `git diff --check` and static ignore-rule conflict comparison | Passed |

Total executed unit/component cases: **272 passed / 0 failed**. Existing React `act(...)` warnings remain recorded in raw logs. Full frontend regression, coverage, production build, Maven and real database/browser execution were deliberately not rerun for this bounded recheck. Earlier PostgreSQL/Flyway/browser passes below remain historical; no fresh browser or CI success is inferred from unit tests or discovery.

### Changes owned by this PR

- `.github/workflows/operations-independent.yml`: removed the obsolete fetch and override for draft `ce147844`; the live-control job now tests the actual checkout (`HEAD`), like the normal frontend integration gate. Both existing jobs remain, with the same 39 + 19 cases and ordinary failure behavior. No checks were disabled and no missing integration was hidden with a candidate override.
- `frontend/.gitignore`: preserved all accepted Inbox/GPS/dual-UI generated-launcher exclusions and this branch's address-launcher exclusion. The only previously observed branch content conflict was the competing end-of-file additions here; separating the own rule from those additions gives a clean read-only three-way file comparison. No branch merge or history rewrite was performed.
- `frontend/e2e/operations-replay.e2e.ts`: corrected the obsolete offline presentation expectation to merged SCRUM-298 and `docs/contracts/driver-gps-offline.md`'s network-error status mapping: **Saved on phone**, with **no Couldn't send / Try again** for a tap that received no answer. Retained every durable-key, unchanged-server, reconnect/reload, confirmation timestamp, count, Inbox deduplication, authentication, cleanup and 360px assertion. The 44 supporting production regression cases pass; Playwright can collect both scenarios. A fresh real-stack replay run is still required before claiming this browser correction is runtime-verified.
- This report: prepended current evidence without replacing any historical results or failed exploratory evidence.

### CI and remaining completion blockers

Before this update, head `0df221f`'s [latest shared CI run 43992375359](https://github.com/Wassel-CMPS271/Wassel/actions/runs/43992375359) had green backend, authentication, absences and routing success/failure/cleanup jobs, but **frontend-build failed on the 11 then-missing live-control gates**. The earlier accepted-source/candidate and address/replay jobs were green. These are dated November 17 results, not results for the new commit. New push/PR checks must be read separately and must not be represented as passed while queued or running.

1. **Head late/not-started alerts remain missing.** SCRUM-274's Jira acceptance still requires real authorized active/late runs. Its merged PR explicitly says the late-run criterion is unmet, and accepted `liveRuns.ts` still reserves `serverLateFlag: null`. The contract forbids deriving lateness from GPS age or comparing planned and live times; parent LATE inbox events are not a Head API. SCRUM-274 has no Jira comments recording a scope deferral. The product/backend owners must supply an agreed Head lateness contract and implementation, followed by Majd's UI and independent tests, or formally approve and record a scope split. No field, passing assertion or product-owner approval was invented.
2. **Latest integration/browser evidence is incomplete.** This branch's application snapshot is still based on the older accepted develop; this task did not merge develop into it. The latest-develop archive proves the 58 unit/component gates now pass with the dependencies present. The actual PR integration checkout and current-head CI, fresh real live-control/reassignment acceptance, and the corrected address/replay browser scenario still need verification. Push-only runs on the older feature snapshot can continue to expose the missing live-control integration; do not confuse them with latest-develop archive results.
3. Physical phone GPS, a complete browser cross-tab/auth/conflict recovery matrix and deployed/real-school ownership evidence are not established by these unit checks. Offline cold app loading remains explicitly outside the accepted app-shell contract. Historical real address/replay evidence is retained with its original source and date.

**Readiness: keep PR #151 Draft; not complete or merge-ready.** The former missing merged modules are resolved on develop and the available 58 independent cases pass unchanged. Remaining acceptance scope and current integration evidence must be completed before Ready status or approval. No Jira/Draft status was changed and nothing was merged.

Ignored local evidence is preserved under the main repository's `tmp/SCRUM-282-20261126/`: pinned source archive, independent-suite hashes, JSON and raw logs for the 58/170/44 runs, lint and Playwright-discovery output, the original browser spec, and read-only conflict comparisons. No logs, browser artifacts, credentials, fixtures that affect production, or generated launchers are included in the commit.

## 17 November 2026 — merged Driver/roster, real address browser and live-control review

Accepted develop **ed4736d64b402a02cb30a3f1253a97109b4f3b7e** is merged normally. **Driver #144 and roster #142 are now merged**, so their prior missing-client/default-HEAD blockers are resolved. All original 39 independent cases/assertions and historical failure evidence remain. No teammate branch or production source was modified.

### Completed independent work

- Original accepted-source slice: **39/39 passed**: durable GPS/confirmation queue (12), GPS permissions (4), address decisions (7), canonical address client (9), Admin authorization/navigation (7). The original request deadline, durable cross-tab, delayed-conflict draft, real address delivery and replay delivery cases are green against HEAD.
- Added **19 independent SCRUM-274 cases** derived from its actual draft **ce1478449db1e86f2d2730d293834e6a6350c67f** and agreed APIs. They cover active-run/location joining, exclusion of not-started/finished rows, empty/unknown/unavailable/stale states, remaining stops, separate planned/live values, failed-refresh withdrawal of live claims, directional confirmation counts, named 44px reassignment trigger, real authenticated location/reassignment/history requests, seen-driver concurrency guard and HTTP 400/401/403/404/409/500 propagation.
- All available independent slices together: **58/58 passed**, with accepted HEAD for Driver/roster/Admin and the explicit immutable #168 head for live control. This is not a claim #168 is merged or late-run acceptance is complete.
- Added a **real address browser scenario** against accepted source: actual parent requests and Head approve/reject UI, no saved address/pin mutation before approval, approval persistence, rejection preserving saved data, real offline action failure/retry, keyboard focus/Escape cancellation, reload, 409, role/ownership 401/403/404 and 360px/no crashes. **1/1 passed**, runner exit 0, native PostgreSQL/Flyway (17 migrations), real password/2FA, no business response mocked.
- Updated CI to run the original 39 against accepted HEAD, an explicit strict immutable #168 review job, and the real address browser against PostgreSQL. Shared runner stays unchanged; generated local launcher/artifacts are excluded.

| Final verification | Actual result |
| --- | --- |
| Existing Driver/roster/address/Admin acceptance on accepted source | **39 passed / 0 failed** |
| Added live-control acceptance on exact #168 draft | **19 passed / 0 failed** |
| All available independent cases with explicit control candidate | **58/58 passed** |
| Full default-HEAD frontend regression | **1,256 passed / 11 failed / 1 existing expected failure / 5 existing skips** (1,273; 79 files) |
| Real accepted-source address browser | **1/1 passed** |
| ESLint / production build / git diff --check | Passed |
| Corrected standalone TypeScript | **13 accepted-develop baseline diagnostics**, zero introduced; compiler remains nonzero |

The **11 normal default-HEAD failures** are delivery gates for still-unmerged SCRUM-274: ten active-run/row cases require its absent UI/view modules and one location-client case requires its absent getRunLocations export. Eight reassignment/history/error cases already pass on HEAD. No missing module is skipped, replaced with a fake, or marked expected-failure. The explicit candidate passes all 19, while normal CI remains red until the implementation is integrated. Initial own fixture type errors (unavailable type import and missing vehicle capacity) and an ambiguous text locator were corrected; their initial logs and final corrected runs are retained.

### Additional real offline replay verification

After the address-only pass, extended the same isolated production browser stack with real Driver offline/reconnect/reload acceptance. **Final combined browser run: 2/2 passed**, exit 0 (address and replay), using PostgreSQL/Flyway through V17. Two actual offline taps retain their keys and show the documented retryable network-error controls while real server confirmations remain null. Reconnect plus online reload sends the stored statuses with stable clientRequestIds; explicit duplicate requests preserve the exact original confirmation timestamps/progress and create one Inbox entry per event. Actual password/2FA and 360px remain in the scenario. No business response is mocked.

The test-only ticking Monday clock is byte-identical to own #149/#148 support, explicitly selected and guarded by WASSEL_E2E plus an isolated loopback wassel_e2e database. It is not a production clock change. The existing source runner now selects both real scenarios; the shared run.mjs stays unchanged. Earlier exploratory failures were test-author assumptions, not proven product defects: the agreed network-error contract says Couldn't send/Try again, and a confirmed NOT_PRESENT is Done while an unconfirmed absence is Skip. Those raw probes/logs/traces remain preserved; the new contract-accurate test adds exact durable-key, unchanged-server and idempotent timestamp/count assertions. All original 39/65/80 independent cases remain untouched.

This verifies real reconnect, online reload, idempotent receipts and notification deduplication. It does **not** certify offline cold app loading (the accepted contract explicitly documents no offline app shell), physical phone GPS, browser cross-tab recovery, every HTTP retry/auth/conflict path, or real Head live-control/reassignment acceptance. These limitations are separate from the green unit/candidate slices and do not turn the unmerged SCRUM-274 gates green.

### Exact remaining scope

#168 is still a Draft, unmerged at ce147844. SCRUM-274 must be independently reviewed and accepted before the same 19 default-HEAD gates can pass. Its **Head not-started/late-run flag and contract are still missing**: the implementation explicitly reserves serverLateFlag as null; parent LATE inbox events do not define this Head API. Do not infer lateness from planned pickup and ETA or fabricate a field. Full live-control polling/auth/mobile and atomic reassignment/history preservation still require real-browser/integration acceptance once the feature/contract is complete. Physical phone GPS, offline app reload and the complete replay recovery matrix are not certified by the address/browser or unit passes above.

Evidence: ignored tmp/SCRUM-282-20261117-accepted/ (both full regressions, final TypeScript, real address browser), SCRUM-282-20261117-independent-final.log and preserved artifacts/histories. Windows standalone/junction build warnings remain disclosed; build and actual Next browser execution pass, not a standalone deployment certification.

**Readiness: keep #151 Draft / not merge-ready.** #144/#142 are resolved dependencies; #168/SCRUM-274 integration, agreed lateness contract and remaining end-to-end acceptance are the blockers. No Jira status, Draft state or teammate branch changed, and no PR was merged. Earlier sections below describe historical sources/dates.

## 16 November 2026 — latest address/replay candidates, original failures preserved

- Merged accepted develop **cc6783f96bcea48c42c06c3afff6084e1121eee1** normally. No teammate source or branch changed; candidate code is loaded read-only from exact Git objects.
- PR #142 is now **b17ee08714149532e2c87929b77c539173d8c545**: its canonical authenticated `addressRequestsApi` is implemented. PR #144 advanced during this session to **d1ad8229318b77562472fe4b698143180c24ac0a**, including real replay delivery. Both remain unmerged Drafts.
- Original 30 independent operations cases on the two latest heads: **30/30 passed**. For traceability, the earlier run on e3ec666 + b17ee08 was **29 passed / 1 failed** (replay adapter null). Prior 28/30 and original 25/29 failure evidence is retained with its original dates. The previously reported timeout/body deadline, cross-tab persistence, stale-decision draft preservation, address delivery and replay delivery cases are now green on the latest candidate heads.
- Added **9** independent address-client contract cases: authenticated GET of pending requests, encoded POST approve and authoritative receipt, trimmed optional rejection reason, blank-body omission, and exact HTTP 401/403/404/409/500 propagation. No parent/school identity is invented or supplied by the client. Original assertions were retained. The candidate workflow explicitly includes the new file, with normal nonzero failure behavior.
- Extended latest-candidate slice: **39/39 passed**. This is candidate/unit integration evidence, not a claim of deployed address-browser acceptance.
- Full frontend against the accepted/default branch gate: **769 passed / 32 failed**, plus 1 pre-existing expected failure and 6 pre-existing skips (808 total). All 32 failures require the unmerged driver/roster modules (12 queue, 4 GPS, 7 address screen, 9 new address client); Admin authorization's 7 cases pass. They are deliberately retained as normal failures, not skipped or expected-failed.
- ESLint, production build, `git diff --check`: passed. Standalone TypeScript reports the 13 established baseline diagnostics, with no introduced diagnostic. Local Windows junction standalone-copy warning remains disclosed.
- New evidence is ignored under `tmp/SCRUM-282-20261116/`; no generated logs/artifacts/secrets are committed. Current-head hosted candidate and regular CI results must be checked on the existing #151 PR.

### Remaining completion work

Majd must finish independent review and integration of #144/#142 into develop, then these same default-HEAD gates must pass without candidate overrides. SCRUM-274 is still **To Do** and has no delivered live-control screen: active/late authorized run data, GPS/ETA freshness separate from lateness, atomic reassignment success/failure/history preservation, loading/empty/error/retry/mobile/wrong-role cases remain unavailable for independent UI acceptance. Its backend dependencies #153/#156/#158 are now merged. The parent-only morning LATE inbox does not define Head-of-Transportation not-started/late-run alerts; that contract still needs agreement, not invented frontend fields.

Keep #151 Draft and blocked; no Jira status was changed. The two driver pending/retry acceptance differences in SCRUM-250 are separate from this 39-case operations slice and are not hidden by its green result.


## Fresh readiness audit — 15 November 2026

Develop remains `3798b40`, already in this branch. #144's Ready flag changed, but its source is still `e3ec66670324a77edfe014dec7a00f18ee39ac3c`. #142 remains draft at `d81b06859a36f7807272c4f81d2f03f0a7a9a7b9`; SCRUM-274 remains To Do with no control UI available. No source was copied or modified to make acceptance pass.

Re-executed all independent operations cases on the exact candidate pair: **28 passed / 2 genuine failures** (30 cases). The failures remain `confirmationReplayApi = null` and `addressRequestsApi = null`. The original timeout, durable cross-tab queue and delayed-409 draft-preservation regressions still pass on these candidates. All assertions and all earlier failure evidence are retained. Fresh ignored log: `tmp/SCRUM-282-20261115-review/candidates.log`. The accepted-source current-head CI before this report update still reports 769 passed / 23 missing-feature gates, plus the existing expected failure and skips; it is not represented as candidate success. The previously observed unchanged route-focus risk and its successful isolated reruns remain in the historical report below.

The new #149 independent browser test verifies the actual #144 driver UI feeding the production Parent UI through the accepted backend (GPS, ETA, consent and withdrawal). It improves online tracking evidence, not offline replay, address decisions or Head control acceptance. Its candidate source remains tracked-clean, with a live SHA guard in CI.

**Exact owner work:** Majd must wire the accepted idempotent replay API in #144 and verify reconnect, 401 pause/auth expiry, transient retry, 404/409 drop/refetch, 422 rejection and durable reload/cross-tab behavior. In #142, retain the canonical accepted address contract to resolve the add/add conflict, wire actual list/approve/reject and verify ownership, persisted approval-only address/pin mutation, errors and mobile. For SCRUM-274, build the authorized active/late/stale/unavailable Head control UI and atomic reassignment with confirmation-history preservation and full error/mobile/role coverage. Agree the Head lateness rule/API with the backend owners: #158's parent late alerts do not by themselves supply a Head not-started/late control screen.

#158 remains conflicted and unapproved: Moustafa must reconcile backend documentation and current integrated preferences/late/strict-scalar tests; Hashem must independently review the final head. None of those teammate changes is made by this independent test PR. Keep #151 Draft and preserve its red gates. No Jira status, teammate branch, Ready flag or PR merge was changed.


## Accepted dependency refresh and explicit replay delivery gate — 15 November 2026

Normally merged accepted develop `3798b40d2364a738f29dbf2c1d33bbaa1cd9601c` into the existing branch without conflicts/history rewriting. All existing 29 independent operations cases, failing regressions, reports and dated evidence remain. No teammate feature source, branch, assertions, skips or Jira status was changed; no PR was merged.

GPS #143, ETA #153, address #145, replay #155 and reassignment #156 are now accepted backend dependencies. Frontend #144 remains draft at `e3ec66670324a77edfe014dec7a00f18ee39ac3c`; #142 remains draft at `d81b06859a36f7807272c4f81d2f03f0a7a9a7b9`. SCRUM-274 is still To Do, with no available control-screen implementation in develop.

Added one independent contract-derived **production replay delivery** case: require a non-null adapter, encoded real confirmation endpoint, cookie credentials, PUT, and precisely the status/clientRequestId JSON fields (JSON key order is immaterial). This pins a previously documented completion blocker rather than pretending that a queue tested only with an injected fake is wired in production. The default HEAD integration gate and candidate CI both execute it as an ordinary failing test; no xfail/skip/continue-on-error was added.

| Executed check | Result |
| --- | --- |
| All independent candidate cases, exact #144 + #142 heads | **28 passed / 2 genuine failures** (30 cases, 4 files), including authorized Admin navigation |
| Current-branch full frontend regression | **768 passed / 24 failures**, 1 existing expected failure, 6 existing skips (799 cases; 59 files); breakdown below |
| ESLint / production build / git diff --check | Passed |
| Standalone TypeScript | Exit 2: same **13 develop baseline diagnostics**, zero introduced |
| Extra route-focus investigation on current source / clean develop baseline | **50/50 passed on each** isolated unchanged suite |

Candidate failures are exact, independent delivery gates:
1. #144 `frontend/src/lib/api/confirmationReplay.ts` exports `confirmationReplayApi = null`; the queued confirmation cannot reach the accepted SCRUM-263 endpoint. The new case fails before making a fake success request. Majd must wire the real client and verify reconnect, stable keys, timeout/retry, 401 pause, 404/409 drop/refetch, 422 rejection, reload/cross-tab recovery and sign-in expiry against the real backend.
2. #142 `frontend/src/lib/api/addressRequests.ts` exports `addressRequestsApi = null`; list/approve/reject remain disconnected from accepted SCRUM-269. Majd must reconcile the final address contract and verify authenticated ownership/roles, persistence, approval-only address/pin mutation, failures and 360px.

The same deadline, cross-tab durable queue and delayed-409 rejection-draft preservation cases pass on these candidates; the three previous defects remain fixed. The original fourth defect is the null address client; the new replay case makes the other already-known integration gap executable. Historical old-head reproduction remains in the earlier report, not represented as a new execution today.

**Full-run failure accounting:** 23 failures are normal delivery gates against HEAD, where the GPS hook/state, offline queue, replay adapter and address approvals module are still absent (and the old client lacks the request deadline). The 24th was `routes/[routeId]/page.test.tsx`, “shows an error with Try again, and focuses the route's heading once it loads”: expected heading focus, observed body. Both production and test files are byte-identical to develop (Git blobs `2b390c256f5d29a1241b9086ecb8b25cb0dcf59c` and `8410b0dbc99ee997c4948d1fde6e3f6473e28bc0`). Isolated reruns pass all 50 tests on this branch and on clean develop. This suggests an intermittent timing issue; its root cause is unresolved and the original full-run failure is preserved. It is not silently dropped from the reported result or fixed by changing teammate code.

Evidence: ignored `tmp/SCRUM-282-20261115/` includes both candidate runs, full regression JSON/log, lint/build/typecheck/baseline comparison and route-focus investigation; clean-baseline investigation remains in its separate ignored directory. No new real offline replay/address/control-screen browser success is claimed because the production dependencies are incomplete. The independent driver real-browser evidence is separately refreshed in SCRUM-250, not represented as control/address acceptance here.

**Readiness: keep #151 a draft.** Finish and accept #144 and #142, implement/accept SCRUM-274, complete real backend/mobile/control/reassignment acceptance and coverage, investigate the unchanged route-focus risk with its owner, then rerun the same assertions/full regression/CI and obtain independent review. Candidate CI is expected to retain the two real null-client failures; normal frontend CI retains missing-feature delivery failures. No production fix is made by this test PR.


## Accepted backend refresh and independent retest — 14 November 2026

Merged accepted develop `5da9d2c2f9b829747c47571dfb541d32a1f6aa64` into the existing test branch. **Address #145 and Inbox #146 are now merged.** The latest Majd heads are unchanged: driver #144 `e3ec66670324a77edfe014dec7a00f18ee39ac3c`, roster #142 `d81b06859a36f7807272c4f81d2f03f0a7a9a7b9`; both remain drafts. No acceptance test, assertion, feature implementation or teammate branch was changed.

| Executed check | Result |
| --- | --- |
| All 29 current candidate acceptance cases | **28 passed / 1 genuine failure / 0 skipped** |
| Full regression with exact candidate refs | **780 passed / 1 genuine failure / 1 existing expected failure / 6 existing skips** (788; 58 files) |
| ESLint / production build | Passed |
| TypeScript | Exactly 13 accepted-develop diagnostics, zero introduced |

The three verified fixes remain passing: deadline through response-body consumption, both cross-tab taps surviving durable reload, and another row's reject draft surviving a delayed 409 refresh. The earlier old-head negative-control evidence remains preserved; it was not relabeled as a new run.

**Remaining genuine failure:** #142 still exports `addressRequestsApi = null`. The backend is now available, so Majd can wire its real authenticated list/approve/reject API and verify ownership, receipt refresh, persistence, conflict/error handling and saved address/pin updates. This test must continue to fail until that production client exists.

**Other incomplete scope:** #144 replay client is still null; #155 is now at `9eaaca7c545d88062f27bc5c3a0b2bab6e062266`, still unmerged. SCRUM-274 remains To Do with no control/reassignment UI. Its backend dependencies (#153 ETA, #156 reassignment, #158 late alerts) are also open; do not synthesize a screen or fake a passing test. After features land, add/execute the live/late/stale/reassignment/mobile matrix and real reconnect/replay/address-decision browser slice. PR #151 remains a blocked draft; Jira statuses untouched.

Evidence: ignored `tmp/SCRUM-282-20261114/`; prior tests and November 9–12 evidence retained. Normal HEAD integration checks intentionally remain failing while feature modules are missing; candidate results are a separate check.


## Dependency refresh and independent regression — 12 November 2026

Accepted develop: `4cbfcc7172520e683366d6eaab482ff95015dba0`, including merged GPS #143. Executed read-only candidate Git source: driver #144 **`e3ec66670324a77edfe014dec7a00f18ee39ac3c`**, roster #142 **`d81b06859a36f7807272c4f81d2f03f0a7a9a7b9`**. Both remain drafts. No feature implementation was changed or merged. All original 29 acceptance cases remain.

| Executed check | Actual result |
| --- | --- |
| Original unadapted test harness on newest heads | 22 passed / 7 failed; logs retained |
| Current contract-compatible harness, newest heads | **28 passed / 1 failed / 0 skipped** |
| Same current tests on old Nov 10 heads (negative control) | **25 passed / original 4 defects fail / 0 skipped** |
| Full regression with newest candidate refs | **780 passed / 1 genuine failure / 1 pre-existing expected failure / 6 pre-existing skips** (788; 58 files) |
| ESLint / production build | Passed |
| Standalone TypeScript | Exactly 13 accepted-develop diagnostics, zero introduced |

### Why the harness changed without weakening criteria

Four initial failures were outdated useGpsSharing test doubles: Connectivity now requires `onRetry` and sharing returns a Run with `locationSharing` plus callbacks. Doubles now implement that agreed contract. The cross-tab criterion still interleaves both accepted enqueues, then opens a NEW queue from durable shared storage and requires both IDs; it no longer assumes a particular JSON storage layout. The stale-decision criterion still requires another row's typed reason both during and after a delayed conflict refetch; it no longer requires a loading skeleton, which was the cause of the old defect. The negative-control run proves these tests still expose all four original defects. No skip/expected-failure was introduced.

### Resolved on the newest candidates

1. #144: request deadline remains active through stalled body consumption.
2. #144: both successful concurrent tabs' taps survive a fresh queue reload using durable per-item pending storage.
3. #142: another row's reject draft survives the delayed 409 background refresh.

### Genuine remaining failure and missing scope

- **#142 `frontend/src/lib/api/addressRequests.ts` still exports `addressRequestsApi = null`.** The real authenticated address integration delivery gate intentionally fails. Majd must wire canonical #145 after acceptance and verify list/approve/reject, ownership, stored address/pin changes, errors and persistence. The PR body is stale about the already-fixed 409 draft behavior.
- **#144 replay remains null.** #155 / SCRUM-263 now proposes idempotent PUT confirmation using optional UUID clientRequestId, not a batch endpoint. It is unmerged at `99f57fd10a1696ad37a930099f5ef522b484baa0`. Majd must reconcile the real client, distinguish 401 pause, transient retry, 404/409 drop/refetch and 422 payload-key conflict using the accepted contract. Synthetic queue tests do not prove actual server replay/deduplication or phone reconnect.
- **SCRUM-274 is still To Do and absent.** Remaining required matrix: school-authorized active/late runs; GPS/ETA stale/unavailable distinct from established lateness; atomic reassignment with preserved confirmation history; loading/empty/error/retry, wrong-role/ownership and mobile/accessibility. Dependencies SCRUM-262,264,268 must be available. No speculative screen/API or fake passing test is added.
- Need real-stack ownership, reload/offline replay, address decisions and actual 360px operations UI evidence after those features exist. The Driver/Parent GPS probe is separately documented by SCRUM-250; it does not satisfy missing replay/control/address scope.

Normal HEAD CI remains a deliberate integration gate and cannot be called complete while feature modules are absent. Keep #151 a draft and SCRUM-282 In Progress. Majd owns the remaining feature work; do not fix his implementation in this test branch.

Evidence: ignored `tmp/SCRUM-282-20261112/{original-29-latest.log,current-29.log,negative-control-old-heads.log,full-current.log,lint.log,build.log,typecheck.log}`. November 9/10 evidence preserved.


## Follow-up verification — 10 November 2026

Accepted base: develop `8d62167fe2439843187218cabc40419304bd8d40`, including merged SCRUM-249 / PR #147. Reused this branch and all 29 existing independent cases. No feature branch was merged, no production file changed, and all four normal failing regression assertions remain unchanged.

| Check executed on current source | Result |
| --- | --- |
| Exact candidate acceptance suites | **25 passed / 4 failed / 0 skipped (29)** |
| Full frontend regression with candidate refs | **777 passed / 4 failed / 1 existing expected failure / 6 existing skips (788; 58 files)** |
| ESLint | **Passed** |
| Production build | **Passed** |
| Standalone TypeScript | **13 existing develop diagnostics**, identical to SCRUM-250; no operations-specific diagnostic |

Exact read-only sources: driver PR #144 `d890429ab09e24869cf3d389c7bad3776927332a`; roster PR #142 `b2fd4c3ab12819d12565fba325f8db821d937db4`. Neither draft has advanced. The source loader executes those Git blobs in memory and never modifies either author's checkout. Current Admin authorization cases execute this branch's accepted source.

### Reproduced causes and required owner changes

1. **#144 — deadline stops at response headers.** `frontend/src/lib/api/client.ts`, `request()`: the `finally` clears the abort timer immediately after `fetch()` resolves. A body stream stalled inside `response.json()` survives the 25ms deadline. Keep the deadline active through success/error-body consumption and clean up on every resolution/rejection; preserve the stalled-body acceptance test.
2. **#144 — cross-tab data loss before replay.** `frontend/src/lib/offline/queue.ts`, `mutate()`: unlocked whole-array read/change/write lets tab B save between tab A's read and write. Both enqueues return success, but persisted student IDs are `[a]` instead of `[a,b]`. Serialize/atomically persist every mutation across tabs, including enqueue; a drain-only lock and server idempotency do not protect a tap lost before transmission. Verify concurrent enqueue/retry/dismiss, reload recovery and account separation.
3. **#142 — real address client absent.** `frontend/src/lib/api/addressRequests.ts` still exports `addressRequestsApi = null`. Wire authenticated list/approve/reject to the agreed backend contract once available; verify actual methods, ownership, persistence and server errors. Fixture-driven decision cases do not satisfy this delivery gate.
4. **#142 — unrelated draft lost on conflict.** `AddressRequestsSection.tsx` reloads after 409 using the loading skeleton, unmounting the other request row. When its delayed list response resolves, that row's typed rejection reason is gone. Preserve drafts keyed by request identity across refresh (or keep unaffected rows mounted), while applying the server's current decision. Retain the delayed-response regression test.

### Reproduction

From this worktree in PowerShell:

```powershell
$env:WASSEL_OPERATIONS_CANDIDATE='d890429ab09e24869cf3d389c7bad3776927332a'
$env:WASSEL_ROSTER_CANDIDATE='b2fd4c3ab12819d12565fba325f8db821d937db4'
npm --prefix frontend test -- gps-queue.independent.test.ts gps-permission.independent.test.tsx roster.independent.test.tsx operations-auth.independent.test.tsx --maxWorkers=2
npm --prefix frontend test -- --maxWorkers=2
npm --prefix frontend run lint
npm --prefix frontend run build
```

Ignored evidence: `tmp/SCRUM-282-20261110/{candidate-29.log,full-candidate.log,lint.log,build.log,results.json}`. Prior logs and original test history remain preserved. Normal HEAD integration CI must continue to fail explicitly while the features are absent; candidate verification must continue to fail on these four defects. The two checks answer different questions and must not be replaced by one another.

**Still blocked:** Majd must fix #144/#142, reconcile real GPS/replay/address clients with accepted backend contracts, and provide SCRUM-274's live-control/reassignment implementation. Actual server ownership, real reconnect/replay and 360px/accessibility workflows remain unverified for these new operations features. Do not infer a GPS/replay pass from SCRUM-250's separate online run-client probe. After dependencies land, add the missing SCRUM-274 acceptance matrix, rerun integrated HEAD, real-stack mobile/security flows and CI. Jira stays In Progress; PR #151 stays a blocked draft.


## Status â€” 9 November 2026

PARTIALLY COMPLETE / BLOCKED by unfinished features and reproduced defects. Jira In Progress. Branch test/SCRUM-282-operations-ui-tests starts from develop 8a249e8; its diff is test/helper/report/CI only. No teammate production file, API or assertion was changed.

## Source and independence

Requirements came from SCRUM-273/274/275 and SCRUM-282. Candidate tests execute fetched Git source in memory using the existing TypeScript compiler; they never copy feature implementation into this branch or alter its active worktree.

- Driver candidate: PR #144, d890429ab09e24869cf3d389c7bad3776927332a.
- Roster candidate: PR #142, b2fd4c3ab12819d12565fba325f8db821d937db4.
- Admin authorization/navigation: current develop source.

Default npm test selects HEAD as the acceptance integration gate. While HEAD lacks SCRUM-273/275, it fails with explicit dependency messages; no missing-feature skip or expected-failure marker is used. To review the available candidates locally set WASSEL_OPERATIONS_CANDIDATE and WASSEL_ROSTER_CANDIDATE to those already-fetched refs/SHAs. The dedicated Actions workflow fetches the current heads of the same two existing PRs, prints their SHAs and executes the candidate cases. Existing frontend-build remains unchanged and gates HEAD integration.

## Executed results

| Check | Actual result |
| --- | --- |
| Four independent candidate suites | 25 passed, 4 genuine failures, 0 skips (29 total) |
| Full regression with the explicit candidate refs | 734 passed, 4 same failures, 1 existing expected failure, 6 existing skips (745 total / 55 files) |
| Full ESLint after test-harness corrections | Passed |
| Production build | Passed |
| Standalone tsc | Known develop diagnostics remain; no operations-specific diagnostic printed |
| Real GPS/replay/address backend browser slice | Blocked, NOT executed |
| Actual new UI mobile geometry / screen-reader audit | Unverified |

Ignored evidence: tmp/SCRUM-282. Initial test-harness mistakes (accessible names, loading locator, consent argument shape, syntax/encoding) were corrected without altering feature code or acceptance expectations; only the verified final failures below are product findings.

## Available acceptance coverage

- Explicit opt-in before browser/server GPS access; no consent carryover; opt-out; browser permission-denied callback; active-run finish cleanup.
- GPS prerequisites and unavailable states; consent/permission state transitions.
- Retaining offline work without a replay API; per-driver storage separation; reconnect/retry with the same idempotency key.
- Stalled response-body deadline and interleaved multi-tab persistence, beyond the author's sequential-tab example.
- Address saved/proposed distinction, loading/empty, approve/reject/confirmation/reason, failed decision retry and preservation of another row's typed draft during delayed conflict refresh.
- Actual Admin RoleGuard pending auth, three wrong roles, signed-out and outage handling, three real navigation destinations and logout availability.

## Four verified failures â€” do not suppress

1. Driver client deadline: client.ts clears its timer after headers, before response.json(). Advancing the 25ms deadline leaves the signal un-aborted for a stalled body; the normal acceptance assertion fails.
2. Driver cross-tab persistence: B enqueues between A's read and write. Both report saved, but only A persists; expected [a,b], actual [a]. Server idempotency cannot recover an item lost before sending.
3. Roster completion gate: addressRequestsApi is null, so actual authenticated list/approve/reject is unavailable.
4. Roster conflict refresh: with the second list response genuinely delayed after a 409, skeleton loading unmounts the other row and its typed rejection reason is lost.

These findings are raised on the corresponding existing feature PRs. Earlier review probes for the first two defects and existing roster review comments are preserved; these are executable normal failing tests, not softened expected failures.

## Unfinished / unverified criteria

- SCRUM-274 has no implementation or agreed live-control/reassignment UI available in develop/open feature branches. Active/late/stale live-control rows, atomic reassignment/history preservation and its action errors are not invented or claimed tested.
- SCRUM-273/275 still need real API wiring, accepted consent/replay contract reconciliation, actual server ownership and cross-user integration, permission/reconnect/replay persistence through the real backend, and verified phone/accessibility behavior.
- API idempotency itself is a backend dependency, not proven by a mocked replay method.
- The current Admin cases prove client shell authorization, not backend access control.
- Add missing component cases as accepted live-control interfaces become available, rerun the whole acceptance matrix against integrated HEAD, then real browser/mobile checks and CI.

Majd reviews this independent test PR when complete. Keep it a blocked draft, keep Jira In Progress, and do not merge/mark Done while these gates fail.
