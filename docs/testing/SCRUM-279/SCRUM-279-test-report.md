# SCRUM-279 — Parent live bus map and countdown

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
