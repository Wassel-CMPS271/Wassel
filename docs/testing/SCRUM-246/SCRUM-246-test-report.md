# SCRUM-246 — independent tests for the parent screens

Tester: Majd. Author of the screens: Wassim (PR #119 for SCRUM-248, PR #147 for SCRUM-249, both merged into develop).

## Scope

- **SCRUM-248 — parent home** (children, route, driver, pickup time, call driver). In scope.
- **SCRUM-249 — absences** (report and cancel). In scope.
- **SCRUM-251 — run status on the parent home.** Left out. It was pulled into develop, but Wassim's own tests (`run-status.test.tsx`) already cover it, and SCRUM-278 (PR #169) separately tests the live map and run status independently. Adding a third set here would only duplicate that coverage.

## Method

The tests were written from the Jira acceptance criteria and the contract (`docs/contracts/runs.md` plus `docs/contracts/samples/runs/parent-children.json` and `absences.json`), **not** from reading `ChildTransportCard.tsx`, `ParentHome.tsx`, `AbsencesPanel.tsx` or the `lib/api` modules. Control names ("Absence date", "Cancel absence", "Confirm cancellation", …) were found by rendering the real screen and reading its labels back, not by reading the component source.

The production component and API files were opened only afterwards, for one purpose: to make the five temporary breakages described below and confirm each test can actually fail. Nothing in the test files or the helper was written with knowledge of how the components are implemented internally.

Every test renders the real page inside the real layout (`RoleGuard`, `UserBlock`, the real `request()` client in `lib/api/client.ts`). Only `fetch` and `next/navigation` are replaced, plus the `Date` clock for the absence date-picking tests. No API client is mocked.

## Files

| File | Purpose |
|---|---|
| `frontend/src/test-support/parentScreensContract.ts` | Fake backend behind a stubbed `fetch`: the contract sample data, plus a stateful absences store that follows the rules in `runs.md` (repeat → 200, overlap → 409, past date → 400, cancel → 204/409/404). No production parser or oracle is imported. |
| `frontend/src/app/(parent)/parent/home.independent.test.tsx` | 11 tests for SCRUM-248 (H1–H6). |
| `frontend/src/app/(parent)/parent/absences.independent.test.tsx` | 21 tests for SCRUM-249 (A1–A7). |

## Results: SCRUM-248 (parent home)

| Criterion | Test file | Result |
|---|---|---|
| H1 — each child with route, driver's name, vehicle plate, expected pickup time | home.independent.test.tsx | Pass (2 tests) |
| H2 — "Call driver" dials the driver's phone (`tel:`) | home.independent.test.tsx | Pass |
| H3 — a child with no route shows a clear message, not an empty card | home.independent.test.tsx | Pass |
| H4 — loading and error states are shown | home.independent.test.tsx | Pass (3 tests: loading, server error + retry, network error + retry) |
| H5 — works on a phone screen (360 px) | home.independent.test.tsx | Pass, but only partly testable — see Limits |
| H6 — uses the real endpoint, sample client deleted | home.independent.test.tsx | Pass (2 tests: request shape, no leftover sample module) |
| (SCRUM-246 extra) empty state — parent with no children | home.independent.test.tsx | Pass |

**11 of 11 tests pass.** No defect found on the home screen.

## Results: SCRUM-249 (absences)

| Criterion | Test file | Result |
|---|---|---|
| A1 — pick a child, report one day or a range | absences.independent.test.tsx | Pass (4 tests: one day, range, a child with no route, exact-repeat dedup) |
| A2 — past dates cannot be picked | absences.independent.test.tsx | Pass (4 tests: single day, range, Asia/Beirut boundary, inverted range) |
| A3 — upcoming list, Cancel button, confirmation step | absences.independent.test.tsx | Pass (6 tests: list + empty state, confirmation appears, Keep/Escape back out, confirmed delete) |
| A4 — list updates after report/cancel, no page reload | absences.independent.test.tsx | Pass (checked inside the A1 and A3 tests above) |
| A5 — server errors shown in plain words | absences.independent.test.tsx | Pass (5 tests: overlap, report 500, load 500, cancel 409 already-ended, cancel 404). The 409 case was fixed by PR #173 (SCRUM-297) — see Defect below. |
| A6 — works on a phone screen | absences.independent.test.tsx | Pass, but only partly testable — see Limits |
| A7 — uses the real endpoints | absences.independent.test.tsx | Pass (checked inside the A1, A3 and A5 tests above: correct paths, cookies, no cross-child requests) |

**21 of 21 tests pass.**

## How to run

```
cd frontend
npm test
```

Both files are picked up automatically by Vitest's default file matching; no config change was needed. CI's `frontend-build` job already runs this (as `test:coverage`).

To run just these two files:

```
npx vitest run "src/app/(parent)/parent/home.independent.test.tsx" "src/app/(parent)/parent/absences.independent.test.tsx"
```

Each was run twice back to back with no flakes (32 passed, both times). `npx eslint` on the three new files passes. `npx tsc --noEmit` reports nothing new in the three new files — the 13 errors it reports elsewhere already exist on unmodified develop (same count the SCRUM-249 report records). `npm run build` passes.

## Proof the tests can fail

Each breakage was made directly in the production file, run against only the relevant test file, confirmed to fail for the stated reason, then restored with `git checkout -- <file>` before moving to the next one. No production file stayed modified.

### Home tests (5 breakages)

| # | Breakage | File | Test(s) that failed | Why |
|---|---|---|---|---|
| 1 | Drop the `+` from the dialled phone number | `ChildTransportCard.tsx` | H2 | `tel:` href was `9613100101` instead of `+9613100101` |
| 2 | Hardcode the pickup time to `07:00` | `ChildTransportCard.tsx` | H1, H5 | the card no longer contained `07:21` |
| 3 | Show a fake route and a Call driver link on the no-route child | `ChildTransportCard.tsx` | H3 | a `tel:` link was found where none should exist |
| 4 | Remove the "Try again" button from the error state | `ParentHome.tsx` | H4 (both the 500 and the network-failure case) | no retry button could be found after the error |
| 5 | Add `?scope=all` to the children request | `myChildren.ts` | H6 | the request's query string was `?scope=all` instead of empty |

No test needed strengthening here; each breakage was caught on the first try.

### Absences tests (5 breakages)

| # | Breakage | File | Test(s) that failed | Why |
|---|---|---|---|---|
| 1 | Accept a past date (client-side "today or later" check removed) | `AbsencesPanel.tsx:55` | A2 (all 3: single day, range, Asia/Beirut boundary) | a POST was sent where none should be |
| 2 | Wrong request body for a range (`toDate` forced equal to `fromDate`) | `AbsencesPanel.tsx:61` | A1/A4 range test | the POST body didn't match `{fromDate, toDate}` with the two different dates |
| 3 | Cancel deletes immediately, skipping the confirmation step | `AbsencesPanel.tsx:117` | A3 (all 5: confirmation appears, Keep, Escape, confirmed delete, 404-gone cancel) | no "Confirm cancellation" button ever appeared |
| 4 | Swallow the 409 overlap response instead of showing it | `AbsencesPanel.tsx:67-69` | A5 overlap test | the server's overlap message never reached the screen |
| 5 | Call the wrong endpoint for every absence request | `absences.ts:30` | 18 of 20 immediately; 20 of 20 after strengthening (below) | no request ever reached `/api/parent/children/{id}/absences` |

**Two tests were strengthened** after breakage 5: the "500 while loading the list" test and the plain "loading" test only checked what was on screen, so with the endpoint broken they still passed (a 404 from the wrong path also produces an error/loading screen by accident). Both now also assert that exactly one real `GET .../absences` request was made, so a wrong endpoint fails them too. After that change, breakage 5 failed all 20 non-skipped tests, confirming the fix closed the gap.

## Limits

- **H5 and A6 (360 px / phone screen) are only partly testable here.** Vitest runs in jsdom, which has no layout engine, so it cannot measure real overflow or confirm 44 px tap targets. The independent tests at 360 px only check that the controls stay real, labelled, interactive elements (an `<a>`, a `<button>`, an `<input>`) and that no content silently disappears. **The real check is Wassim's own Playwright browser test**, which measures actual geometry at 360 px.
- **The 13 `tsc --noEmit` errors are pre-existing.** They are in files this work did not touch and already exist on unmodified develop; they are not introduced by these tests.

## Defect — fixed

**File:** `frontend/src/app/(parent)/parent/absences.independent.test.tsx:358` (Jira bug key: SCRUM-297)

**Fixed by:** PR #173 (SCRUM-297), merged into develop. `friendly()` in `frontend/src/app/(parent)/parent/AbsencesPanel.tsx:33-38` now has a dedicated 409 branch (`cause.status === 409 ? cause.message`) that passes the server's own `detail` through instead of falling into the generic "Couldn't complete the request" sentence. The cancel error path at `:84-87` uses this same `friendly()`, so the fix covers cancel failures too. The test above is now a normal `it(...)` and passes.

**Original cause:** `friendly()` turned any `ApiError` that wasn't 401/403/404 into one fixed sentence, "Couldn't complete the request. Please try again.", instead of showing the server's own `detail`.

**Original expected** (A5, and `runs.md` "Errors": *"Cancel an absence that ended before today | 409 | `detail`"*): cancelling an absence that has already ended should show the server's own reason in plain words.

**Original actual:** the screen showed only "Couldn't complete the request. Please try again." The specific reason from the server was discarded. The absence row was correctly kept (no data loss), but the parent was told to retry an action that could never succeed, since the absence had already ended.

**Severity: low-to-medium.** This was a usability/wording issue, not a correctness or data-safety bug — nothing was lost, nothing was double-cancelled, and the UI's own fallback message was still "plain words", just not the server's words.

## Accessibility observation (not a defect)

In `AbsencesPanel.tsx`, the cancel-confirmation group's accessible name is built as `` `Confirm cancellation ${item.id}` ``, which embeds the raw absence UUID (e.g. "Confirm cancellation 60000000-0000-4000-8000-000000000001"). A screen reader will read that id aloud. This doesn't block or mislead anyone and isn't an acceptance-criterion failure, but it's worth a follow-up cleanup — the group's name could instead reference the absence's dates, which are already shown next to it and are what a parent actually recognizes.
