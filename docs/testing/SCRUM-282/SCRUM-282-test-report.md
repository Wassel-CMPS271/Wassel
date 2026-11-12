# SCRUM-282 â€” Independent operations UI tests

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
