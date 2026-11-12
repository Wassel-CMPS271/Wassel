# SCRUM-279 — Parent live bus map and countdown

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


## Status â€” 9 November 2026

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

1. SCRUM-261 / #143 remains unmerged; preserve V10 â†’ V11 â†’ V12 migration order. Recheck its final contract and wire getBusLocation only after the accepted API is available.
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
