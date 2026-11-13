# SCRUM-272: independent tests for the live location, live ETA, offline replay and driver reassignment, test report

Written by Moustafa, the independent tester of Hashem's SCRUM-261, 262, 263 and 264 (S4-12). Dated 2026-11-13. The one finding is written up, with a repro and a paste-ready comment, in [`SCRUM-272-bugs.md`](SCRUM-272-bugs.md).

## What was built

- Five suites: `LiveLocationCriteriaTests` (261, 19 tests and 1 behind a switch), `LocationRetentionCriteriaTests` (261 retention, 3, in `runs/config`), `LiveEtaCriteriaTests` (262, 16), `OfflineReplayCriteriaTests` (263, 16) and `DriverReassignmentCriteriaTests` (264, 20, one of which needs 263 as well), all in `runs/controller` except the retention one. 74 tests plus the switched one.
- Two small support classes in `common/`: `LiveRunCriteriaSupport` (on top of the SCRUM-242 `RunCriteriaSupport`, untouched: a started three-stop trip, the location calls, what a parent and the head read, a `together` helper that releases requests at the same instant) and `PendingFeature` (the gate below).
- No production code, no migration, no contract, no sample, no `ci.yml`, no new dependency. `backend/CLAUDE.md` has one paragraph. This report and `SCRUM-272-bugs.md`.
- Real application on a PostgreSQL container with every Flyway migration, a fresh random school per test, nothing deleted, only the clock moved ("now" is Wednesday 2026-11-04, 07:00 in Beirut). Everything is an HTTP answer; only accounts and pins, which have no endpoint, are saved directly.

## Tests first, and how independent they are

- Written from the Jira tickets (261 as quoted in PR #143, which also names the cases to attack; 262, 263, 264 as read from Jira) and `docs/contracts/runs.md` as it stands on `develop` (Live location), on `origin/feat/SCRUM-262-live-eta` (Live ETA and stop progress), `origin/feat/SCRUM-263-offline-replay` (Offline replay) and `origin/feat/SCRUM-264-driver-reassignment` (Reassigning a run's driver), with their samples. **Not** from `RunLocationTests`, `LiveEtaTests`, `LiveEtaRoadProviderTests`, `ConfirmationReplayTests`, `RunReassignmentTests`, `RunOwnershipRecheckTests`, `DriverWritesRecheckOwnershipTests`, `RunReassignmentDayTurnoverTests`, `RouteServiceReassignDriverTests` or `DriverWritesRecheckOwnershipTests`, which were never opened before the suites were written.
- The expected numbers are worked out by hand, in the class comment of `LiveEtaCriteriaTests` (all stops on one meridian: 0.01 degree is 2.22 minutes and rounds up to 3, 0.02 is 4.45 (5), 0.03 is 6.67 (7), 0.04 is 8.90 (9)).
- Mistakes in the tests themselves were found by running them on code that was right, or on rereading, and fixed in the test, never by bending an expectation of the contract: a chain written as 540 seconds that is 600 (caught on rereading), an assertion on a missing JSON path, a compile ambiguity, and an inbox assertion that assumed an inbox on a branch that predates it (the contract promises the entry only "once the parent inbox lands", so it is now asserted only where the inbox exists).

## Where each story stands

| Story | Jira / PR | In `develop`? | Suite | Result |
|---|---|---|---|---|
| 261 live location | merged (#143) | yes | `LiveLocationCriteriaTests` (19 + 1), `LocationRetentionCriteriaTests` (3) | 19 and 3 pass; the 1 behind `known-bug.SCRUM-261-coercion` **fails** when switched on (BUG-1). Also 19 of 19 on the 262 branch |
| 262 live ETA | #153, open | **no** | `LiveEtaCriteriaTests` (16) | skipped on `develop`; on `origin/feat/SCRUM-262-live-eta` (`aef97a3`) **16 of 16** |
| 263 offline replay | #155, open | **no** | `OfflineReplayCriteriaTests` (16) | skipped on `develop`; on `origin/feat/SCRUM-263-offline-replay` (`9eaaca7`) **16 of 16** |
| 264 reassignment | #156, open | **no** | `DriverReassignmentCriteriaTests` (20) | skipped on `develop`; on `origin/feat/SCRUM-264-driver-reassignment` (`e3d4a77`) **19 pass, 1 skipped** (needs 263); on the scratch merge of 263 and 264 **20 of 20** |

On `develop` with this branch added: `LiveLocationCriteriaTests` 19 run and `LocationRetentionCriteriaTests` 3 run, 0 failures (1 skipped, the switched one); the other three suites 52 skipped. **The whole backend suite on this branch: 1,407 tests, 0 failures, 0 errors, 54 skipped** (the 52 gated, the switched one and the live road-provider test that is always skipped).

**How the suites for the open PRs are gated.** Each compiles on `develop` (they use only HTTP) and switches itself on through `common/PendingFeature` when a class the feature's pull request adds is on the classpath: `runs.service.LiveEta` (262), `runs.entity.ConfirmationKey` (263), `runs.entity.RunReassignment` (264). So the day a PR merges its suite is on, with no flag to remember. Once on, a missing endpoint, field or answer **fails** the test. `-Dpending.SCRUM-26x=true` forces one on. The one test of 264 that needs 263 also has its own `@EnabledIf` on `ConfirmationKey`. When all three have merged, delete `PendingFeature` and the `@EnabledIf` lines, and check that all four classes report `Skipped: 0` (the BUG-1 test is the only skip that stays, until it is settled).

**The suites were checked the other way**, to show they can fail:

| Suite | Against | Result |
|---|---|---|
| `LiveEtaCriteriaTests`, `-Dpending.SCRUM-262=true` | `develop` (no 262) | 16 run, **15 fail or error** (the fields do not exist); the 1 that passes is `anotherFamilysChildGetsNoNumbersAtAll`, a 404 that holds with or without the feature |
| `OfflineReplayCriteriaTests`, `-Dpending.SCRUM-263=true` | `develop` | 16 run, **5 fail**: a reused key is 422, two different taps racing for one key, a new key after the end is 409, a key that is not a UUID is 400, and the sample. The other 11 pass on `develop` because a request whose key is ignored is an ordinary, idempotent confirmation: they pin behaviour the feature must not break, and they are the ones that would catch it if it did |
| `DriverReassignmentCriteriaTests`, `-Dpending.SCRUM-264=true` | `develop` | 20 run, **19 fail or error** (the endpoint is a 404); the 1 that passes is `aRunWhoseRouteWasDeletedIs404`, which is a 404 on `develop` for the wrong reason: it is only meaningful on the 264 branch, where it passes for the right one |
| `LiveLocationCriteriaTests#aTextForANumber...`, `-Dknown-bug.SCRUM-261-coercion=true` | `develop` | **fails**, listing the 5 bodies that were accepted |
| `LocationRetentionCriteriaTests`, with the clean-up's cutoff made twice as long (restored afterwards) | `develop` | 3 run, **1 fails**: a 301 second old position was not removed |

## What each test guarantees

### SCRUM-261, `LiveLocationCriteriaTests`

| Criterion | Tests |
|---|---|
| Consent: opt-in only while `IN_PROGRESS` (409 before the start and after the end), withdrawal in any state, opting in again changes nothing, withdrawing twice is 200, a fresh opt-in starts with no position | `optingInNeedsTheRunInProgress...`, `optingInAgainChangesNothing...` |
| Another driver's, another school's and an unknown run: 404 for every location write, also for a withdrawal of somebody else's consent | `anotherDriversRunAndAnUnknownRun...` |
| A position needs consent and a run in progress; a late position after a withdrawal is 409 and never brings it back | `aPositionNeedsConsent...` |
| Limits inclusive (90, 180, -90, -180, accuracy 0 and 10000); 18 kinds of invalid body are 400 and never stored | `theLimitsOfAPositionAreInclusive...` |
| The server's clock only: a time in the body is never read; the latest position replaces the last | `onlyTheServersClockDecides...`, `theLatestPositionReplacesTheLastOne` |
| 60 s `LIVE`, 61 `STALE`, 300 `STALE`, 301 `UNAVAILABLE`, on the parent's and the head's reads | `aPositionIsLiveUpToSixtySeconds...` |
| A parent sees the position only while the child is waiting: picked up, not at the stop and absent today each end it, the next child still sees it | `aParentSeesThePositionOnlyWhile...` |
| Six different reasons for nothing to show (sharing off, no position yet, too old, run not started, child with no route, holiday) give answers with the same fields and no reason | `everyReasonForNothingToShowLooksTheSame...` |
| Another family's child, another school and an unknown child are a 404 with no position in it | `aParentCannotReadAnotherFamilysChild...` |
| The head sees every run in progress of their school and only those; `locationSharing` false and true mean what the contract says; another school's head sees `[]`; a holiday is `[]` | `theHeadSeesEveryRunInProgress...`, `aHolidayHasNoPositionsToShow` |
| Ending withdraws consent and removes the position in the same step | `endingARunWithdrawsConsent...` |
| **Races**, 5 rounds each: opt-in against the end never leaves sharing on for a finished run; a position against a withdrawal never brings the position back | `optingInRacingTheEnd...`, `aPositionRacingAWithdrawal...` |
| Roles on all four endpoints (parent, head, admin, driver) and 401 signed out | `everyEndpointIsForItsOwnRoleOnly` |
| The opt-in body must be a clear boolean | `theOptInBodyMustBeABoolean` (and BUG-1 behind the switch) |

### SCRUM-261 retention, `LocationRetentionCriteriaTests`

| Criterion | Tests |
|---|---|
| A withdrawal removes the stored position at once, not at the next clean-up | `aWithdrawalRemovesTheStoredPositionAtOnce` |
| Ending a run removes the position and consent in the same step | `endingARunRemovesTheStoredPositionAndConsentInTheSameStep` |
| The clean-up removes a position older than five minutes, also for a run nobody ends; never one that is still shown (299 seconds kept, 301 removed, a younger one kept and then removed when it is old enough) | `theCleanUpRemovesAPositionOlderThanFiveMinutes...` |

The clean-up is not a bean in the `test` profile, so the test builds `LocationPurge` by hand and runs its method once with the test clock, as the scheduler would; the stored row is read through `RunLocationRepository`.

### SCRUM-262, `LiveEtaCriteriaTests`

| Criterion | Tests |
|---|---|
| The estimate is the fix plus every leg to the child's stop (170, 350 and 650 seconds at 10 seconds old; `arrivesAt` is the fix's time plus 660 s); `stopsLeft` 0, 1, 2 | `theEstimateIsTheFixPlusEveryLeg...` |
| A done or skipped stop (picked up, not at the stop, absent) adds nothing: 300, 600, 540 and 600 seconds | `aDoneOrSkippedStopAddsNoLeg...`, `anAbsentChildIsSkipped...` |
| Never earlier than now, and an estimate already due reads 0 (and 0 is not "arrived"); a leg is rounded up | `theEstimateIsNeverBeforeNow...`, `aLegIsRoundedUp...` |
| An estimate only while the fix is `LIVE` (60 s) and none at 61 s and 301 s, while progress and plan stay; no position yet, sharing off or withdrawn: progress and plan, no estimate | `anEstimateExistsOnlyWhileTheFixIsLive...`, `noPositionYetOrSharingOff...` |
| Planned and live are different things: `plannedTime` is the route's own arrival time and the children list's, `estimate` a UTC moment, no lateness value | `thePlannedTimeIsTheSchedulesAnd...` |
| The afternoon is the morning order reversed (180, 480, 660 seconds), has no `plannedTime`, and a dropped-off child is no longer waiting | `anAfternoonRunUsesTheMorningOrderReversed...` |
| A stop with no pin adds no leg and has no estimate of its own | `aStopWithoutAPinAddsNoLeg...` |
| A child who is not waiting has no progress, plan, estimate or position; another family's child is a 404 with none of those words | `aChildWhoIsNotWaiting...`, `anotherFamilysChildGetsNoNumbers...` |
| The head: `remainingStops`, the next stop with name, plan and estimate, and how it moves after a pick-up; zero remaining and a run with no stops have no next stop but stay `IN_PROGRESS`; with no live fix the plan and no estimate | three tests |
| The three samples have the fields of the real answers | `theContractsSamplesHaveTheFieldsOfTheRealAnswers` |

### SCRUM-263, `OfflineReplayCriteriaTests`

| Criterion | Tests |
|---|---|
| The same key for the same tap: 200 every time with the run, one record, the first time kept, one step of progress, one inbox entry (where the inbox exists) | `theSameKeyForTheSameTap...` |
| A double tap made offline (two keys, one tap): one record, either key may be replayed | `aDoubleTapMadeOffline...` |
| A key already applied is 200 after a later status and never moves the student back | `aKeyAlreadyAppliedAnswers200EvenAfterALaterStatus...` |
| **Concurrency** on PostgreSQL: six copies of one key and four different keys for one tap, all 200 with one record; two different taps racing for one key: one 200, one 422, and the refused tap leaves no record (4 rounds) | three tests |
| A key reused for another status, student or run is 422 naming `clientRequestId`, changes nothing, and the original still answers 200 (also for the afternoon run before it has started: the key is checked before the state) | `aKeyReusedForADifferentStatusStudentOrRun...` |
| A key is one driver's: the same value from another driver is their own, and another driver's run is a 404 | `aKeyBelongsToOneDriver...` |
| Order of checks: the run (404), then the key, then the state; a 409 or a 404 stores no key so the retry is judged afresh | `theRunIsCheckedBeforeTheKeyAndARefusedRequestStoresNoKey` |
| Taps replayed out of order: a drop-off before its pick-up is 409, then 200 when sent again after it | `tapsReplayedOutOfOrder...` |
| After the end an old key is still 200; a new key for a recorded status is 409; an earlier day's run is 404 even for an applied key | `afterTheRunEnds...`, `aRunFromAnEarlierDayIs404...` |
| The time is the server's, at arrival; a key that is not a UUID (ten shapes) is 400 `Malformed request body` and records nothing; capitals are fine | `aReplayedTapIsTimed...`, `aKeyThatIsNotAUuid...` |
| Roles: 403 for parent, head and admin, 401 signed out; the two samples | two tests |

### SCRUM-264, `DriverReassignmentCriteriaTests`

| Criterion | Tests |
|---|---|
| Mid-run: 201, the same run id, state, `startedAt`, `counts` and vehicle, the new driver on both of today's runs; the old driver's list is empty and start, end and confirm are 404; the new driver gets the run with its confirmations and carries on; a parent's `Child.driver` follows | `reassigningMidRun...` |
| A run not started can be reassigned and the new driver starts it | `aRunThatHasNotStarted...` |
| The audit list: both runs list both changes, newest first, `runState` at the moment, `direction` of the run acted on, names, `changedBy` with the head's email (null when the account is gone), `changedAt`, the reason trimmed; blank is none, 200 characters allowed, 201 is a 400 and nothing changes | `theAuditListHasEveryChange...`, `aChangeMadeByAnAccountThatNoLongerExists...`, `aReasonIsAtMostTwoHundredCharacters...` |
| Who: 403 for driver, parent and admin on both endpoints, 401 signed out, a bad body is 400 before the role, another school's head and an unknown run are the same 404 and nothing changed; a body without both drivers is 400 | two tests |
| The replacement: another school's or an unknown driver 404; deactivated, invited, or already on another route (named) 409; no refusal changes the route or the record | `theReplacementMustBeAnActiveFreeDriver...` |
| `fromDriverId` stops two heads on the same screen (409 naming the current driver); the same driver again is 200 and records nothing | two tests |
| Only today's runs, not finished, not on a holiday; a deleted route's run is 404 | two tests |
| **Competing changes**, 3 rounds each: two heads, same replacement: one 201 and one 200, one record; two replacements: one 201 and one 409, one record, the record names the route's driver; one spare asked by two routes: on exactly one | three tests |
| The old driver's tap racing the change is a 200 that exists or a 404 that does not, never both, and always 404 afterwards (5 rounds) | `anOldDriversTapRacingTheChange...` |
| With 261: the change withdraws sharing, the old position disappears, the old driver cannot send or opt in, the new driver's position is 409 until they opt in | `reassigningWithdrawsSharing...` |
| With 263: the old driver's key from before the change is a 404, never the "already applied" 200; the new driver's own key is fine; one record throughout | `aQueuedTapOfTheOldDriver...` |
| The route edit still refuses a driver change mid-run (409) and a change through it is not in the list; the samples | two tests |

## What failed

**One finding**, small and in merged code, written up with a repro and a paste-ready comment in [`SCRUM-272-bugs.md`](SCRUM-272-bugs.md): **BUG-1** (261, #143): a text for a number, or `"true"` and `1` for consent, are converted and accepted. Kept as a test behind `-Dknown-bug.SCRUM-261-coercion=true`, so it never runs in CI: re-run it whenever #143's bodies change, and delete the switch when it is settled. Nothing else failed and no assertion was weakened. The notes at the end of the bugs file (the 263 and 264 merge, the withdrawal of sharing, a time in the body) are not failures.

## Conflicts between the Jira tickets, the contracts and the code (raised, not decided by a test)

| # | Conflict | What was done |
|---|---|---|
| C1 | Jira 263 asks for "explicit per-item conflict/retry results"; the contract has no batch: one request per tap and the HTTP status is the result of that item | The contract is tested; per-item results are the 200, 404, 409, 422 and 400 of each request |
| C2 | Jira 264 says "validate the replacement driver"; the contract adds "on no other route", checked with a 409 naming the route | Tested as the contract says |
| C3 | `runs.md` on `develop` says reassignment "must withdraw sharing" (SCRUM-264); until #156 merges `develop` does not | Tested on the 264 branch, where it does |
| C4 | The Jira status of 262 is Done while #153 is open, and 261, 263, 264 are In Review | Noted only |

## Contract gaps (not asserted, nothing invented)

- A confirmation or position body that also carries a time: refused or ignored, which of the two is not said (the tests accept both and assert it is never read).
- `"clientRequestId": null`: the key is optional, and whether an explicit null counts as none is not said (the author's own suite decides it; not asserted here).
- A reassignment whose `driverId` equals `fromDriverId`: the contract's order of checks gives 200 and nothing recorded ("the route already has `driverId`"); not asserted as a case of its own.
- The order of two audit entries made in the same second by different runs: the contract says `changedAt`, then `id`; with the test clock standing still, only different times are asserted.
- Whether a `STALE` position of a run whose driver was reassigned would be shown: the change withdraws sharing and removes the position, so it cannot arise.

## Independence limits

1. **I reviewed the code of #153, #155, #156 and #157 as their reviewer earlier today**, so I had seen the main logic of the first three (the live-estimate chain, the key lookup and the reassignment locks) before writing these suites. What I did not open were their test files, and the suites were written from the contracts and the tickets, but my understanding of what the code does is not blank. Hashem's own tests of my work (SCRUM-266) have the same limit for the late-alert inputs.
2. **The races are probabilistic.** `together` releases the requests at the same instant, a handful of rounds each; a race that needs a precise interleaving can still pass. The two that are deterministic (the lock order of the reassignment, the ownership re-check under the run's lock) are the authors' own tests, which I did not touch.
3. **Jira was not readable while the last suites were finished** (the connector timed out), so the text of SCRUM-272 itself was not re-read; the four feature tickets and PR #143's description were.
4. **Only a local PostgreSQL 18 was available** (Docker was not), with a database per branch and every Flyway migration; CI uses PostgreSQL 16.
5. **The 263 and 264 combination was tested on a scratch merge** resolved by hand in the order the authors describe, not on a branch that exists.
6. **No browser and no phone**: the real GPS behaviour of a locked phone and the real offline queue are SCRUM-273 and 284.

## Runs

```
sh ./mvnw test -Dtest='LiveLocationCriteriaTests,LiveEtaCriteriaTests,OfflineReplayCriteriaTests,DriverReassignmentCriteriaTests'
sh ./mvnw test -Dtest=LiveLocationCriteriaTests -Dknown-bug.SCRUM-261-coercion=true       # fails today: BUG-1
sh ./mvnw test -Dtest=LiveEtaCriteriaTests -Dpending.SCRUM-262=true                        # force a gated suite on
```

Re-run the three gated suites on a scratch merge of `develop` with their branch just before each PR merges, and after any rebase.
