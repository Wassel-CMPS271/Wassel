# SCRUM-266: independent tests for the inbox, notification preferences and late alerts, address requests and transport totals, test report

Written by Hashem, the independent tester of Moustafa's SCRUM-267, 268, 269 and 271. Dated 2026-11-13. The two findings are written up, with repros and paste-ready comments, in [`SCRUM-266-bugs.md`](SCRUM-266-bugs.md).

## What was built

- Six suites in the packages their code lives in: `ParentInboxCriteriaTests` (267, 25 tests), `AddressRequestCriteriaTests` (269, 27), `AddressRequestGeocodingCriteriaTests` (269, 4), `TransportTotalsCriteriaTests` (271, 19), `NotificationPreferencesCriteriaTests` (268, 14) and `LateAlertCriteriaTests` (268, 18). 107 tests, plus `common/Scrum268GateTests` (5 unit tests of the 268 switch, never skipped) and the switch itself, `common/Scrum268Gate`.
- Shared support is the SCRUM-236/242 one, untouched (the only new support class is the 268 switch): `common/RunCriteriaSupport` (inbox, totals, preferences, late alerts: runs driven through the real driver and head endpoints, entries made only by the driver's confirmation) and `common/CriteriaTestSupport` (address requests). The real application on the PostgreSQL 16 container with the real Flyway migrations; a fresh random school per test; nothing deleted; only the clock moved.
- No production code, no migration, no contract, no sample, no `ci.yml`, no new dependency. `backend/CLAUDE.md` has one paragraph. The contract samples are pinned as executable checks (exact key sets of an inbox entry, an address request, the preferences, the totals and the CSV header).
- This report and `SCRUM-266-bugs.md`.

## Tests first

- Written from the Jira tickets (266, 267, 268, 269, 271) and `docs/contracts/` (`inbox.md`, `address-requests.md`, `transport-totals.md`, `runs.md`, their samples; for 268 the contract as it stands on `origin/feat/SCRUM-268-notification-preferences`). **Not** from `ParentInboxTests`, `AddressRequestControllerTests`, `TransportTotalsTests`, nor, on the 268 branch, `LateAlertTests`, `LateAlertRetryTests`, `NotificationPreferencesTests` or `LateRuleTests`, which were never opened before the tests were written. No service code was read while writing them.
- Entities were read to build rows (`Student`, `User`), and `RoleAccessMatrixTests` for paths. After the tests existed, three files were read **only to explain a failure**: `HeadOfTransportReportController` (BUG-1), `UpdateNotificationPreferencesRequest` and `LateAlertJob` (BUG-2 and the job's name). While writing the geocoding suite, two lines of `StudentService` were seen in a search result (that it geocodes unless the pin is manual), which the contract states anyway.
- Assertions are on HTTP responses. The exceptions are listed under "Independence limits".
- The expected totals are worked out by hand, in the comments above `theFiguresOfAWeekAreExactPerDayAndInTotal` and `theWeek`, before the test was run.

## Where each story stands

| Story | Jira on 2026-11-13 | In `develop`? | Tests | Result |
|---|---|---|---|---|
| 267 parent inbox | In Review | yes (#146) | `ParentInboxCriteriaTests` (25) | 25 pass |
| 269 address requests | In Review | yes (#145) | `AddressRequestCriteriaTests` (27), `AddressRequestGeocodingCriteriaTests` (4) | 31 pass |
| 271 transport totals and export | In Review | yes (#152) | `TransportTotalsCriteriaTests` (19) | 18 pass, 1 behind `known-bug.SCRUM-271-empty-date` (BUG-1) |
| 268 preferences | To Do | **no**, PR #158 on #153 (both open) | `NotificationPreferencesCriteriaTests` (14) | skipped on `develop`; on the scratch merge 13 pass, 1 behind `known-bug.SCRUM-268-coercion` (BUG-2), which fails when switched on |
| 268 late alerts | To Do | no | `LateAlertCriteriaTests` (18) | skipped on `develop`; on the scratch merge 18 pass |

`sh ./mvnw -B clean test` on this branch (develop at 5da9d2c plus the new files, after the review fixes): **1448 tests, 0 failures, 0 errors, 34 skipped** (14 + 18 for the two 268 classes, which include BUG-2's test, 1 for BUG-1, and 1 that was already skipped, the live OpenRouteService test). The step-4 `clean verify` before the fixes was 1436 and 30. No "too many clients". The extra Spring context from the geocoding suite did not cause trouble.

**How the 268 suites are gated.** They compile on `develop` (no reference to anything only #158 has) and switch themselves on through `common/Scrum268Gate` when the five classes #158 adds to the inbox module (`LateAlertService`, `LateRule`, `NotificationPreferenceService`, `NotificationPreference`, `NotificationPreferenceRepository`) are on the classpath, that is, on the day #158 merges, with no flag to remember. None of them: skipped. All of them: on. **Only some of them** (a class renamed or moved before the merge): the gate throws and both suites fail with the list of what is missing, so a rename cannot skip them for ever; `Scrum268GateTests` pins that. Once on, a missing class, bean or method **fails** the test. `-Dpending.SCRUM-268=true` forces them on. When #158 merges: delete `Scrum268Gate`, its test and the two `@EnabledIf` lines, and check that both classes report `Skipped: 0`.

**The guarded tests were checked the other way**, to prove they can fail:

| Class | Against | Result |
|---|---|---|
| `NotificationPreferencesCriteriaTests`, `-Dpending.SCRUM-268=true` | `develop` (no 268) | 13 run, **13 fail** (the endpoint is a 404) |
| `LateAlertCriteriaTests`, `-Dpending.SCRUM-268=true` | `develop` | 18 run, **18 fail** ("the late job could not be run through ...LateAlertService.raise(): ClassNotFoundException") |
| the three classes below | `develop` (5da9d2c) + `origin/feat/SCRUM-268-notification-preferences` (5e26e320, carrying #153 at aef97a37), merged, not committed, removed afterwards | `ParentInboxCriteriaTests` **25 of 25** pass (268 breaks nothing in 267); `LateAlertCriteriaTests` **18 of 18** pass; `NotificationPreferencesCriteriaTests` 13 pass, 1 skipped; with `-Dknown-bug.SCRUM-268-coercion=true` **that 1 fails** with the four accepted bodies listed |
| `TransportTotalsCriteriaTests.anEmptyDateIs400...` | `develop`, before the switch was added | failed (200, not 400); the switch keeps CI green |

Re-run the scratch merge just before #158 merges, and after any rebase of #153 or #158. The SHAs above are what it was last run on.

## What each test guarantees

### SCRUM-267, `ParentInboxCriteriaTests`

| Criterion | Tests |
|---|---|
| The entry shape is the contract's 8 keys; values are the confirmation's; `createdAt` is a UTC moment equal to the server clock | `anEntryHasExactlyTheContractsEightKeys...`, `createdAtIsAMomentInUtc...` |
| One entry for each of the three confirmations | `eachOfTheThreeConfirmationsMakesOneEntry...` |
| A parent-reported absence is not an entry (contract; Jira disagrees, conflict C1) | `anAbsenceTheParentReportsMakesNoEntry` |
| "The same event" is run + child + type: a resend, a retry after drop-off, two taps at the same instant make one; NOT_PRESENT then PICKED_UP make two; morning and afternoon are separate; siblings give two | `sendingTheSameStatusAgain...`, `aPickedUpRetryAfterDroppedOff...`, `aWrongTapMovedOn...`, `theSameChildOnTheMorningAndTheAfternoonRun...`, `twoSiblingsOnOneRun...`, `twoTapsAtTheSameInstant...` |
| No linked parent: no entry. Re-linking: later entries go to the new parent, earlier ones stay | `aChildWithNoLinkedParent...`, `relinkingTheChild...` |
| Privacy and isolation: another family's child on the same run never appears (list, count, body text); another school sees nothing | `aParentNeverSeesAnotherFamilysChild...`, `aParentOfAnotherSchoolSeesNothing` |
| Newest first; `unread=true` filters; any other value (`false`, `yes`, `TRUE`, `1`, empty) lists all | `theListIsNewestFirst...`, `anyUnreadValueButTrueListsEverything` |
| At most 50 listed, the count says 51 (51 children on four buses) | `fiftyOneEntriesListTheNewestFiftyAnd...` |
| Count: 0 and `[]` for nothing, drops after a read | `theCountIsZero...` |
| Read: sets `readAt` once, a second read keeps it; another parent's, another school's and an unknown id are the same 404 and change nothing; a bad id is 400 `Invalid request parameter`; two reads at once | `readingSetsReadAtOnce...`, `anotherParentsEntryAndAnUnknownId...`, `anEntryOfAnotherSchoolIsA404`, `anIdThatIsNotAUuid...`, `simultaneousReadsOnClocksOfTheirOwn...` (each call moves the clock to a time of its own, so a second read overwriting the first would show) |
| Read-all: 204 also with nothing to mark, never touches another parent | `readAllMarksOnlyTheCallersEntries...` |
| Roles: 401 empty body signed out, 403 with a `detail` for head, admin, driver, on all four endpoints | `everyEndpointIs401WhenSignedOut...` |

### SCRUM-268, `NotificationPreferencesCriteriaTests` and `LateAlertCriteriaTests`

| Criterion | Tests |
|---|---|
| Defaults `true,true,true,true,10`; reading twice the same | `aParentWhoNeverSavedAnything...` |
| PUT echoes, GET reads back, same PUT twice changes nothing; 5 and 60 allowed | `savingEchoesTheChoices...`, `fiveAndSixtyMinutesAreAllowed` |
| Every field required (missing and null), 4, 61, 0, -10 refused with `errors` naming the field; **a refused PUT leaves the earlier choices** | `aRefusedSaveIs400NamingTheField...` |
| Non-JSON body, a text for a boolean, a boolean for a number: 400 | `aBodyThatIsNotJson...`, `aTextThatIsNotABoolean...` |
| Wrong types (`10.5`, `"10"`, `"true"`, `1`): 400 | `aValueOfTheWrongTypeIs400...` (BUG-2, behind a switch) |
| One parent's, or another school's parents' choices never change another's | `oneParentsChoicesNeverChange...` |
| A type that is off makes no entry and no unread; the driver's tap is 200; others stay on (`pickedUp`, `notPresent` and `droppedOff` each muted on their own); entries already made stay; no backfill; the choices cover all children and nobody else | `aTypeThatIsOff...`, `aDroppedOffThatIsOff...`, `turningATypeBackOn...`, `turningATypeOffKeepsTheEntries...`, `theChoicesCoverAllTheParentsChildren...` |
| Roles | `bothEndpointsAre401...` |
| Late: 9:59 none, exactly 10:00 none, 10:01 one (exact key set, no position, estimate or planned time); the same at 5 and 60 minutes | `withTheDefaultTenMinutes...`, `theLimitFollowsTheParentsMinutes...` |
| A far LIVE bus makes the child late before the clock; a LIVE bus whose estimate is before the limit makes no alert; a STALE one never; a fix 60 s old is still LIVE and counts, 61 s is STALE and does not | `aBusFarFromTheStopMakes...`, `aLiveFixWhoseEstimateIsBefore...`, `aStalePositionIsNeverADelayByItself`, `aFixSixtySecondsOld...` |
| Once: two job runs at the same instant racing for the very first entry (5 fresh scenes), then three in a row and again later; minutes changed three times, pickup after: still one, not withdrawn | `twoJobRunsAtTheSameInstantRacingToMakeTheFirstEntry...`, `theJobRunThreeTimesInARow...`, `changingTheMinutesAfterwards...` |
| Never late: run not started, run ended, afternoon, absent today, picked up, not present, no planned time (no pin), holiday | one test each |
| Alerts off: none until turned on, then one at the next check; only the linked parent, never the unlinked child | `lateAlertsOffMakeNoEntry...` |
| School-local time in summer (UTC+3, 2027-06-02), boundary exact, `createdAt` at the right UTC instant | `onASummerSchoolDay...` |

### SCRUM-269, `AddressRequestCriteriaTests` and `AddressRequestGeocodingCriteriaTests`

| Criterion | Tests |
|---|---|
| Submit: 201 `pending`, exact key set, trimmed address, `requestedBy` with the parent's email, `currentAddress` is the saved one, both pin fields present and null without a pin | `aSubmittedRequestIsPending...`, `aRequestWithNoPin...` |
| Limits allowed, and kept as sent (255 characters, pin at ±90 and ±180); refused with the field named (blank, missing, null, 256, lat/lng just out of range); half a pin is 400; the saved address again is 400 on `address` unless a pin is placed; non-JSON and bad ids | `theLimitsOfTheFieldsAreAllowed`, `anInvalidAddressOrPinIs400...`, `halfAPinIs400`, `theSavedAddressAgain...`, `aBodyThatIsNotJson...` |
| Another parent's, another school's and an unknown child: one 404 for submit and list; nothing created | `aChildThatIsNotTheParentsIsA404...` |
| One pending per child, also for the parent after a re-link; after a decision a new one is 201 | `aSecondPendingRequestIs409...`, `afterAnApprovalOrARejection...` |
| Inactive child: submit 409 on `studentId`, approve 409 and stays pending, reject allowed | `anInactiveChildCannot...` |
| Lists: the parent's own only, newest first; the head's pending by default, oldest first, filters, 400 on an unknown status, own school only | `theParentsListHoldsOnly...`, `theHeadsListDefaultsToPending...` |
| **Snapshot fields never re-read**: after the head's own address edit, a renamed student and a parent whose email changed, both lists and the approved request still show the old `currentAddress`, `studentName` and `requestedBy.email` | `theCurrentAddressTheNameAndTheEmailAreWhatTheyWere...` |
| **Every illegal transition** (approve/approve, approve/reject, reject/approve, reject/reject): 409 naming status and `decidedAt`, nothing changes | `everyDecisionOnADecidedRequestIs409...` |
| The student unchanged while pending and after reject; approve saves address and pin; manual pin kept when the request has none | `theStudentIsUnchanged...`, `approvingSavesTheAddress...`, `aRequestWithoutAPinKeeps...` |
| Reject reason 255 ok / 256 refused (and the request stays pending), blank means none | `aRejectReasonOf255...`, `aBlankReason...`, `aGivenReasonIsOnTheRejectedRequest...` |
| Another school's head: 404 never 403; unknown id 404; bad id 400 | `anotherSchoolsHeadAndAnUnknownId...` |
| Races on PostgreSQL, 5 rounds each: two submits, two approvals, approve against reject (the student matches the winner) | three `...AtTheSameInstant...` tests |
| A decision makes no inbox entry (contract; recorded as gap C9) | `aDecisionMakesNoInboxEntryAsTheContractSays` |
| Roles on all five endpoints | `everyEndpointIs401WhenSignedOut...` |
| With the geocoder double: no manual pin, no request pin gives the provider's pin for the requested address; a manual pin never asks the provider; a pin in the request wins and becomes manual | With an empty lookup (a provider that is down or finds nothing), an approval does exactly what the head's own address edit does for an identical student: address saved, a pin that is not manual cleared, request approved | `AddressRequestGeocodingCriteriaTests` (4) |

### SCRUM-271, `TransportTotalsCriteriaTests`

| Criterion | Tests |
|---|---|
| Exact per-day and total figures over three days, two buses, a cancelled absence, an absence running past the range, runs never opened, a student counted once a day however many runs; the latest status is per run (NOT_PRESENT in the morning and PICKED_UP in the afternoon is in both figures; NOT_PRESENT on both runs counts once) | `theFiguresOfAWeekAreExactPerDayAndInTotal`, `aSingleDayGivesThatDaysFigures...`, `anAbsenceThatRunsPastTheRange...`, `aStudentWhoIsAbsentAndStillPickedUp...`, `theLatestStatusIsPerRun...` |
| `studentsOnRoutes` counts only active students on a route | `studentsOnRoutesCountsOnlyActiveStudents...` |
| Another school's activity changes nothing | `anotherSchoolsActivityNeverChanges...` |
| Range: no parameters is today; a lone `to`; reversed is 400 on `to`; 62 days ok with 62 rows, 63 is 400 on `to`; the future is zeros; weekends and a holiday are listed with zeros | six tests |
| Malformed dates 400 `Invalid request parameter` on both parameters and the export, no file | `aDateThatIsNotYyyyMmDd...` |
| Empty value | `anEmptyDateIs400...` (BUG-1, behind a switch) |
| CSV: content type with UTF-8, attachment name, exact header, one row per date, `TOTAL` last, CRLF, no BOM, no `studentsOnRoutes`, every cell equal to the JSON; no parameters is today; the export refuses the same ranges | `theCsvHasTheExactHeader...`, `theCsvWithNoParameters...`, `theExportRefusesTheSameRanges...` |
| Head 200; admin, driver, parent 403; signed out 401 empty; no file for any refusal | `onlyTheHeadOfTransportationMayAsk...` |

## What failed

Two findings, both small, written up with repros and paste-ready comments in [`SCRUM-266-bugs.md`](SCRUM-266-bugs.md): **BUG-1** (271, merged: an empty `?from=` is "not given", answers 200) and **BUG-2** (268, #158: wrong-typed preference values are saved). Each stays as a test behind a switch (`-Dknown-bug.SCRUM-271-empty-date=true`, `-Dknown-bug.SCRUM-268-coercion=true`). Nothing else failed and no assertion was weakened.

Those two tests never run in CI, as with SCRUM-236's. So a fix, or a regression, is not seen by CI: re-run both switches (see "Runs") whenever #152 or #158 changes, and delete the switch when the finding is settled. The bugs file also holds two notes that are not failures (NOTE-1 for #145, NOTE-2 for #142).

## Conflicts between the Jira tickets, the contracts and the code (raised, not decided by a test)

| # | Conflict | What was done |
|---|---|---|
| C1 | Jira 267 lists absences as inbox events; `inbox.md` says a parent-reported absence is not an entry (and `NOT_PRESENT` is "not at the stop") | The contract wins and is tested. Hashem to accept it or raise it on #146 |
| C2 | 271 and SCRUM-93/95 say "admin"; the contract is the head of transportation only, "no admin access" | Admin gets 403 and that is tested. **Heads-up for 276/277**: an admin screen cannot call these endpoints |
| C3 | 271 asks for "cross-school access denial"; the request has no id | Reduces to isolation of the figures, tested |
| C4 | Jira 268 "retries" and 283 "bounded retry"; nothing is delivered, and no retry bound exists | Repeated and concurrent runs of the job are tested (one entry). The missing bound goes to 283 |
| C5 | `inbox.md`: a wrong type is refused; #158's own note: `10.5` accepted | BUG-2 |
| C6 | Confirmation entries are never backfilled, but a late entry is made at the next check after alerts are turned on | Both stated in the contract, one test each |
| C7 | `inbox-event-read.json` has a `createdAt` that is a Sunday | Cosmetic, not tested |
| C8 | Jira status: 262 Done while #153 is open; 267, 269, 271 "In Review" though merged; 268 "To Do" with an open PR | Noted only |
| C9 | Approving or rejecting an address request tells the parent nothing ("no notification") although stories 39 and 80 are about the parent's request | The empty inbox is asserted in a test named for the gap |
| C10 | #158 is stacked on #153, so the 268 branch carries #153 | The scratch merge takes the whole branch |

## Contract gaps (not asserted, nothing invented)

- The order of inbox entries with the same `createdAt`. (`unread` values other than `true` are not a gap: the contract says any other value lists all, and `TRUE`, `1`, `false`, `yes` and empty are tested.)
- A request to reject with **no body at all** (`approve` says "none", `reject` says `{ reason? }`), and which field a half-given pin names in its 400.
- What an approval does when the geocoder **fails** as against finds nothing. `address-requests.md` says "if anything fails, the request stays pending" and also "the way the head's own address edit does"; the students rule (`backend/CLAUDE.md`) is that a failed or empty lookup is not a failure and clears a pin that is not manual. The test holds an approval to what the head's own edit does (approved, address saved, pin cleared). Seen on the live app with Nominatim unreachable: approving quietly removed the child's pickup pin. Not a bug against the contract as written; see NOTE-1 in the bugs file.
- Whether an empty `?from=` means "not given" (BUG-1).
- Whether a weekend or a holiday date counts an absence in `absent` (the rule says "a live absence covering the day"; the contract has no word on weekends), and whether a run that already exists when a holiday is added is counted in the totals. The weekend days of a range with an absence are not asserted.
- CSV: the contract says UTF-8, which is asserted (the content type carries `charset=UTF-8`, no BOM). Not specified: the exact content-type string.
- No retry bound for late alerts: the contract names no count, no backoff and no definition of a "failed attempt".
- CSV escaping and CSV injection (`= + - @`): the file has only dates and numbers, so there is nothing to escape. It becomes necessary the day a name is added to the export.

## Independence limits

1. **The late job has no HTTP trigger.** `LateAlertCriteriaTests` call `LateAlertService.raise()` through the application context, by a class and method name taken from the PR #158 description, not from code. That is not "an assertion on an HTTP response". Everything else in those suites is HTTP.
2. **Same author for the late rule's inputs.** `plannedTime`, `estimate` and the location endpoints belong to Hashem's own SCRUM-233 to 237, 261 and 262 (tested by Moustafa under 272). The late tests read `plannedTime` from the API and never compute it, and the boundary tests use no position, but Hashem wrote both sides of those inputs. The two LIVE/STALE tests use a fix far from the stop, so the estimate's arithmetic is only checked as "much later than the limit".
3. **The authors' PR and Jira descriptions were read** (and the 268 branch's contract), and they say what the authors tested, so the test lists overlap theirs.
4. **`backend/CLAUDE.md` entries describe the design** (locks, unique keys, listeners in the same transaction), which hints at where bugs could be. Read, as the brief required.
5. **Rows saved straight to the database** are not HTTP: users, schools and their settings, students (so that a manual pin or an inactive status can be set) and holidays. The geocoding suite uses a `Geocoder` double (the outside provider only).
6. **The 268 suites have run only on a scratch merge**, never in CI, until #158 (and #153) merge. They are meant to run in CI by themselves from then on.
7. **`LateAlertService.raise()` scans every school's runs in progress** in the shared test database (the job has no school argument). Every assertion is scoped to its own parent, so nothing breaks, but each late test pays for the runs other tests left in progress. A cost, not a defect.
8. `RunCriteriaSupport.confirm` sends no confirmation key. If #155 makes one required, every run suite (these included) breaks, not only these.

## Runs

```
cd backend
sh ./mvnw -B clean verify                                                         # as CI runs it
sh ./mvnw test -Dtest='ParentInboxCriteriaTests,TransportTotalsCriteriaTests,AddressRequestCriteriaTests,AddressRequestGeocodingCriteriaTests'
sh ./mvnw test -Dpending.SCRUM-268=true -Dtest='NotificationPreferencesCriteriaTests,LateAlertCriteriaTests'   # develop: fails; with #158 merged: passes
sh ./mvnw test -Dknown-bug.SCRUM-268-coercion=true -Dtest=NotificationPreferencesCriteriaTests                  # BUG-2
sh ./mvnw test -Dknown-bug.SCRUM-271-empty-date=true -Dtest=TransportTotalsCriteriaTests                        # BUG-1
```

## Not covered

- A browser: that is SCRUM-282. The frontend tickets 275, 276, 277, 280, 281 are not tested here.
- Delivery of notifications outside the inbox (SCRUM-283) and its retry bound.
- Payments and more than one school (out of scope).
