# SCRUM-247: independent tests of the head of transportation's Today screen

## What was added

One frontend test file, `frontend/src/app/(head-of-transport)/head-of-transport/today/page.independent.test.tsx`,
with 26 tests. The screen is SCRUM-255's; the tests were written separately, from that ticket's acceptance
criteria and from `docs/contracts/runs.md`, not from the screen's own implementation.

Both `getRunsDay` and `getAbsentStudents` are faked (the screen still imports the Sprint 3 sample client,
`lib/api/runsSample.ts`, per `frontend/CLAUDE.md`); everything else in `page.tsx` runs for real. `npm test` is
`vitest run`, so CI's `frontend-build` job runs this file with every other test.

## Acceptance criteria of SCRUM-255

| Criterion | Tests | Result |
|---|---|---|
| Every run for today, with route, driver, morning/afternoon, state and progress | One row per run; each of the three states labeled and no other label shown; progress shown with absent/not-present counts beside it; a zero-student route shown as "0 of 0" with no NaN/Infinity; the day's date and a half-day marker shown; both requests fired once with no date pinned | Met, **except see finding 1** on which count the progress denominator uses |
| Students absent for the day, each with route and stop | Each absent student listed with route and stop number; a student on no route shown as "No route" / "None" rather than blank cells; runs still shown on a day with no absences | Met |
| A holiday (or a school day with no runs yet) shown clearly instead of an empty table | A holiday shows "no runs today" + "holiday" text and no table/header row; absences still shown on a holiday; a school day with no runs shows "no runs" but never says "holiday" | Met |
| Refresh, loading and error states | A loading state until both requests answer, with Refresh disabled; Refresh reloads both lists and shows the new data; Refresh shows "Refreshing..." and ignores a second click while in flight; a server error or network failure on either request shows a generic alert (no leaked backend detail) and never reads as a holiday or "nobody absent"; the error clears once a Refresh succeeds | Met, **see findings 2 and 3** on what the error states hide |
| Reachable from the home page | The home page has a "Today" card linking to `/head-of-transport/today`; the screen's own heading is "Today" | Met |

## Full suite result

Ran `npm test` (`vitest run`) for the whole frontend suite:

- **604 tests total: 597 passing, 1 failing, 6 skipped.** The 6 skipped tests are in other files, unrelated to
  this one.
- The 1 failing test is in this file, and the failure is deliberate: "shows picked up out of the total students,
  absent ones included, on a morning run" (AC1). It holds the screen to SCRUM-255's criterion text and
  `docs/contracts/runs.md` line 64, which the screen currently does not follow — see finding 1 below. No other
  test in the suite was broken by adding this file.

## Findings

Per SCRUM-247's rule, none of these are fixed in this change; they're raised here for Mohamad/the PO to decide.

### 1. `docs/contracts/runs.md` contradicts itself on a morning run's progress denominator

Line 64 defines "picked up out of total" as `pickedUp` of `students`, with line 62 stating `students` already
includes absent stops: *"`pickedUp` | students whose latest status is `PICKED_UP` **or** `DROPPED_OFF`
(someone dropped off was picked up). 'Picked up out of total' is `pickedUp` of `students`"*.

Line 70 describes the same thing differently: *"Progress, as the screens show it: on a morning run `pickedUp`
of `students - absent`..."*.

`page.tsx:38-41` (`progressOf()`) follows line 70, subtracting `absent` from the denominator:

```ts
function progressOf(run: RunSummary) {
  const total = run.counts.students - run.counts.absent;
  const done = run.direction === "MORNING" ? run.counts.pickedUp : run.counts.droppedOff;
  ...
}
```

The test "shows picked up out of the total students, absent ones included, on a morning run" asserts line 64's
rule instead, and fails against the current code. This needs a decision from the PO or the contract owner on
which rule should win, and the losing line in `runs.md` fixed to match. Afternoon runs aren't affected either
way: no part of the contract asks for "picked up" there, and lines 70, 185 and 253 agree `droppedOff` is the
afternoon measure.

### 2. A failed request hides both sections, even when only one failed

`load()` (`page.tsx:185-197`) wraps both `getRunsDay()` and `getAbsentStudents()` in one `Promise.all` inside a
single `try`/`catch`. If only one of the two requests fails, `day` and `absent` both stay `null` (set once,
together, only on success), so the runs table and the absent-students section are both hidden — including the
one whose request actually succeeded. The tests "shows an error when the runs request fails" and "shows an
error when the absences request fails" both end up asserting the same all-or-nothing behavior rather than a
partial one. Not fixed here.

### 3. A failed Refresh leaves the old data on screen with no "stale" indication

On the initial load, a failure clears `day`/`absent` (they start `null`), so the error replaces the content.
But a Refresh that fails after a prior good load (test: "shows an error when a Refresh fails after a good
load") leaves the previous `day`/`absent` state untouched, since `load()` only overwrites them inside the
`try`. The alert appears next to the old table and absent list with nothing telling the viewer that data may
now be out of date. Not fixed here.
