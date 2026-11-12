# SCRUM-280 — Parent inbox and notification preferences

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
