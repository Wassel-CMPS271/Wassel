# SCRUM-282 â€” Independent operations UI tests

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
