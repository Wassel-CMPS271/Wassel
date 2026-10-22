# SCRUM-229 — Independent routing frontend verification

Verified on 2026-10-20 on `test/SCRUM-229-routing-frontend-tests` against current `develop`.
Jira SCRUM-229 acceptance criteria and `docs/contracts/routing.md` define the expectations.
No production components, package manifests, lockfiles or existing skipped tests were changed.

## Coverage and independence

The new suites replace only fetch and browser-only Leaflet loading. They use the real API clients,
request serialization, ProblemDetail parsing, screen components, forms, state updates, RouteMap,
MapView and dnd-kit context. UUID-shaped route, proposal and student IDs and HTTP response shapes
follow the contract. The feature author's API-function mocks are not reused.

| Requirement | Independent coverage and retained complementary coverage |
|---|---|
| Route management | List loading/error/retry and empty state; create followed by edit with exact POST/PUT payloads, trimmed name, cookie credentials and server-returned name; client validation blocks POST; backend field errors and retry; network failure keeps the form and prevents a phantom route. Existing form suites retain edit validation/error and option-loading checks. |
| Assignment and seats | Real roster-minus-route lookup; add student 14 to a 14-seat vehicle, refuse student 15 without a request, remove and free a seat; exact assignment/removal endpoints; concurrent HTTP 409 capacity conflict reloads server assignments; over-capacity warning and failed removal preserve state. |
| Manual ordering | Exact PUT with the complete UUID order, displayed order and numbered markers from the returned Route; backend errors.studentIds preserve old order; real Space pickup and Escape cancellation send no mutation; reordering works after optimization apply. Existing tests retain Move up/down, keyboard instructions and drag-coordinate logic. |
| Optimization | POST preview does not mutate the current route; current/proposed names and arrival times, time saved; exact apply POST and discard DELETE, returned route updates, discard isolation; known and future infeasible reason messages; missing-pin 409 link; network/server failures; failed apply/discard retain comparison; stale apply 409 resynchronizes server state. |
| Maps | Independent reorder workflow uses real RouteMap/MapView to verify numbered stop order and school arrival popup. Existing RouteMap/LeafletMap suites retain ordered paths, school marker, popup names/times, missing-coordinate filtering, grouped siblings, map clicks, pin dragging and arrow keys. |
| Pin placement | Real roster/dialog-to-PATCH flow sets/moves a pin, checks exact coordinates, reopens at server-canonical coordinates; latitude/longitude validation preserves unsaved pin; partial address success followed by pin failure retries only the pin; cancel sends no mutation; Needs pin disappears only after a successful response. |
| Missing coordinates | Independent route waiting-list indicator and roster Needs pin indicator; preserved RouteMap and shared map tests cover missing-coordinate stops and textual alternatives. |
| CI | Existing CI runs npm ci, lint, tests and production build on pull requests to develop. No workflow changes required. |

New executable cases: **30** (24 routing workflow cases and 6 pin workflow cases).
Shared setup is in `frontend/src/test-support/routingContract.tsx`.

## Timing stability

The existing Space/Escape route test waited one timer tick before sending Escape. dnd-kit's
KeyboardSensor registers its keydown listener asynchronously. The test now observes that
registration before sending Escape. Its pickup, cancellation and no-request assertions are retained.
The new keyboard case uses the same readiness condition. There are no added sleeps or disabled tests.

## Verification

- Independent suites: **30 passed, 0 failed, 0 skipped**.
- Complete frontend `npm run test`: **505 passed, 0 failed, 7 existing skips**, all 36 files passed.
- Shuffled affected suites, seed 229: **118 passed, 0 failed**, all 4 files passed.
- `npm run lint`: passed without diagnostics.
- `npm run build`: passed, including TypeScript checking, page generation and build traces.
- `git diff --check`: passed.

The initial dependency directory lacked the merged SCRUM-221 `@dnd-kit/sortable` package,
preventing the pre-existing detail suites from loading. `npm ci` restored the exact lockfile;
package files were preserved. New-test adapter defects found during development were corrected:
React popup content must be rendered rather than JSON-serialized, and opening the pickup dialog
requires the parent-list HTTP lookup. No new production defect was established.

Commands (from `frontend/`):

```powershell
npm.cmd ci
npm.cmd run test -- independent --reporter=verbose
npm.cmd run test
npm.cmd run lint
npm.cmd run build
npm.cmd run test -- 'routes/[routeId]/page.test.tsx' 'routes/[routeId]/page.optimization.test.tsx' independent --sequence.shuffle --sequence.seed=229
```

## Review of Majd's implementation

Reviewed the merged source, PR changes and existing review discussions for:

- SCRUM-218: PR #46 — list/form loading, creation, editing and validation.
- SCRUM-219: PR #53 — assignment, seat counter, capacity and error resynchronization.
- SCRUM-220: PR #63 — route markers, sibling grouping, school, paths and missing-pin alternatives.
- SCRUM-221: PR #68 — proposal lifecycle, current/proposed comparison, stale proposals and manual reorder;
  its prior review reported intermittent timing under load. The sensor readiness change and shuffled
  verification address the test-timing risk without changing production behavior or expectations.
- SCRUM-222: PR #52 — controlled pin, location endpoint, validation and partial-save retry.

No new reproducible production bug was found in these tested paths. This is retrospective review
of the merged implementation, not a claim to have run each historical PR checkout.
GitHub review listings confirmed no SCRUM-229 retrospective reviews were submitted. Automatic
approval review rejected posting a historical PR comment; the user then chose to retain these
findings in SCRUM-229 documentation. No further historical comments will be posted.

## Limits and preserved work

These are component/HTTP-boundary tests, not live backend or real-browser E2E tests. Leaflet's
browser rendering is adapted in workflow tests; pointer drop geometry is supplied where jsdom
has no layout, while keyboard sensor activation/cancellation uses real events. Tile networking,
visual/mobile layout and production backend concurrency require separate integration verification.
Existing Leaflet tests still exercise the map event handlers independently.

The seven pre-existing skipped cases concern calendar deletion, vehicle retry/session expiry,
driver retry/deactivation and student retry/server filtering. None was added, removed or weakened
by SCRUM-229. They remain tracked limitations outside this ticket's changes.
Untracked `AGENTS.md` and the existing SCRUM-228 stash are preserved. The UUID worktree is untouched.
