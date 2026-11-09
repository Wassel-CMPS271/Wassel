# SCRUM-279 â€” Parent live bus map and countdown

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
