# SCRUM-282 â€” Independent operations UI tests

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
