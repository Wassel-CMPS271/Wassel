# SCRUM-280 â€” Parent inbox and notification preferences

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
