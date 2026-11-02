# SCRUM-250 — Independent driver frontend tests

## Current independent verification — 3 November 2026

Preserved the original seven test/report files first in local snapshot 2f958fa. Updated only the test branch by merging exact PR #103 head d11b762fb726c2c8825b6c544a44cadd48c87df5 and PR #93's later approved fix f525a8a1952ed0fe99bd5d47b23f3b1375f1db42. Correct stack: #103 → #93 → #89 → develop. PR #89 still conflicts with current develop. No Majd production implementation was edited by the tester.

**Independent suite: 64 passed, 1 failed, 0 skips (65 total).** The unchanged onboard-child End Run warning now passes with the approved fix; all nine maps/call cases pass. The remaining reproducible failure is real-endpoint integration: the page still imports getDriverTodaySample/confirmStudentSample and RunAction still imports sample start/end calls, so an unmocked screen never GETs /api/driver/runs/today. Backend SCRUM-233/234/235/239 is now merged; this is an outstanding feature criterion, not an unavailable backend excuse. Findings are posted on #89 and #93. No expected-failure annotation, skip or weakened assertion was added.

Maps/call test locators were adapted to the feature's valid descriptive accessible names ("Open directions to [name]'s stop" and "Call [name]'s parent"); coordinate, zero-coordinate, missing/partial pin, phone, empty-phone, keyboard and >=44px assertions are unchanged. Initial locator mismatches and a resource-starved authorization timeout are retained in earlier logs; the bounded rerun passes authorization and all link cases. No product defect was claimed for the descriptive labels.

**Full regression: 605 passed, 1 failed (the same real-endpoint gate), 7 existing skipped**, 44 files. ESLint and serial production build passed. An earlier build was stopped only to relieve local memory pressure; its logs remain preserved. A Chromium 360px production-frontend UI check passed actual maps/tel hrefs, coordinates, >=44px geometry, keyboard focus, no horizontal overflow or page errors. The settled-animation screenshot was inspected. This browser check used an explicit session fixture and the feature's existing sample run source; it is **not** real backend E2E. Earlier animation-in-progress screenshots are retained.

Ignored evidence: tmp/SCRUM-250-final/{independent-bounded.log,full-regression.log,lint.log,build-serial.log,mobile-check-settled-final.log,driver-360px-settled.png}. PR #103's exact two-file diff was reviewed and a formal COMMENT review posted; no automatic approval/merge. Existing P1 warning feedback on #93 was confirmed fixed, while the real-endpoint criterion remains explicitly open.

Remaining: Majd must wire the real authenticated run client, remove the sample source, account for the current contract (including removedFromRoute), reconcile the stack with develop and pass feature checks/review. Retest the unchanged independent real-endpoint gate and actual browser/backend actions when available. Then transplant only the seven independent test/support/report files onto the accepted merged feature base, refresh all checks and submit a complete develop test PR. Until then keep SCRUM-250 In Progress, local and preserved; do not submit inherited unmerged feature code as a test PR. No teammate Jira status changed.

## Historical verification — 30 October 2026

Date: 2026-10-30, Asia/Beirut. Tester: Wassim Fawaz, independent of the feature author.

## Status and source

**In Progress; blocked by a reproduced feature defect and missing dependencies.** No SCRUM-250 commit, push, PR, approval, or merge was performed. No failing test was skipped, marked expected-failure, or weakened. No production code or teammate Jira status was changed.

| Dependency | Reviewed source / status |
|---|---|
| [SCRUM-243 / PR #89](https://github.com/Wassel-CMPS271/Wassel/pull/89) | Open to develop; `cc6a97c94520cbc36a4961a553f66427935b0063` |
| [SCRUM-244 / PR #93](https://github.com/Wassel-CMPS271/Wassel/pull/93) | Open, stacked on #89; `28025143de4a19e1042eb62705218d5ddf475711` |
| SCRUM-245 | Jira To Do; no implementation branch or PR found |
| [SCRUM-233 / PR #90](https://github.com/Wassel-CMPS271/Wassel/pull/90) | Open; daily runs not merged |
| [SCRUM-234 / PR #94](https://github.com/Wassel-CMPS271/Wassel/pull/94) | Open, stacked on #90; start/end not merged |
| SCRUM-235 / SCRUM-239 | Jira To Do; real confirmations / absence flags pending |

Worktree: `C:\Users\User\.codex\worktrees\scrum-250-driver-tests\Wassel`. Branch: `test/SCRUM-250-driver-screen-tests`, created at PR #93's exact head. #93 was reviewed against #89 rather than treating its inherited changes as a standalone develop diff. Existing worktrees, branches, stashes, and recovered evidence were preserved. Root instructions and frontend/CLAUDE.md were read; app-level AGENTS.md files were absent.

This is a provisional testing base. Once dependencies merge, transplant **only** the independent tests and report onto the merged develop implementation. Do not submit Majd's unmerged feature commits as a test PR.

## Method

Jira criteria were retrieved before feature code was inspected. Expected behavior comes from SCRUM-243/244/245 and docs/contracts/runs.md, not production rule helpers or the author's assertions. `driverContract.ts` builds independent inputs. The UI suites replace only the current sample-client boundary; page, StopCard, RunAction, transition helpers, layout and RoleGuard remain real. A separate unmocked-screen fetch test deliberately exposes the outstanding real-endpoint gate. HTTP adapter tests use real request() with stubbed fetch and check session cookies, methods, JSON bodies, server errors and retry. Passing adapter tests do not prove the screen is wired to them.

Real animation visibility is awaited, rather than removed from assertions. No timeouts were increased. Maps destination checks allow standard Google/Apple/OSM/native links rather than requiring the example provider in Jira.

## Acceptance coverage

| Criterion | Independent test / evidence | Result |
|---|---|---|
| 243: next morning/afternoon run, ordered students | first unfinished run, ordered names, all-finished state | Pass |
| 243: highlighted next stop and done stops | next/done rows; morning versus afternoon confirmation semantics | Pass |
| 243: absent and all-absent stop | skip, confirmation overrides absence, all-absent roster including siblings at one address | Pass |
| 243: no run and loading | holiday, SCHOOL_DAY/HALF_DAY without route, unresolved load | Pass |
| 243: 360px usability | narrow-viewport action test; actual production Chromium layout/keyboard check | Pass for current screen/sample |
| 243: real endpoint, sample deleted | real-endpoint.independent.test.tsx requires an actual GET and renders its response | **Fail: provisional sample wiring** |
| 244: Start/End only when legal | NOT_STARTED / IN_PROGRESS / FINISHED matrix | Pass |
| 244: student buttons and >=44px targets | legal confirmation matrix; absent child pickup; computed sizes | Pass |
| 244: updates without reload | start/pickup/dropoff/end lifecycle, Not present advances next stop, one day load | Pass |
| 244: plain errors and retry | failed start/end/student confirmation, generic 5xx versus server detail | Pass |
| 244: no double-submit | deferred requests and repeated taps; other students remain enabled | Pass |
| 244: real mutation endpoints, no samples | runs.ts adapter contract passes; feature still imports sample actions | **Blocked: integration pending** |
| Contract: warn when children remain onboard | morning pickedUp=1, droppedOff=0 must confirm before ending | **Fail: product defect** |
| Concurrent confirmations | out-of-order successful replies preserve both displayed students | Pass |
| Role-based visibility | actual driver layout/RoleGuard: pending auth, DRIVER, other three roles, 401, outage | Pass (frontend only) |
| 245: maps at stop coordinates | positive destination and valid zero-coordinate cases | **Fail: implementation absent** |
| 245: call the guardian | actual tel link from this student's phone | **Fail: implementation absent** |
| 245: hide unavailable links | partial/missing coordinates, empty/whitespace phone | Assertions pass; overall feature remains unverified without positive cases |
| 245: tappable links | native focusable maps/call links with >=44px minimum height | **Fail: implementation absent** |

Suites: `driver.independent.test.tsx` (35), `maps-call.independent.test.tsx` (9), `real-endpoint.independent.test.tsx` (1), `authorization.independent.test.tsx` (7), `runs.independent.test.ts` (13). UI files sit next to the driver page; the adapter suite sits next to runs.ts.

## Verification

| Check | Result |
|---|---|
| Final independent suites | **65 tests: 59 passed, 6 failed, none skipped** |
| Full frontend regression | **607 tests: 594 passed, 6 failed, 7 existing skipped**, 43 files |
| Existing tests outside new suites | **535 passed, 7 skipped, no failures** |
| ESLint, including final test revisions | Passed |
| Production npm run build | Passed |
| Standalone tsc --noEmit | Fails at pre-existing routing.independent.test.tsx:105 (TS2322); the baseline-only check reproduces the identical error with all SCRUM-250 files excluded |
| git diff --check | Passed; new-file whitespace checked separately |
| Actual 360px Chromium | Passed: viewport/document both 360px, all seven driver action targets 44px tall and in bounds, no browser errors, confirm focus and Escape behavior correct |
| New SCRUM-250 GitHub CI run | Not submitted while acceptance tests fail and dependencies are missing |

The six failures are exactly the onboard warning, maps destination, zero-coordinate maps, guardian tel link, maps/call touch targets, and real HTTP screen gate. The first test-development run also caught transient opacity-zero assertions; awaiting actual entrance visibility corrected those harness issues while preserving the six real acceptance failures. No feature assertion was weakened.

The supplemental browser check uses the production build and real components with only /api/auth/me intercepted. The screen's existing sample client remains visible as a delivery gap. It does not prove real login/backend integration, all possible long strings, or future maps/call layout. Local evidence is in ignored `tmp/SCRUM-250/`: independent/regression JSON and logs, lint/build/typecheck logs, mobile metrics, screenshot and script. The browser script uses existing Playwright from the preserved SCRUM-230 worktree; no package or CI dependency was added. Its owned local server was stopped after the check.

## Defects and reviews

**D1 — Onboard-child end warning.** RunAction's unconfirmedCount only counts next/pending stops. Morning PICKED_UP stops are already done, so a run with all children picked up and none dropped off ends immediately, contradicting the contract's counts-based warning. Posted [REQUEST_CHANGES on #93](https://github.com/Wassel-CMPS271/Wassel/pull/93#pullrequestreview-5711466760), anchored to RunAction.tsx line 27. The author should include children onboard (`pickedUp - droppedOff > 0`) while preserving the all-absent/no-onboard case. The existing feature test `ends a run with every stop done straight away, without asking` uses PICKED_UP stops and also needs reconciliation by the feature owner; it was not edited.

**D2 — Maps/call missing.** SCRUM-245 is not implemented in the available stack; four positive/link-size tests fail. The blocker is recorded on SCRUM-250, not fabricated as a defect on a different feature PR.

**D3 — Real screen integration pending.** The unmocked page makes zero /api/driver/runs/today calls and its mutations use samples. This is provisionally allowed while backend dependencies are unmerged, but fails final completion. Posted a [COMMENT review on #89](https://github.com/Wassel-CMPS271/Wassel/pull/89#pullrequestreview-5711467600) documenting the follow-up without approving or merging.

**Baseline type error.** Existing SCRUM-229 test line 105 assigns a callback inferred as void to a Handler requiring Response, Promise<Response>, or undefined. No SCRUM-250 file is reported by tsc. A temporary config excluded only the new tests/fixture without moving files or modifying project configuration; it exited 2 with the identical TS2322 at the same existing line (`typecheck-baseline.log`). The existing routing test is left unchanged.

## CI and next steps

Existing frontend-build runs npm test with default Vitest discovery, which includes these five new suites. No CI filter/config change is needed. Current feature CI was green: [#89](https://github.com/Wassel-CMPS271/Wassel/actions/runs/40884567459), [#93](https://github.com/Wassel-CMPS271/Wassel/actions/runs/40953904014), [#90](https://github.com/Wassel-CMPS271/Wassel/actions/runs/40898529742), [#94](https://github.com/Wassel-CMPS271/Wassel/actions/runs/40965248082). #93 targets #89's branch, so its current run is a push run; pull_request filters name develop/main. These green runs do not include the new independent tests.

From frontend: `npm ci`, `npm test -- --maxWorkers=2`, `npm run lint`, `npm run build`. For only independent tests, pass the five suite paths to npm test after `--`. Two workers only bound local resource use; no assertions, retry policy or timeouts change.

Completion requires: D1 fixed by the feature owner; SCRUM-245 available and passing; real SCRUM-233/234/235/239 integration and sample removal; baseline typecheck issue resolved or explicitly handled by its owner; rebase only independent changes onto merged develop; rerun full verification; then commit, push, create a regular develop PR, request an independent reviewer, verify its CI and move SCRUM-250 to In Review. Done requires a merged, satisfied PR. SCRUM-250 remains In Progress with the blockers recorded.
