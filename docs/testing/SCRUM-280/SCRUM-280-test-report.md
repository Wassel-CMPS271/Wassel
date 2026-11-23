# SCRUM-280 — Parent inbox and notification preferences

## After PR #149 merged — 17 November 2026

PR #149 is confirmed merged as develop **dec60bcb3f3de01a4e27c548f3e2f80bef3ca808**. Normally merged that accepted base into the existing #150 branch without conflicts. All earlier Inbox, preferences, GPS/ETA, navigation, account-reset code and evidence remain. The #149 merge dependency is resolved; no teammate branch, Jira status or Draft state was changed.

### New independently executable coverage

Added **ParentInbox.recovery.integration.test.tsx**, four separate owned regressions through the production page/layout, real RoleGuard and request() client with test-only HTTP fixtures. **4/4 passed**. They exercise the functional paths that #169's incorrect text assertions abort before reaching:

1. A failed mark-read 404 keeps the single unread entry, sends no fake receipt/decrement, exposes no private server detail and permits retry.
2. A mid-session 401 clears Inbox data, preferences and mutation controls, leaves backend read state unchanged and offers Sign in.
3. A successful mark-read refetches the authoritative two-to-one count; correct singular wording and separate sibling read state persist through full layout/page remount and authentication.
4. A list-500 failure exposes no server detail; refresh recovers the single unread entry and preferences without a stale alert.

These cases supplement the existing acceptance suite. They do not replace, patch, skip or reclassify any original test. Correct production **1 unread update** wording is unchanged. Initial typing mistakes in the new query options were corrected using exact anchored accessible-name matchers; the final four cases pass with their original functional assertions intact.

### Executed post-merge validation

| Check | Actual result |
| --- | --- |
| New owned recovery/privacy/persistence cases | **4/4 passed** |
| Original #169 snapshot da61dfb6a7951221ceb38092a5c117eaa9216d6e | **76 passed / 4 failed / 0 skipped**; all four test files and shared harness byte-identical |
| Full frontend including all raw external tests | **1,482 passed / 4 failed / 1 existing expected failure / 5 existing skips** (1,492; 93 files); only the four known text matchers fail |
| ESLint / production build / full PR whitespace check | Passed |
| Standalone TypeScript after correcting the new tests | Same **13 accepted-develop diagnostics**, zero introduced; compiler remains nonzero |
| Fresh real Inbox/preferences Chromium + PostgreSQL/Flyway | **2/2 passed**, 17 migrations; real login/2FA, read/read-all/reload, ownership, revocation, muting, late-alert scheduling/deduplication, errors/retry and 360px |
| Fresh real GPS/ETA Chromium + PostgreSQL/Flyway | **1/1 passed**, server stale cutoff, withdrawal, child switching, morning/afternoon, privacy, actual Leaflet and 360px |

The integrated actual Driver-to-Parent browser workflow remains enabled as an additional current-head CI gate. All business API responses in real-stack browser tests remain real; device GPS alone is simulated where stated. This is not physical-device or deployed-production certification. Windows junction standalone-copy warnings remain disclosed; production Next build/server/browser execution succeeds, without certifying Windows standalone packaging.

**Exact remaining blocker:** #169 still has six plural text matchers across four cases, while its own singular-wording case requires the opposite for count one. Original expectations and strict red CI are preserved. #169's owner must align those matchers with its singular criterion while retaining authorization, ownership, read receipts, server counts, reload and retry assertions. The complete six-line map is in SCRUM-169-wording-conflict.md. No remaining backend or #149 dependency was found; this PR is not represented as merge-ready while independent acceptance is 76/80. Current-head hosted checks are authoritative after push.

New evidence is ignored under tmp/SCRUM-280-20261117-post149/ and preserved e2e-artifacts histories. All older dated sections below remain historical evidence.

## 17 November 2026 — review fixes, unchanged independent tests and final real APIs

Accepted develop **ed4736d64b402a02cb30a3f1253a97109b4f3b7e** is merged, including Driver #144, roster #142, Inbox #146 and preferences/late alerts #158. Verified #149 tracking fixes through **b0c809c** are merged normally into this existing branch; GPS and Inbox remain mounted together. Historical sections below are retained with their original dates.

### Completed fixes

- Inbox is usable while the unrelated children request is loading or fails with a generic/network/server error. Child 401/403 still denies private access. Navigation, child selection, logout, account reset and GPS remain intact.
- All preference field errors, including each boolean, appear beside their accessible controls. Failed saves preserve the draft; authorization failures clear private state and pending receipts.
- Singular count is **1 unread update**. Unknown future event types are omitted with one generic, payload-free warning while known events remain strictly validated; authoritative unread count is retained. Unknown-only lists explain that updates are not displayed rather than falsely claiming no updates exist. LATE defaults off in the client factory and is explicitly enabled in production because #158 is merged. Mark-read receipts remain strict.
- Corrected the stale composition comment and title/body-only CI triggers. Inherited the accepted-source Driver/Parent browser workflow from #149; no obsolete moving candidate reference remains.
- Added an immutable #169 snapshot runner and strict independent CI job. It refuses different existing files and copies original bytes only; no expectation is patched, no test is skipped or expected-failed, and full regression still executes after the focused failure.

### Actual final verification

| Check | Result |
| --- | --- |
| Own focused Inbox/preferences/navigation/auth/client/integration cases | **121/121 passed** |
| Raw Majd #169 acceptance, exact da61dfb6a7951221ceb38092a5c117eaa9216d6e | **76 passed / 4 failed / 0 skipped** (80); all five files verified byte-identical |
| Raw tracking / preferences subsets | **43/43** and **13/13 passed** |
| Full frontend including all unchanged external acceptance cases | **1,478 passed / 4 failed / 1 existing expected failure / 5 existing skips** (1,488; 92 files); the same four failures only |
| ESLint / production build / git diff --check | Passed |
| Standalone TypeScript | Same **13 accepted-develop diagnostics**, zero introduced |
| Final real Inbox + preferences, PostgreSQL/Flyway + Chromium | **2/2 passed**, runner exit 0; **17 migrations** applied |
| Final real full GPS/ETA/staleness/privacy, same combined source | **1/1 passed**, runner exit 0 |
| Integrated Driver -> Parent automatic start/end without reload | **1/1 passed** in #149 before this final fixture/report merge; same implementation inherited |

All nine originally reported product-failure cases now pass. Four other cases still require **1 unread updates**, contradicting the suite's singular-wording case: foreign/unknown mark-read 404, mid-session 401 clearing, mark-read/refetch/reload persistence, and list-500 refresh recovery. Their early wording assertions fail, so this is not an 80/80 acceptance claim. Separate own API/component and real-browser tests cover their functional/privacy paths. The user explicitly chose **Preserve all original expectations and report 76/80**; the proposed six wording corrections were not applied. See SCRUM-169-wording-conflict.md. These remain real nonzero failures in CI and block claiming merge readiness.

The real browser scenarios verify actual password/2FA, three driver confirmation types, counts/read/read-all/reload, foreign-parent 404, 401/403, historical ownership, offline retry, logout/account reset/revocation, all five preference GET/PUT fields, strict invalid-input 400, muting without suppressing confirmations, no backfill, scheduled LATE without GPS and deduplication, persisted choices and 360px. GPS verifies real Leaflet, server countdown and 60-second STALE cutoff, withdrawal/null estimate, child/confirmation privacy and afternoon null planned pickup. Only device GPS is simulated where explicitly stated; no business API response is fabricated. The older scenario console mentions V15; current Flyway logs apply all 17 migrations.

Evidence remains ignored under tmp/SCRUM-280-20261117{,-review,-accepted,-final-browser}/ and e2e-artifacts histories. Prior failures, screenshots, traces and logs are preserved and excluded from Git. The raw acceptance files are local validation overlays, not staged as edits to Majd's work; CI fetches their immutable original snapshot. Windows junction standalone-copy warnings remain disclosed; successful Next server/browser execution does not certify Windows standalone packaging.

**Readiness:** all available own implementation/review fixes are complete and real APIs are verified; #149 must land first. #150 is **not ready to merge** while the unchanged external suite remains 76/80. Current-head CI must be checked after push. Draft/Ready state was left unchanged (already Ready externally); no PR merge, Jira status change or teammate source/branch modification occurred.

## 16 November 2026 — real preferences and scheduled late alerts integrated

### Current implementation and accepted dependency

Normally merged accepted develop **cc6783f96bcea48c42c06c3afff6084e1121eee1**, including merged #158/SCRUM-268 and V15. Every earlier commit and the integrated #149 GPS/ETA work remain intact. The production Parent page now supplies the real session-scoped notification-preferences client; the production Inbox client accepts the canonical `LATE` event. GPS/ETA, child switching, Home/Absences and parent-wide Inbox remain reachable together. No production fixture or guessed endpoint is used.

Fixed an own-code privacy issue: an Inbox 401/403 now also unmounts previously loaded preferences and discards pending save receipts. Production-entry regression tests retain the authenticated GET/PUT boundary, complete five-field replacement, persisted choices across navigation, historical LATE display after muting and late-response privacy assertions.

### Executed verification

- Focused parent Inbox/preferences/navigation/authentication: **113/113 passed** (10 files).
- Full frontend: **934 passed, 1 pre-existing expected failure, 6 pre-existing skips**, 941 total (70 files); no unexpected failure. ESLint, production build and `git diff --check`: passed.
- Standalone TypeScript: the same **13 existing baseline diagnostics**, no introduced diagnostic. Windows build returns 0 with the documented junction/standalone-copy EPERM warning; hosted CI uses fresh dependencies.
- **Real PostgreSQL/Flyway + production Chromium: 2/2 passed** (`inbox-final.log`). All **15 migrations**, including V15 preferences, were applied; real test-only isolated seeding, password login and LoggingMailer 2FA were used. No production response was mocked.
- Existing scenario preserved: actual GPS/map/countdown and sibling switching, all three confirmation types/deduplication, unread/read/read-all/reload, foreign-parent 404, roles 401/403, historical ownership after relinking, offline retry, logout/account reset, revoked access and 360px.
- New real scenario: UI PUT/GET/reload of all five preferences; wrong-type/range 400 leaves stored choices unchanged; client invalid-threshold rejection sends no PUT; muted PICKED_UP/DROPPED_OFF/NOT_PRESENT still save real driver confirmations but make no entries; another parent's choices/events are independent; re-enabling does not backfill; actual once-a-minute scheduler writes one overdue morning LATE with no GPS, and a second scheduler cycle makes no duplicate; future pickup/drop-off delivery works; historical LATE survives muting; save/read offline errors preserve or hide the appropriate state and retry succeeds; 401/403/404 and 360px pass.
- Prior attempts retained: first stopped because the installed Playwright needed Chromium revision 1248; installed that revision. The next attempt passed the original scenario and caught incomplete test cleanup (moving students before the previous active run ended). Cleanup now ends the real run before deleting its route; the final rerun passed both scenarios. No assertion was weakened.
- Evidence remains ignored under `tmp/SCRUM-280-20261116/` and `frontend/e2e-artifacts/`; logs, credentials, database files, traces and screenshots are excluded from the commit. GitHub CI on the new pushed head must be checked independently; current results belong in the existing PR description.

### Review and scope

SCRUM-267 and SCRUM-268 dependencies are merged; the former preferences/LATE blocker is resolved. The integrated GPS implementation remains a #149 dependency; review the Inbox-specific incremental diff after #149. The independent driver/Parent workflow is pinned to the latest #144 **d1ad8229318b77562472fe4b698143180c24ac0a** and retains its live-head guard. #144 remains Draft/unmerged and accepted Driver Today still uses samples; final driver integration must follow its acceptance review. Parent-reported absence deliberately creates no Inbox event; `NOT_PRESENT` is the driver's not-at-stop confirmation, per the canonical contract. Email/push delivery is SCRUM-283, not claimed here.

The implementation is available for independent review, subject to current-head CI and user approval to change Draft. No PR was merged, Draft changed, teammate code edited or Jira status changed.


## Independent review preparation with actual driver UI — 15 November 2026

Normally propagated verified #149 `c9c569cc39511a6a133dddadb92e2e381c669bdd` into existing combined Parent branch `88f9c1a`, preserving both histories and the real GPS/ETA + Inbox production composition. The merge was clean. Develop remains `3798b40` and is already included. No teammate code/branch, Jira status, Ready flag or PR merge was changed.

The new isolated review now runs the actual immutable #144 driver frontend and this combined production Parent frontend against the same accepted PostgreSQL backend. Real password/2FA, Start/Share/Stop, consent/location requests, Parent Leaflet/countdown, selected-child switching, withdrawal, wrong-role denial and both 360px layouts pass together. Browser GPS is simulated; this is online application integration, not physical GPS or unfinished offline replay certification. CI refuses a stale #144 head before accepting this evidence. The wrong-SHA guard was separately verified to reject before starting a stack, and the normal success run uses the correct immutable SHA.

| Executed check | Result |
| --- | --- |
| Actual candidate driver UI → combined production Parent UI | **1 passed**, exit 0, fresh PostgreSQL/Flyway, both production frontend builds succeeded |
| Full combined frontend regression | **930 passed**, zero unexpected failures; 1 existing expected failure and 6 existing skips (937; 70 files) |
| ESLint / diff check | Passed |
| Standalone TypeScript | Same **13 develop baseline diagnostics**, zero introduced |
| Preserved GPS/Inbox-specific real browsers | Retained, unchanged; current-head hosted workflows rerun these as well as the new dual-UI scenario |

Evidence: ignored `tmp/SCRUM-280-20261115-review/`, including unit JSON/log, lint, type comparison and dual-UI log/exit. #149's corresponding 840-test regression and new dual-UI CI are already green on `c9c569c`; #150's updated head must have its own checks inspected after push. Existing reports, tests and failure evidence are preserved.

### Can this be reviewed independently?

**Delivered Inbox and composition code can be reviewed now**, using the incremental diff against the SCRUM-279 branch rather than treating its preserved GPS dependency as unrelated work. Review `parentInbox.ts`/`InboxPanel` for parent-wide authoritative counts and receipts, `ParentInboxHome`/page/session/navigation for coexistence and account resets, and the real Inbox/browser evidence for ownership, reload, retry and revocation. The prepared preference client/panel/tests can be reviewed against the agreed five-field contract, explicitly as gated code.

**The whole SCRUM-280 ticket is not complete or Ready.** #158 is still unmerged, conflicted and awaiting Hashem's approval. Production preferences/LATE remain disabled; real preference persistence and preference-respecting late events have not been accepted. Do not relabel unit/fixture evidence as real preference integration. After #158 is accepted, enable the actual adapter, verify save/reload/muting/late thresholds/privacy/retry through real APIs and rerun regression/CI. Merge order remains #149 then #150. No Ready flag is changed without Wassim's explicit approval.

Latest #144 has been marked Ready without changing its `e3ec666` source; null replay/auth-expiry/reconnect/phone requirements remain. #142 remains draft/conflicted with a null address client. SCRUM-274 is still To Do; its active/late/stale Head control, atomic reassignment and history-preservation acceptance remain unavailable. These are owner work, not failures to hide or fix in this Parent PR.


## Combined GPS/ETA and Inbox composition — 15 November 2026

Live re-audit found develop unchanged at `3798b40d2364a738f29dbf2c1d33bbaa1cd9601c`. All four own branches already contained that head and were clean. No redundant develop merge or empty commit was made. Exact unchanged #148/#149/#151 heads retain their earlier same-source local/browser evidence and current-head hosted checks; repeated execution on unchanged source was unnecessary.

The unblocked integration gap was between our own Parent PRs: each production page supplied a different feature. Normally merged verified #149 `f9fb7cb9399127032e4a112ae0b104bf22e025d8` into existing #150 `0e91ee8791f4d738212c44202252d79bddcdcb3b`, retaining both histories and keeping develop as the target. Resolve/merge **#149 before #150**; #150's develop comparison temporarily includes that explicit upstream dependency. The incremental Inbox comparison is against the SCRUM-279 branch. No teammate branch was copied, edited, rebased or merged by this work.

Five conflicts were resolved by composition: `.gitignore` retains both launcher exclusions; `parent-features.review.mjs` retains tracking ETA/stale checks and Inbox preference fixtures; `parent-navigation.review.mjs` requires both accepted destinations; `ParentHome.navigation.test.tsx` retains the shared cases and real GPS/ETA regressions while replacing the obsolete mutually-exclusive production assumption with positive coverage of both; `page.tsx` supplies both real clients. No failure assertion, xfail or skip was removed to obtain green tests. ParentInboxHome now accepts the existing tracking adapter alongside Inbox, with account-scoped mounting and lazy requests. Preferences/LATE remain disabled until #158 is accepted.

| Executed check | Result |
| --- | --- |
| Focused combined clients/components/navigation/authentication | **164 passed** (14 files) |
| Full frontend regression | **930 passed**, zero unexpected failures; 1 existing expected failure, 6 existing skips (937 cases; 70 files) |
| Final new integration cases after test-helper type correction | **8 passed** |
| ESLint / production build / diff check | Passed |
| Standalone TypeScript, final baseline comparison | Same **13 develop diagnostics**, zero introduced |
| Fixture-only tracking and Inbox Chromium | Both passed at 360px; actual components/Leaflet, 44px controls, account reset, read identity, error/retry, planned/ETA/stale/missing coverage retained |
| Fixture-only production Home/Absences Chromium | Passed: both destinations, long names, keyboard/44px controls, no overflow/crashes and lazy requests |
| Real combined Inbox/GPS Chromium + fresh PostgreSQL/Flyway | **1 passed**, exit 0; actual password/2FA, real Leaflet/ETA/child switch followed by Inbox counts/receipts/isolation/retry/account reset/revocation/360px |
| Real full GPS/ETA Chromium on the combined production build | **1 passed**, exit 0; server STALE boundary, withdrawal/null ETA, confirmation privacy, afternoon/null plan, 401/403/404 and cleanup |

The real tests use accepted production APIs, fresh empty loopback PostgreSQL with all 14 migrations through V14, isolated demo/auth accounts and the existing test-only ticking school clock. No production response is mocked. The second real test reused the same unchanged production build only after the launcher's build/config guards passed. Physical-phone GPS, unfinished #144 driver UI and unmerged preferences/late APIs are not certified. The initial TypeScript run caught one new helper typing issue (Playwright's `exact` option passed to Testing Library). Removing the unsupported option retains Testing Library's default exact string matching; all eight new cases and the standalone type check were rerun, returning to the baseline. Initial logs remain preserved.

Evidence: ignored `tmp/SCRUM-280-20261115-composition/`, timestamped fixture directories and archived Playwright histories. The existing GPS workflow is retained and also runs for pushes to this composed branch. Current-head hosted full regression, backend and both real-browser jobs must be checked after push; local pass is not hosted CI success.

**Owner completion requirements, verified live:** Majd's #144 is draft with real Today/GPS wiring but null confirmationReplayApi, outstanding auth-expiry/reconnect/phone acceptance and no formal approval; finish the accepted per-tap idempotent client and verify 401 pause, 404/409 drop/refetch, 422 rejection, transient retry and durable cross-tab recovery. Majd's #142 is draft with null addressRequestsApi and an add/add conflict in `docs/contracts/address-requests.md`; retain the accepted contract, wire real authenticated decisions and verify ownership/approval-only mutation/persistence/errors/mobile. Moustafa's #158 remains open at `7baf727`, with `backend/CLAUDE.md` conflict and Hashem's formal approval pending; reconcile develop, retain V15 after V13/V14, and rerun real preferences/late/strict-scalar/independent tests. SCRUM-274 remains To Do and blocks full operations testing. #160/#161 also lack Hashem approval; #161 needs its documentation conflict and obsolete dependency gates reconciled.

**Readiness:** #150 stays draft; complete/accept #149's driver-UI dependency and #158, then enable and verify real preferences/late behavior, obtain independent approval and verify current-head CI. None of the 17 audited open PRs had a formal independent APPROVED review, so no PR was eligible for merging. Jira statuses and all teammate branches were unchanged.


## Latest develop and real Inbox re-verification — 15 November 2026

Normally merged accepted develop `3798b40d2364a738f29dbf2c1d33bbaa1cd9601c` into the existing branch without conflicts or history rewriting. All prior implementation, tests, reports and ignored evidence remain. GPS/ETA/replay/reassignment/attendance backend changes and the #129 POST-form security guard are now accepted. The only new UI code change is `method="post"` on our prepared preferences form, making it comply with that guard without changing hydrated submit behavior.

Production continues to use the real authenticated SCRUM-267 Inbox API. Preferences and LATE remain explicitly gated: #158/SCRUM-268 is still open at `7baf727f4bf1f4e042495a952befdf65a5217cd3`, now targeting develop with a documentation conflict and no independent approval. No unmerged backend code or fake production data was imported.

| Executed check | Result |
| --- | --- |
| Focused Inbox/preferences/client/navigation/authentication | **99 passed** (9 files) |
| Full frontend regression | **861 passed**, 0 unexpected failures; 1 existing expected failure, 6 existing skips (868 tests; 64 files) |
| ESLint / production build / git diff --check | Passed |
| Standalone TypeScript | Exit 2: same **13 develop baseline diagnostics**, zero introduced; equivalent literal role-union display order normalized, with file/position/code/message retained |
| Real PostgreSQL/Flyway production Chromium | **1 passed**, launcher exit 0 |

The real browser uses a fresh database, real password/2FA and production APIs, checks all three accepted confirmation event types and deduplication, accurate parent-wide unread counts, stable read receipts/read-all/reload, foreign-parent 404, unsigned 401 and wrong-role 403, historical ownership after relinking, actual offline retry, logout/account reset, revocation and 360px behavior. It does not claim real preferences or late-alert acceptance; those APIs are deliberately not called by production. The existing isolated contract client/component tests for the five preference fields, validation, persistence receipts and access-denial races remain green.

Evidence: ignored `tmp/SCRUM-280-20261115/` (focused/regression/lint/build/typecheck, baseline comparison, real-browser log/exit), with prior Playwright/log histories preserved. Current-head hosted checks must be inspected separately; local execution is not CI success. No secrets, database/mail logs or generated browser artifacts are staged.

**Readiness: keep #150 a draft.** Once #158 is merged, normally update this branch, enable only the accepted real preferences/LATE adapter, verify preference persistence/reload and preference-respecting pickup/drop-off/not-present/late behavior with real APIs (threshold/timezone/privacy/retry included), rerun regression/browser/CI, then request independent review. No Jira status changed, no teammate branch changed and no PR was merged.


## Real Inbox integration and verification — 14 November 2026

Accepted develop `5da9d2c2f9b829747c47571dfb541d32a1f6aa64` now contains #145/address, #146/inbox and #152/totals. Reused this branch, PR #150, prior implementation and every dated evidence set; merged only accepted develop. No teammate production file or branch was edited, no PR merged, and no Jira status changed.

### Implemented

- Production ParentPage now supplies the real cookie-authenticated `parentInboxApi` to ParentInboxHome. Inbox is a functional, lazy destination alongside Home/Absences, with no sample fallback or unmerged request.
- Verified the accepted canonical GET list/unread count and POST receipt/read-all contracts. Preserved authoritative totals beyond the newest 50, sibling event identity, original-parent historical ownership, read state after reload, account reset, loading/empty/errors and retry.
- SCRUM-268 now has a real contract in open **#158 `7baf727f4bf1f4e042495a952befdf65a5217cd3`**, stacked on open ETA #153. Prepared its authenticated GET/PUT preferences client, all five required fields, four boolean choices and integer threshold 5–60, full replacement/server receipt behavior, validation, retries and privacy guards. Prepared LATE rendering accepts only server events; the UI never calculates lateness from stale GPS.
- **Production preferences and LATE extension remain explicitly disabled.** The accepted Inbox client still rejects unsupported LATE data; only an explicitly enabled test adapter accepts the proposed type. Production shows an unavailable message and makes zero preference calls. No guessed endpoint, production fixture or false persistence claim.
- A new integration regression reproduced a race: an in-flight Inbox response could restore private data after preferences rejected the session. Invalidate that load generation and clear data on access loss; the original and delayed-response cases now pass. Preference save/load sessions also discard old clients/accounts and prevent duplicate submissions.
- Added a separate PostgreSQL Parent Inbox CI job, guarded wrapper and test-classpath-only ticking Monday configuration. This makes run-generated events testable on Saturday/Sunday without changing production time, authentication, endpoint logic or data. The normal empty loopback-database/seed guards remain intact; auth/JWT still use real time.

### Executed results

| Check | Result |
| --- | --- |
| Focused unit/client/component integration | **91 passed / 0 failed** (7 files) |
| Final full regression | **851 passed / 0 unexpected failures / 1 existing expected failure / 6 existing skips** (858; 63 files) |
| ESLint | Passed, zero warnings after fixing lifecycle cleanup |
| Production build | Passed, including actual proxy-mode browser builds |
| Standalone TypeScript | Exactly **13 accepted-develop diagnostics**, zero introduced |
| Real Chromium + PostgreSQL/Flyway Inbox scenario | **1 passed**, runner exit 0 |
| Production Home/Absences navigation at 360px | Passed, explicit fixtures |
| Prepared Inbox/preferences components at 360px | Passed, explicit fixtures; save, threshold, read/read-all, errors/retry and reset |

The real scenario used actual password/2FA and Spring APIs: two parents, three confirmation-generated event types, deduplication, authoritative counts, POST read/read-all and first readAt stability, reload persistence, foreign-parent 404, other-role 403 and unsigned 401, historical entries after re-linking, real browser offline/retry, logout/account replacement, revocation, 44px controls and no 360px overflow/crashes. Route cleanup succeeded. No business responses were intercepted or fabricated. Real preferences/late-alert integration was NOT executed.

Preserved failed evidence: a heading locator initially matched H1 and H2 (scoped to H2); initial test-clock registration did not take effect (the explicit Monday assertion caught it; switched to an explicit test configuration source); the genuine async privacy race was fixed in our own code. No acceptance assertion or check was skipped/weakened.

Evidence: ignored `tmp/SCRUM-280-20261114/`, timestamped mobile review directories, and archived `frontend/e2e-artifacts/history/`. Real browser logs/credentials/traces/database files are excluded from commits; generated credentials are deleted by the runner. The sample school date is explicitly controlled (Monday 2026-11-02) and advances with elapsed time; this is not a claim of real-world Nov 14 bus activity.

### Remaining completion gates

#158 is unmerged and depends on unmerged #153. After their accepted contract is rechecked, enable the prepared preferences client and late-event adapter in the production composition; verify real preference persistence across refresh/accounts, event suppression for future confirmations, threshold/timezone/late-event generation and delivery behavior. Do not confuse NOT_PRESENT with an absence report: the accepted contract says absence reports create no Inbox entry. Complete independent review and required CI before final readiness. Keep #150 a draft. Preserve #149 GPS navigation when the two unmerged Parent compositions are reconciled; no other feature branch was imported here.


## Dependency refresh and verification — 12 November 2026

Merged only accepted develop `4cbfcc7172520e683366d6eaab482ff95015dba0` into the existing branch, preserving all implementation, tests, commits and previous evidence. No teammate feature branch was changed.

Re-read canonical inbox #146 at `bdab2d0b1f6ac5314b03b7cdae32f5c7461bb361`; it is still unmerged and the API shape is unchanged. Current prepared client matches GET inbox (optional unread), GET unread-count, POST encoded entry/read, POST read-all/204 through the cookie-authenticated client. Historical entries stay authorized to the original parent even after child re-linking. NOT_PRESENT is an actual confirmation event; it is not an invented absence-report notification.

Added tests for rapid duplicate taps/read-all serialization, failed read-all preserving unread totals then retrying server-authoritative state, 401/403 privacy removal during mutation, mutation status propagation, encoded receipt identity and read-all's lack of caller-supplied parent/student identity or preference payload. Retained sibling isolation, stale account responses, reset/filter/navigation, counts beyond the newest 50 and mobile tests.

SCRUM-268 remains To Do with **no preferences endpoint, DTO, late-event schema or threshold contract**. No guessed API or fake enabled toggle was introduced. The production page keeps Inbox unavailable and does not call unmerged APIs; only the explicit review composition supplies the prepared client. Real inbox/preferences integration is not complete.

| Executed check | Actual result |
| --- | --- |
| Focused inbox/client/navigation/session/authorization | **63 passed / 0 failed** |
| Full frontend regression | **815 passed / 0 unexpected failures / 1 pre-existing expected failure / 6 pre-existing skips** (822; 60 files) |
| Actual prepared Inbox Chromium at 360px | Passed, fixture-only: sibling receipt, authoritative totals/read-all, retry, 44px controls, account reset |
| ESLint / production build | Passed |
| Standalone TypeScript | Exactly 13 accepted-develop diagnostics, zero introduced |
| Production Home/Absences Chromium at 360px | Passed, fixture-only; navigation, child switching, long names, keyboard, 44px targets, no overflow/crashes |
| Real inbox/preferences integration | Blocked; not claimed |

Remaining: #146 accepted merge (and migration ordering with #145), SCRUM-268's agreed preferences and notification/late semantics, real event generation/read ownership/preferences persistence/reload/authorization and deployed/mobile delivery checks, independent Majd review and required green CI. Preserve GPS navigation when reconciling this Home extraction with #149; do not replace the accepted tracking entry. Keep #150 a draft and Jira In Progress.

A first mobile-harness attempt overlapped this worktree's production build and failed on a missing generated `.next/types` file. Preserved that log, serialized the final checks, selected explicit distinct review ports, and reran successfully. No product assertion was relaxed.

Evidence: ignored `tmp/SCRUM-280-20261112/` and timestamped `tmp/parent-features-mobile/inbox/` / `tmp/parent-navigation-mobile/`. Prior reports remain historical. No new backend integration or hosted CI pass is inferred from fixture checks.


## Follow-up implementation and verification — 10 November 2026

**Frontend work advanced; final integration remains blocked.** Jira stays In Progress and existing PR #150 stays a draft. Reused this branch, preserved snapshot `d401c1ac07749a748b924e35a6af7d822a2c3647` and all original tests/reports, and merged accepted develop `8d62167fe2439843187218cabc40419304bd8d40` (SCRUM-249 / #147). No teammate branch or SCRUM-250/282 test evidence was modified.

### Implemented now

- Extracted the preserved Home/Absences screen into `ParentHome`; the page remains a thin production entry. Family views provide functional My children and Absences navigation, an authenticated linked-child picker, keyboard focus, and explicit optional feature compositions.
- Sidebar/brand links now return from an in-place child view to My children. The actual RoleGuard remains in place; its private content is keyed by school/account identity. Old child loads/refreshes cannot restore another account's private content.
- Future tracking/inbox destinations stay non-interactive Soon items when no accepted client composition is supplied. Withdrawing a supplied capability clears its private content and explains unavailability.
- A genuine 360px browser regression exposed long-name overflow in the existing Absences heading. Applied the same minimal wrapping fix in these two branches; the overflow assertion was preserved and rerun successfully. The original SCRUM-249 worktree/commit stays untouched.
- Added `ParentInboxHome`, a prepared parent-wide inbox composition with Home/Absences navigation. The production page supplies no inbox client, so Inbox remains a non-interactive Soon item and no unmerged endpoint is called.
- Inbox state now resets for account lifetime changes even when the API is a stable singleton. Responses are tagged with their API source, and an old account's completed mutation cannot trigger follow-up reads into the new account.
- Retained server-authoritative unread totals, read/read-all, filtering, refresh, loading, errors/retry and receipt reload. A failed unread-count request does not fabricate zero. The UI explains that totals/read-all cover all children and older events, beyond the newest 50.
- Added sibling-specific mutation checks and retained authorized historical entries when a child is no longer currently linked, as PR #146 explicitly requires. The current linked-child list is not incorrectly used to remove historical authorized inbox events.

The shared navigation, session boundaries and browser-review helpers are identical across the two ticket branches so either merge order can reconcile the common code. No additional package, production feature flag, sample client or production endpoint was introduced.

### Executed validation

| Check | Actual result |
| --- | --- |
| Focused parent/navigation/auth/component/client suites | **129 passed / 0 failed** |
| Full frontend regression | **804 passed / 0 unexpected failures / 1 existing expected failure / 6 existing skips (811 total; 60 files)** |
| ESLint, final source and tools | **Passed** |
| Production build, including same-origin proxy mode | **Passed** |
| Standalone TypeScript | **13 existing baseline diagnostics, zero introduced**; exact file/line/error comparison with verified develop `8d62167` |
| Actual Chromium production-entry UI at 360px | **Passed, fixture-only** |
| Actual prepared inbox components at 360px | **Passed, fixture-only** |
| git diff --check | Checked before commit |
| Real inbox backend integration | **Blocked / not claimed** |

The production-entry browser check used real Next navigation, production CSS/CSP and explicit auth/children/absence fixtures. It measured both Home and Absences at 360px with long names, 44px new controls, child switching, keyboard activation, sidebar return, no overflow/crashes and no calls to unmerged feature APIs. Screenshots were inspected.

The isolated component browser test rendered the actual InboxPanel with an explicitly injected in-memory API fixture. It verified long names at 360px, the selected sibling's read action, 73-to-72 authoritative count refresh, read-all, failed load/retry, 44px controls and private-state reset across accounts. This is frontend component evidence, not real event creation, backend ownership or preference persistence.

Initial test-harness issues (unsupported RTL option, missing test router, JSX escaping, isolated module resolution and correct API interception), a production-review setup mismatch (same-origin build required; port 4190 is restricted by Fetch/Chromium), and the actual wrapping/zoom failures are retained in ignored logs. Setup issues were corrected; actual UI defects were fixed in source. No failing criterion was skipped, marked expected-failure or softened. The one expected failure/six skips above belong to the existing baseline.

Evidence: `tmp/SCRUM-280-20261110/` (focused/full regression, lint/build/type comparison and review logs); timestamped runs under `tmp/parent-navigation-mobile/` and `tmp/parent-features-mobile/inbox/`, with `latest.json` pointers. Browser fixtures live only in the review harness/ignored generated entries; screenshots, logs and caches are not committed. No backend integration or CI success is inferred from fixture passes.

### Exact remaining dependencies and completion steps

1. PR #146 / SCRUM-267 remains open and unmerged at `bdab2d0b1f6ac5314b03b7cdae32f5c7461bb361`. Its migration follows #143/V10 and #145/V11. Recheck the accepted contract before enabling the real `parentInboxApi` in production.
2. SCRUM-268 is still To Do. Preferences fields, persistence endpoints, late-alert thresholds/events and delivery semantics are not defined; no fake toggles, LATE type or guessed endpoint has been added.
3. Contract wording gap: SCRUM-280 mentions absence updates, but #146 explicitly excludes parent-reported absences. Its NOT_PRESENT event means not at the stop. The contract owner/team must clarify whether the criterion means NOT_PRESENT or needs a separate defined absence event.
4. After dependencies land, enable the prepared composition under the authenticated account boundary. Verify real confirmation-to-inbox creation, authoritative totals, read/reload persistence, cross-parent denial, preferences and late-delivery behavior on PostgreSQL and mobile, then CI and Majd's independent review.

**Readiness:** frontend code can receive preliminary review, but this remains a blocked draft and is not ready for final independent acceptance/merge. Keep the ticket In Progress until all real-stack criteria are met.

### Current PR file scope (18 files)

- `docs/testing/SCRUM-280/SCRUM-280-test-report.md`
- `frontend/e2e/parent-features.review.mjs`
- `frontend/e2e/parent-navigation.review.mjs`
- `frontend/src/app/(parent)/parent/AbsencesPanel.tsx`
- `frontend/src/app/(parent)/parent/InboxPanel.test.tsx`
- `frontend/src/app/(parent)/parent/InboxPanel.tsx`
- `frontend/src/app/(parent)/parent/ParentFeatures.authorization.test.tsx`
- `frontend/src/app/(parent)/parent/ParentHome.navigation.test.tsx`
- `frontend/src/app/(parent)/parent/ParentHome.tsx`
- `frontend/src/app/(parent)/parent/ParentInboxHome.test.tsx`
- `frontend/src/app/(parent)/parent/ParentInboxHome.tsx`
- `frontend/src/app/(parent)/parent/ParentSession.test.tsx`
- `frontend/src/app/(parent)/parent/layout.test.tsx`
- `frontend/src/app/(parent)/parent/layout.tsx`
- `frontend/src/app/(parent)/parent/page.tsx`
- `frontend/src/lib/api/parentInbox.test.ts`
- `frontend/src/lib/api/parentInbox.ts`
- `frontend/src/test-support/parentNavigation.ts`

Earlier dated sections below are preserved historical evidence.


## Status â€” 9 November 2026

PARTIALLY COMPLETE / live integration BLOCKED. Jira In Progress. Branch feature/SCRUM-280-parent-notifications, based on develop 8a249e8. Preparation is deliberately unmounted in production, with no fixture adapter.

## Implemented independently

- parentInboxApi follows PR #146 / inbox.md at bdab2d0: cookie-authenticated list/unread-count/read/read-all, encoded entry identifiers, strict defined event/direction/timestamp/count validation, receipt identity checks and server error propagation.
- InboxPanel renders PICKED_UP, DROPPED_OFF and NOT_PRESENT for all authorized event children, school-local timestamps, read/unread labels, unread filtering, mark-one/all, loading/empty/errors/retry and sign-in expiry.
- The unread count always comes from the count endpoint, including more than the newest 50. Successful mutations refetch list/count; failed actions do not fabricate a successful read. Receipt state is reloaded after remount. Stale source responses are ignored and private entries are dropped on revoked access.
- NOT_PRESENT is the linked SCRUM-36 not-at-stop event, not an invented parent-reported absence event. No event creation, LATE DTO, preferences fields or endpoints are invented.
- Preferences and late-alert UI truthfully says unavailable. Existing Parent navigation, auth and logout are untouched.

## Executed validation

| Check | Actual result |
| --- | --- |
| New client/component suites | 25 passed |
| Full frontend final regression | 734 passed, 1 existing expected failure, 6 existing skips; 741 total / 53 files |
| Initial full regression | 733 passed / 1 existing route focus-timing failure, plus the same expected failure/skips; retained and unchanged serial rerun passed |
| Full ESLint after cleanup fix | Passed, no warnings |
| Production build | Passed |
| Standalone type check | Recorded separately; known develop fixture diagnostics remain, not suppressed |
| Actual notification creation/read persistence through real backend | Blocked, NOT executed |
| Real 360px/accessibility browser layout | Unverified; shared responsive/native controls are not a browser-layout claim |

Evidence is ignored under tmp/SCRUM-280. Fixtures are test-only. Passing injected-client tests do not establish real persistence, backend ownership or delivery preferences.

## Dependencies and exact finish steps

1. SCRUM-267 / #146 is unmerged; preserve V10 â†’ V11 â†’ V12 order and recheck its final contract. Connect the real client and parent navigation only against accepted real endpoints.
2. SCRUM-268 has no defined/merged preferences or late-alert contract. Await real event/threshold/preferences schema rather than guessing a LATE event or toggle keys.
3. Implement the real preferences form and persistence/delivery behavior from that contract; extend the event view to defined late alerts.
4. Compose the panel under authenticated Parent navigation, key/reset it on account identity changes, verify actual confirmation â†’ inbox â†’ count â†’ read/reload and preference-respecting late alerts with multiple children and cross-parent isolation.
5. Verify real phone/keyboard behavior at 360px, rerun regression and CI, request Majd's independent review and mark ready only after the complete criteria pass. No automatic merge or Done transition.

## Files

- frontend/src/lib/api/parentInbox.ts and parentInbox.test.ts
- frontend/src/app/(parent)/parent/InboxPanel.tsx and InboxPanel.test.tsx
- This report

A blocked draft shares substantial reviewed preparation; green preparation checks do not mean full acceptance completion.
