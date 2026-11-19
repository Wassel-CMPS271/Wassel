# SCRUM-279 — Parent live bus map and countdown

## 17 November 2026 — review fixes and accepted Driver integration

Accepted develop **ed4736d64b402a02cb30a3f1253a97109b4f3b7e** is merged normally, including Driver #144 and roster #142. Existing commits and all dated evidence are preserved. Historical dependency/readiness statements below describe their dates, not the current status.

### Changes and review findings

- Tracking now refreshes authorized child/run details every 60 seconds while open, across start, finish, direction and assignment changes. Late responses after navigation/account changes are ignored; auth failures clear private state and stop automatic retries.
- Telemetry stops automatic polling on 401/403/404, with explicit recovery controls; transient failures back off at 15/30/60/120 seconds. Hidden tabs pause polling; returning refreshes immediately. Afternoon loading/errors never reuse morning pickup labels or times.
- Stable live/stale announcements are separate from the changing last-seen age. Navigation uses stable item ids. Removed the unused legacy ArrivalCountdown and migrated all four safety cases to the canonical server-duration LiveEtaCountdown; no acceptance case was removed or skipped.
- Removed the obsolete moving #144 CI pin/candidate checkout now that Driver is merged. Browser CI tests the exact integrated checkout. Parent workflows no longer subscribe to PR metadata edits, so those events cannot cancel a real in-progress run; explicit workflow dispatch is available for rechecks after a base change. Shared run.mjs and teammate production source remain unchanged.
- Corrected identified UTF-8 report corruption. WeekdayE2eClock is the same file/blob used by the existing own test branches, not multiple runtime clocks; #149 lands it once and #150 inherits it.

### Executed current-source validation

| Check | Result |
| --- | --- |
| Focused parent/client/navigation/lifecycle/accessibility cases | **94 passed** (before the dependency-only Driver/roster merge); all included in full regression below |
| Full frontend on accepted Driver/roster | **1,299 passed / 0 unexpected failures / 1 existing expected failure / 5 existing skips** (1,305 total; 81 files) |
| ESLint and production build | Passed; the final real-stack launcher builds this current frontend |
| Standalone TypeScript | Same **13 accepted-develop baseline diagnostics**, zero introduced |
| Real integrated Driver UI -> Parent UI, PostgreSQL/Flyway/Chromium | **1 passed**, exit 0; all 17 migrations applied |
| Raw #169 tracking acceptance in the composed #150 branch | **43/43 passed**; combined raw suite remains 76/80 due to four singular/plural conflicts, described in #150 |
| git diff --check | Passed before commit |

The extended real browser test keeps Tracking open before Start and after End, with **no Parent reload or manual refresh after starting**. It verifies automatic state transitions, real password and 2FA, actual Driver consent/location requests, real Parent APIs, Leaflet marker, server ETA, child switching, withdrawal, role denial, cleanup and both 360px layouts.

Only the Driver device position source is simulated. A separate Chromium probe reproduced native override replacement emitting POSITION_UNAVAILABLE (code 2) before a new fix; the previous failed runs are preserved. The success fixture models a continuously available position source in a separate Driver browser process. It does not mock business/auth/consent responses, suppress production errors, certify physical phone GPS, or certify offline replay. The existing server-STALE/afternoon/privacy browser suite remains a separate CI gate.

Evidence remains ignored under tmp/SCRUM-279-20261117{,-review,-accepted}/ and timestamped e2e-artifacts history. Windows node_modules-junction standalone-copy warnings remain disclosed: Next build exits successfully and the actual production server/browser works; Windows standalone deployment is not certified. Hosted CI uses fresh dependencies. Current-head hosted results must be read after push, not inferred from local passes.

**Readiness:** own tracking review findings are fixed and accepted Driver integration is verified. Check current-head hosted CI and independent review before merging. No PR merge, Jira update, teammate branch edit or Draft change was performed.

## 16 November 2026 — accepted develop and latest driver verification

- Merged accepted `origin/develop` **cc6783f96bcea48c42c06c3afff6084e1121eee1** normally; preserved the existing GPS/ETA implementation, all earlier commits and browser evidence. No teammate source or branch was edited.
- Focused: **74 passed**. Full frontend: **840 passed, 1 pre-existing expected failure, 6 pre-existing skips** (847 total). ESLint, production build and `git diff --check`: passed. Standalone TypeScript still reports the 13 established baseline diagnostics; no new diagnostic appeared.
- Updated the isolated dual-frontend GPS workflow's immutable driver candidate from `e3ec666` to PR #144 **d1ad8229318b77562472fe4b698143180c24ac0a**, which arrived during this review. The live-head guard remains enforced. Existing real-browser results above/below are retained with their original dates; new-head browser/CI results will be recorded on the existing PR, not assumed from an older head.
- The latest #144 and #142 heads passed the 30 existing independent operations cases; the extended address-client checks bring that candidate slice to **39/39**. This does not prove the entire driver acceptance suite: its pending-button and explicit 409 retry cases remain under independent review in SCRUM-250.
- The real GPS/ETA APIs (#143/#153) are accepted. #144 remains an unmerged Draft and accepted develop still ships the sample Driver Today screen. The Parent map is suitable for independent review of its own implementation, with final driver integration and independent approval still required. Draft status is unchanged by user instruction.
- Local Windows production build exits successfully with the previously documented node_modules-junction standalone-copy EPERM warning; this does not certify a Windows standalone deployment. Hosted CI uses fresh dependencies.


## Independent frontend review packet and actual driver UI slice — 15 November 2026

Latest live audit: develop remains `3798b40d2364a738f29dbf2c1d33bbaa1cd9601c`. #144 is now marked Ready, but its source is still exact `e3ec66670324a77edfe014dec7a00f18ee39ac3c`, with null replay adapter and no formal approval. Its readiness flag is not accepted as completion. No teammate branch, Jira status, PR merge or Ready flag was changed.

Closed the remaining independently executable review-evidence gap: **two actual production frontends now run against the same accepted backend**. The immutable, tracked-clean #144 checkout serves the driver UI on loopback 4192; this branch serves the Parent UI on 4180. Actual password/2FA, the driver's Start/Share/Stop buttons, canonical consent/location requests and the Parent's real Leaflet/countdown are exercised together. Browser GPS is deliberately simulated, but no business response is mocked. Both screens are checked at 360px with role boundaries and selected-child isolation. Existing server STALE/afternoon/privacy tests remain unchanged.

`review-parent-driver.mjs` creates a content-addressed test launcher without changing the shared runner. It guards the exact candidate SHA, clean tracked source, matching dependency lock, empty loopback PostgreSQL and occupied ports; configures only the two local frontend origins; and tears down both owned frontends through the existing runner. The candidate is built independently and checked tracked-clean again after execution. The new PostgreSQL CI workflow checks that live #144 still matches the reviewed SHA, checks out that immutable source separately, installs dependencies separately and runs this same test. A future candidate change fails the guard until independently reviewed, rather than silently presenting old evidence as current. No sensitive logs/traces/database files are uploaded.

| Executed check | Result |
| --- | --- |
| New actual driver UI → Parent UI / accepted backend browser | **1 passed**, exit 0; fresh PostgreSQL/Flyway and real password/2FA |
| Full frontend regression | **840 passed**, zero unexpected failures; 1 existing expected failure, 6 existing skips (847; 63 files) |
| ESLint / both production frontend builds / diff check | Passed |
| Standalone TypeScript | Same **13 develop baseline diagnostics**, zero introduced |
| Original 65 driver acceptance cases on unchanged #144 | Fresh run **65/65 passed** (evidence remains with SCRUM-250) |
| Independent operations candidates #144/#142 | Fresh run **28 passed / 2 genuine failures**: null replay and address clients (evidence remains with SCRUM-282) |

### Acceptance-criteria review map

| SCRUM-279 criterion | Review evidence |
| --- | --- |
| Authenticated live map/countdown for linked child's authorized bus | New actual driver/Parent UI browser; real GPS/ETA client and strict parser; role/foreign-child tests |
| Live estimate distinct from planned school-local pickup | Existing real server ETA scenario and production navigation/ETA tests, retained unchanged |
| Stale/missing GPS or ETA never fabricated as live | Existing real server STALE/withdrawal/afternoon/null scenario; monotonic aging, null parsing and zero handling regressions |
| Multiple children, no active run, loading/error/retry, authorization/navigation | Tracking/Home/session/client suites and the new sibling/withdrawal/role browser slice |
| Real driver-to-parent slice and 360px usability | New two-production-UI scenario, both 360px/no overflow; retained 44px Parent Leaflet/navigation checks |

**Independent review can proceed now on the Parent frontend**, against the accepted GPS/ETA backend and the exact observed driver candidate. This is a review recommendation, not a claim that SCRUM-273 or deployment integration is complete. Keep #149 a draft until Wassim explicitly approves changing the Ready flag. Merge/completion still require independent approval, current-head checks and team acceptance of the unfinished #144 dependency (replay, auth-expiry/reconnect and phone acceptance). Physical GPS is not certified by browser-device emulation.

#150 already preserves the GPS and Inbox composition and retains develop as target. Propagate this review verification through a normal own-branch merge into #150; merge order remains #149 then #150, with #150's full preferences/late work blocked by #158. Do not trade away either feature to simplify the page conflict.

Evidence: ignored `tmp/SCRUM-279-20261115-review/`, preserved browser histories and the exact candidate checkout. Source changes are isolated test/CI tooling and this dated report; Parent production behavior and existing failure assertions are unchanged. Hosted checks must be verified on the new commit after push.


## Accepted ETA integration and branch refresh — 15 November 2026

Normally merged latest accepted develop `3798b40d2364a738f29dbf2c1d33bbaa1cd9601c` into the existing branch, preserving all prior commits, tests and dated evidence. All four own-branch develop merges were clean; no conflict resolution or teammate feature edit was needed. #153/SCRUM-262 is now merged, as are GPS #143, replay #155, reassignment #156 and attendance #157. This section supersedes the older ETA-unavailable status below.

Production now enables the canonical GPS/ETA client on the existing child bus-location endpoint. The countdown uses server seconds and monotonic elapsed time, planned school-local times remain separate, and stale/missing GPS never supplies a live timer or marker. Existing child/account/client resets, Home/Absences navigation and authorization remain intact. A new production-navigation regression proves real-client ETA activation; the existing GPS-only and all prior ETA tests remain.

| Executed check | Result |
| --- | --- |
| Focused tracking/client/navigation/authentication | **74 passed** (7 files) |
| Full frontend regression | **840 passed**, 0 unexpected failures; 1 existing expected failure, 6 existing skips (847 tests; 63 files) |
| ESLint / production build / git diff --check | Passed |
| Standalone TypeScript | Exit 2: exactly the **13 develop baseline diagnostics**, zero introduced or removed (exact diagnostic comparison) |
| Real PostgreSQL/Flyway production Chromium | **1 passed**, launcher exit 0; all 14 migrations applied through V14 |

The extended real browser scenario checks actual password/2FA and cookie-authenticated APIs, Leaflet, server-derived countdown ticking, canonical stops remaining, separate planned pickup, sibling switching, real server STALE after 60 seconds (timer hidden), consent withdrawal and null estimate, confirmation removing the child's progress/estimate, afternoon ETA with null planned time, foreign/unknown child 404, wrong-role 403, signed-out 401, no 360px overflow, 44px map controls and route cleanup. No production responses were mocked. The driver feed was sent through actual driver APIs; browser/physical phone GPS and the unfinished #144 driver UI are not claimed.

Evidence: ignored `tmp/SCRUM-279-20261115/` (focused/regression/lint/build/typecheck, exact baseline comparison, browser log and exit JSON); Playwright artifacts remain ignored and prior histories are preserved. Browser CI uses PostgreSQL 16 and runs this same extended scenario; check the updated PR head's actual checks, not an older run. Source changes here are the accepted ETA switch, contract comments, navigation regression, extended browser test and its workflow description.

**Readiness: keep #149 a draft.** Accepted backend ETA/GPS are verified and no longer blockers. SCRUM-273/#144 remains an unfinished draft with null replay client and outstanding real driver/phone/auth-expiry integration. Complete/accept that dependency, verify the full driver UI-to-parent slice, then obtain independent review and green current-head checks before Ready. No Jira status changed and no PR was merged.


## Accepted backend refresh and weekend-safe verification — 14 November 2026

Merged only accepted develop `5da9d2c2f9b829747c47571dfb541d32a1f6aa64` into the existing #149 branch, preserving implementation and all prior evidence. Address #145 and Inbox #146 are accepted; ETA #153 remains open at `aef97a37f4c77cb0b56f153a65e5389dc6813804`, and #144 remains a draft at `e3ec66670324a77edfe014dec7a00f18ee39ac3c`. Production GPS stays real; production ETA stays explicitly disabled.

Added a test-classpath-only ticking Monday school clock and explicit source in the isolated review launcher. A Saturday/Sunday is a real production holiday, so run-dependent browser tests must control their school clock rather than skip the scenario or alter production date rules. The clock advances normally, preserving the real 60-second stale boundary. The original empty loopback PostgreSQL and account guards remain; auth/JWT use real time. No teammate production file changed. The small test configuration is byte-identical to our Inbox/driver review support, allowing either own-branch merge order without overwriting a shared file.

| Executed check | Result |
| --- | --- |
| Focused tracking/client/navigation | 65 passed |
| Full frontend regression | 829 passed / 0 unexpected failures / 1 existing expected failure / 6 existing skips (836; 62 files) |
| ESLint / production build | Passed |
| Standalone TypeScript | Exactly 13 current accepted-develop diagnostics; zero introduced |
| Real PostgreSQL/Flyway + production Chromium GPS | **1 passed**, launcher exit 0; actual auth/2FA/APIs/Leaflet/child switch/server STALE/withdrawal/foreign-child denial/360px and cleanup |

Evidence: ignored `tmp/SCRUM-279-20261114/` and archived Playwright artifacts. New generated launchers use content-derived names so older versions are preserved. This is a controlled school-date test (Monday 2026-11-02), not real Nov 14 bus activity, physical-phone verification or accepted live ETA integration.

Remaining: merge/verify #153's actual ETA/progress, null/afternoon/confirmation cases before enabling ETA; finish/accept #144 and verify the complete real phone/driver-to-parent slice; independent review and required checks. Keep #149 a draft. The separate Inbox implementation stays on #150; no unmerged feature branch was copied here. No Jira statuses changed and no PR was merged.


## Dependency refresh and implementation — 12 November 2026

Accepted develop: `4cbfcc7172520e683366d6eaab482ff95015dba0` (merged #143 / SCRUM-261). Existing branch, commits, tests and dated evidence preserved. Only accepted develop was merged; no teammate feature was changed or merged.

### New behavior

- The production Parent page now supplies the real cookie-authenticated `getBusLocation` client to its existing Home/Absences/tracking composition. Bus tracking is a working, lazy navigation destination. Inbox remains unavailable. Missing GPS displays no marker or fabricated route.
- Prepared the additive SCRUM-262 contract from #153 at `aef97a37f4c77cb0b56f153a65e5389dc6813804`: `stopsLeft`, nullable `plannedTime`, and nullable `estimate { arrivesAt, secondsAway }` on the SAME child bus-location endpoint. Legacy merged GPS responses still parse; partial/inconsistent future responses fail explicitly.
- Added LiveEtaCountdown: server `secondsAway` minus monotonic elapsed time, independent of device wall-clock skew. Zero means due/waiting for confirmation, never confirmed arrival. School-local estimate and planned time are labeled separately. A stale/missing fix hides the countdown.
- ETA is explicitly **disabled in the production entry** until #153 is merged and verified. Only isolated test compositions enable it. No future backend implementation or fixture is imported into production.
- Preserved account/client/child/route/driver scope resets, old-response guards, authorization handling and passive GPS expiry. Added production-client navigation, ETA validation, zero/null, clock-skew, stale boundary, sibling switching and HTTP error recovery tests.
- Added a separate PostgreSQL Parent GPS browser CI job and test-only launcher, leaving all shared required CI checks intact. The real browser test uses actual authentication, APIs and Leaflet; its driver feed uses real API calls, not a claim of a physical phone GPS test.

### Actual integration defect found and fixed

A strengthened real browser run exposed a genuine parser bug: the server compares precise Duration against 60 seconds, then truncates `ageSeconds`. Valid `STALE` responses can therefore contain age **60**, not only 61+. Rejecting that response cleared the marker and showed an error until the next poll. The new regression failed before the fix and passes after it. The client now accepts authoritative STALE at 60, still rejects below 60, and never labels a STALE response live. The real browser check requires server STALE and the valid truncated age, not a guessed device-clock threshold.

The prepared ETA view now uses only canonical run plannedTime when that progress contract is enabled, so an afternoon/null plan is not replaced by the morning pickup snapshot. Production ETA remains disabled. A regression run that overlapped these final plan-display edits is preserved; final verification was rerun on stable source: all 836 tests executed with no unexpected failures.

### Current validation

| Check | Executed result |
| --- | --- |
| Focused tracking/client/navigation suites | 65 passed / 0 failed |
| Full frontend regression | 829 passed / 0 unexpected failures / 1 pre-existing expected failure / 6 pre-existing skips (836; 62 files) |
| ESLint / production build | Passed |
| Standalone TypeScript | Exactly 13 accepted-develop diagnostics; zero new errors (file/line/message comparison) |
| Prepared ETA/Leaflet Chromium at 360px | Passed, fixture-only; live timer, child switching, stale/missing GPS, 44px map controls and account reset |
| Production Home/Absences Chromium at 360px | Passed, fixture-only; long names, keyboard, child switching and 44px controls |
| Real merged GPS Chromium / PostgreSQL / Flyway | **1 passed**, launcher exit 0; all 10 migrations through V10, real password/2FA and APIs |
| Hosted CI | Separate Parent GPS job added; inspect live checks on this PR (not inferred from local results) |

The real GPS scenario verified actual production navigation/Leaflet marker, selected-child requests, local live-to-stale display AND server STALE after 60 seconds, sharing withdrawal removing the marker, 401/403/404 restrictions (including an existing foreign child), 44px map controls and no 360px overflow/crashes. Driver data was fed through real authenticated APIs; it is not a claim that the unmerged driver UI or physical GPS is accepted. ETA was visibly unavailable throughout. Route cleanup succeeded and the runner exited 0.

The initial fixture production-navigation attempt reached the correct UI with no page/console errors but timed out on page load. Its log/screenshot remain preserved; rerun passed unchanged assertions. All historical evidence remains intact.

Evidence: ignored `tmp/SCRUM-279-20261112/`, timestamped `tmp/parent-features-mobile/tracking/` and `tmp/parent-navigation-mobile/`, and ignored Playwright artifacts. Prior November 9/10 evidence remains historical.

### Remaining completion gates

#153 is open, targets develop, and defines the reviewed schema. Jira SCRUM-262 says Done, but the PR is unmerged: GitHub is the integration source of truth. Verify its eventual merge, actual live ETA/progress after confirmations, afternoon/null plans and stale/missing fallbacks before enabling ETA. #144 / SCRUM-273 remains a draft at `e3ec66670324a77edfe014dec7a00f18ee39ac3c`; accepted driver UI integration/physical-device GPS remains a separate gate. Keep #149 a draft and SCRUM-279 In Progress; independent Majd review, real complete slice and green required checks are still necessary.


## Follow-up implementation and verification — 10 November 2026

**Frontend work advanced; final integration remains blocked.** Jira stays In Progress and existing PR #149 stays a draft. Reused this branch, preserved snapshot `b35d787e997cfe5e06d31fda2b77a025d09260fb` and all original tests/reports, and merged accepted develop `8d62167fe2439843187218cabc40419304bd8d40` (SCRUM-249 / #147). No teammate branch or SCRUM-250/282 test evidence was modified.

### Implemented now

- Extracted the preserved Home/Absences screen into `ParentHome`; the page remains a thin production entry. Family views provide functional My children and Absences navigation, an authenticated linked-child picker, keyboard focus, and explicit optional feature compositions.
- Sidebar/brand links now return from an in-place child view to My children. The actual RoleGuard remains in place; its private content is keyed by school/account identity. Old child loads/refreshes cannot restore another account's private content.
- Future tracking/inbox destinations stay non-interactive Soon items when no accepted client composition is supplied. Withdrawing a supplied capability clears its private content and explains unavailability.
- A genuine 360px browser regression exposed long-name overflow in the existing Absences heading. Applied the same minimal wrapping fix in these two branches; the overflow assertion was preserved and rerun successfully. The original SCRUM-249 worktree/commit stays untouched.
- Added `ParentTrackingHome`, a prepared composition of the actual tracking panel with the linked-child selector and Home/Absences navigation. The production page supplies no tracking client, so Bus tracking remains a non-interactive Soon item and no unmerged endpoint is called.
- Tracking response identity now includes the API instance, child, route, driver and run direction. Old fixes disappear when the authorized context changes; late old-child replies cannot replace the current child, and no map remains once the child stops waiting.
- Retained the canonical LIVE/STALE/UNAVAILABLE rules and separate planned pickup wording. Missing or expired fixes never produce a live marker or an invented estimate. The existing countdown remains a tested presentation component; no ETA DTO/adapter was invented.
- Browser testing reproduced a 30x30px Leaflet zoom target. A parent-map-only CSS module now uses the existing 44px tap-target token, without changing shared maps or teammate branches. The unchanged >=44px browser assertion passes after the fix.

The shared navigation, session boundaries and browser-review helpers are identical across the two ticket branches so either merge order can reconcile the common code. No additional package, production feature flag, sample client or production endpoint was introduced.

### Executed validation

| Check | Actual result |
| --- | --- |
| Focused parent/navigation/auth/component/client suites | **128 passed / 0 failed** |
| Full frontend regression | **803 passed / 0 unexpected failures / 1 existing expected failure / 6 existing skips (810 total; 61 files)** |
| ESLint, final source and tools | **Passed** |
| Production build, including same-origin proxy mode | **Passed** |
| Standalone TypeScript | **13 existing baseline diagnostics, zero introduced**; exact file/line/error comparison with verified develop `8d62167` |
| Actual Chromium production-entry UI at 360px | **Passed, fixture-only** |
| Actual prepared tracking components at 360px | **Passed, fixture-only** |
| git diff --check | Checked before commit |
| Real tracking backend integration | **Blocked / not claimed** |

After the final scoped zoom CSS was added, its 16 affected component tests, the unchanged browser target check, ESLint, production build and TypeScript comparison were rerun. Full current-head GitHub CI remains an additional gate.

The production-entry browser check used real Next navigation, production CSS/CSP and explicit auth/children/absence fixtures. It measured both Home and Absences at 360px with long names, 44px new controls, child switching, keyboard activation, sidebar return, no overflow/crashes and no calls to unmerged feature APIs. Screenshots were inspected.

The isolated component browser test rendered the actual MapView/Leaflet code with explicitly injected fixture locations and fixture tiles. It verified an actual marker, child switching, LIVE to STALE to UNAVAILABLE, removal of the marker, 44px zoom targets, no horizontal overflow and account reset. This is frontend component evidence, not a live driver/GPS/backend pass.

Initial test-harness issues (unsupported RTL option, missing test router, JSX escaping, isolated module resolution and correct API interception), a production-review setup mismatch (same-origin build required; port 4190 is restricted by Fetch/Chromium), and the actual wrapping/zoom failures are retained in ignored logs. Setup issues were corrected; actual UI defects were fixed in source. No failing criterion was skipped, marked expected-failure or softened. The one expected failure/six skips above belong to the existing baseline.

Evidence: `tmp/SCRUM-279-20261110/` (focused/full regression, lint/build/type comparison and review logs); timestamped runs under `tmp/parent-navigation-mobile/` and `tmp/parent-features-mobile/tracking/`, with `latest.json` pointers. Browser fixtures live only in the review harness/ignored generated entries; screenshots, logs and caches are not committed. No backend integration or CI success is inferred from fixture passes.

### Exact remaining dependencies and completion steps

1. PR #143 / SCRUM-261 remains open and unmerged at `c58d9119e68fd890c4a1d263a94f1247fcf25ee8`. Recheck the accepted GPS contract and migrations before enabling `getBusLocation` in production.
2. SCRUM-262 is still To Do, with no agreed ETA endpoint/fields. Implement the real adapter and stale/missing-GPS fallback only from that contract; planned pickup is never a live estimate.
3. PR #144 / SCRUM-273 remains an unfinished draft at `d890429ab09e24869cf3d389c7bad3776927332a`; actual driver consent/location sending and its defects still require Majd's work. This branch does not modify or merge it.
4. After dependencies are integrated, enable the prepared composition under the real authenticated parent identity and verify actual driver-to-parent consent, ownership, pickup/dropoff cut-off, freshness and ETA behavior on PostgreSQL and mobile. Repeat CI and obtain Majd's independent acceptance review.

**Readiness:** frontend code can receive preliminary review, but this remains a blocked draft and is not ready for final independent acceptance/merge. Keep the ticket In Progress until all real-stack criteria are met.

### Current PR file scope (21 files)

- `docs/testing/SCRUM-279/SCRUM-279-test-report.md`
- `frontend/e2e/parent-features.review.mjs`
- `frontend/e2e/parent-navigation.review.mjs`
- `frontend/src/app/(parent)/parent/AbsencesPanel.tsx`
- `frontend/src/app/(parent)/parent/ArrivalCountdown.test.tsx`
- `frontend/src/app/(parent)/parent/ArrivalCountdown.tsx`
- `frontend/src/app/(parent)/parent/ParentFeatures.authorization.test.tsx`
- `frontend/src/app/(parent)/parent/ParentHome.navigation.test.tsx`
- `frontend/src/app/(parent)/parent/ParentHome.tsx`
- `frontend/src/app/(parent)/parent/ParentSession.test.tsx`
- `frontend/src/app/(parent)/parent/ParentTrackingHome.test.tsx`
- `frontend/src/app/(parent)/parent/ParentTrackingHome.tsx`
- `frontend/src/app/(parent)/parent/TrackingPanel.module.css`
- `frontend/src/app/(parent)/parent/TrackingPanel.test.tsx`
- `frontend/src/app/(parent)/parent/TrackingPanel.tsx`
- `frontend/src/app/(parent)/parent/layout.test.tsx`
- `frontend/src/app/(parent)/parent/layout.tsx`
- `frontend/src/app/(parent)/parent/page.tsx`
- `frontend/src/lib/api/parentTracking.test.ts`
- `frontend/src/lib/api/parentTracking.ts`
- `frontend/src/test-support/parentNavigation.ts`

Earlier dated sections below are preserved historical evidence.


## Status — 9 November 2026

PARTIALLY COMPLETE / integration BLOCKED. Jira In Progress. Branch feature/SCRUM-279-parent-live-map, based on develop 8a249e8. No backend source was copied or modified.

## Implemented independently

- Typed authenticated GPS client from PR #143's canonical runs.md contract at c58d911: encoded child path, cookie session, exact LIVE/STALE/UNAVAILABLE shape, finite/ranged coordinates, server freshness and malformed-response validation.
- TrackingPanel handles loading, unavailable/no-run/not-started/finished/no-longer-waiting, stale fixes, errors/retry and expired sessions. It uses the shared MapView, distinguishes planned pickup time from estimates, clears prior-child coordinates on switching/error, polls without overlapping a normal request, and ages a fix out during a stalled poll.
- ArrivalCountdown is a pure presentation component accepting a Date view prop and explicit validity. It updates each second, rejects missing/invalid/unverified values and does not claim the bus arrived after an estimate expires. This is NOT an ETA DTO or endpoint proposal.
- Existing authentication/navigation is untouched. Components and client are deliberately not mounted in a production route while the upstream APIs are unmerged. There are no production fixtures or invented live locations/times.

## Executed validation

| Check | Actual result |
| --- | --- |
| Focused GPS client/TrackingPanel | 22 passed |
| Countdown cases included in full regression | 4 passed |
| Full frontend regression | 735 passed, 1 existing expected failure, 6 existing skips; 742 total / 54 files |
| Full ESLint | Passed, no warnings |
| Production build | Passed |
| Standalone tsc | Fails with 13 existing develop test diagnostics; no new tracking/countdown diagnostic |
| Real driver-to-parent/GPS/ETA browser slice | Blocked, NOT executed |
| Actual new panel at 360px | Unverified; uses shared responsive card/map controls but is not a rendered-browser claim |

Tests use explicit test-only fixtures/injected API boundaries. Unit success is not backend integration. Ignored evidence is under tmp/SCRUM-279.

## Blocking dependencies and completion steps

1. SCRUM-261 / #143 remains unmerged; preserve V10 → V11 → V12 migration order. Recheck its final contract and wire getBusLocation only after the accepted API is available.
2. SCRUM-262 has no defined/merged ETA contract. Do not infer an ETA from the planned pickup time or add guessed fields; implement an adapter and validity rules only from that contract.
3. SCRUM-273 / #144 remains a draft with GPS/replay APIs null and known defects. The real driver-to-parent slice is unavailable.
4. Add Parent Home child selection/navigation and compose the components with authenticated real data after those gates. Verify both multiple-child isolation and server ownership with actual sessions, consent/end transitions, stale/missing GPS/ETA, persistence/error recovery and the actual 360px Leaflet UI.
5. Repeat regression/CI, request Majd's independent review, and mark ready only when all acceptance criteria are verified. No automatic merge or Done transition.

## Files

- frontend/src/lib/api/parentTracking.ts and parentTracking.test.ts
- frontend/src/app/(parent)/parent/TrackingPanel.tsx and TrackingPanel.test.tsx
- frontend/src/app/(parent)/parent/ArrivalCountdown.tsx and ArrivalCountdown.test.tsx
- This report

A clearly blocked draft is permitted by the current execution request; green preparation CI does not make this acceptance-complete.
