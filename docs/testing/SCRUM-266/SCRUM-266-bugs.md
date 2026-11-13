# SCRUM-266: findings in Moustafa's work

Found while testing SCRUM-268 and SCRUM-271 for SCRUM-266 (2026-11-13). Two findings, both small (plus two notes for the authors at the end). Neither damages data. Each is kept as a test behind a switch (so CI stays green and the test is not weakened), and each has a paste-ready comment below. Not fixed here: the tester raises failing tests on the author's PR and does not change feature code.

| | Story | Where | What | Raise it on |
|---|---|---|---|---|
| BUG-1 | SCRUM-271 totals (merged, PR #152) | `HeadOfTransportReportController` (`from`, `to`) | `?from=` or `?to=` with an **empty** value is read as "not given" and answers 200 with today's figures, where the contract says a date that is not `YYYY-MM-DD` is 400 | a comment on the merged PR #152, or a small bug ticket |
| BUG-2 | SCRUM-268 preferences (PR #158, open) | `UpdateNotificationPreferencesRequest` and the app's Jackson settings | `PUT /api/parent/notification-preferences` accepts a value of the wrong type: `10.5`, `"10"`, `"true"` and `1` for a boolean are all saved (200), where the contract says a value of the wrong type is refused | PR #158 |

Both were run through MockMvc on the PostgreSQL 16 Testcontainers database. BUG-2 was run on a scratch merge of `origin/develop` (5da9d2c) with `origin/feat/SCRUM-268-notification-preferences` (5e26e320, which carries #153 at aef97a37), not committed and removed afterwards.

---

## BUG-1: an empty `from` or `to` is "not given"

**Severity: Minor.** A screen that sends `?from=` with an empty date box gets today's figures instead of an error, so a bug in that screen would show a wrong range without any sign.

**Contract.** `docs/contracts/transport-totals.md`, "The range": "`from` defaults to today and `to` defaults to `from`", and "A date that is not `"YYYY-MM-DD"` is 400". An empty text is not a date. The contract does not say that an empty value counts as omitted, so this may be settled either way by a one-line contract change.

**Repro.** Head of transportation signed in:

```
GET /api/head-of-transport/transport-totals?from=      -> 200, from = today   (contract: 400, "Invalid request parameter")
GET /api/head-of-transport/transport-totals?to=        -> 200, to = from      (contract: 400)
```

**Test.** `TransportTotalsCriteriaTests.anEmptyDateIs400LikeAnyOtherMalformedDate`, run with `-Dknown-bug.SCRUM-271-empty-date=true`. The other malformed dates (`2026-02-30`, `2026-13-01`, `11/03/2026`, a date with a time, a word) are all 400 and run in CI.

**Why (read after the test failed).** Both parameters are `@RequestParam(required = false) @DateTimeFormat(iso = DATE) LocalDate`; Spring converts an empty string to `null` for that type, and `null` means "default".

**Paste-ready comment for #152.**

> Independent test (SCRUM-266): `GET /api/head-of-transport/transport-totals?from=` (and `?to=`, and the same on `/export`) answers 200 with today's figures. The contract says a date that is not `YYYY-MM-DD` is 400, and an empty value is not a date. Every other malformed date is 400 today, so this is the one gap. Either reject an empty value (for example `@RequestParam` as `String` and parse it, or a `Converter` that refuses blank text) or add one line to `transport-totals.md` saying an empty value means "not given". Test: `TransportTotalsCriteriaTests.anEmptyDateIs400LikeAnyOtherMalformedDate`, behind `-Dknown-bug.SCRUM-271-empty-date=true`; delete that line when it is settled.

---

## BUG-2: wrong-typed preference values are accepted

**Severity: Minor to Important**, depending on the client: nothing is corrupted (`10.5` is stored as 10, `"10"` as 10, `"true"` as true, `1` as true), but the contract's "a value of the wrong type" refusal does not hold, and this comes from the application's Jackson settings, so it is probably true of **every** endpoint with a boolean or integer body, not only this one.

**Contract.** `docs/contracts/inbox.md` on #158, "Notification preferences": "A refused request (a missing field, `lateAfterMinutes` under 5 or over 60, a value of the wrong type) saves nothing." The PR description's own "does not cover" says `lateAfterMinutes: 10.5` is accepted as 10, so the author knows; the contract was not changed to match.

**Repro** (parent signed in), each answers **200** and is saved:

```
PUT /api/parent/notification-preferences  {"pickedUp":true,"droppedOff":true,"notPresent":true,"late":true,"lateAfterMinutes":10.5}
PUT ...                                   {"pickedUp":true,"droppedOff":true,"notPresent":true,"late":true,"lateAfterMinutes":"10"}
PUT ...                                   {"pickedUp":"true","droppedOff":true,"notPresent":true,"late":true,"lateAfterMinutes":10}
PUT ...                                   {"pickedUp":1,"droppedOff":true,"notPresent":true,"late":true,"lateAfterMinutes":10}
```

Refused correctly (400, run in CI): `"late":"yes"`, `"lateAfterMinutes":true`, text that is not JSON, a missing field, a null field, 4, 61, 0 and -10 minutes.

**Test.** `NotificationPreferencesCriteriaTests.aValueOfTheWrongTypeIs400AndSavesNothing`, run with `-Dknown-bug.SCRUM-268-coercion=true` (on the scratch merge: 1 failure, the four bodies above listed).

**Why (read after the test failed).** The request record uses `Boolean` and `Integer`, and Jackson's default scalar coercion turns `"10"`, `10.5` and `1` into them. Turning coercion off is an application-wide Jackson setting that would touch other endpoints, which is why it is a decision for the author and not a one-line fix here. (Not verified in the code: that reading comes from the 400 log lines of the cases that are refused and the PR's own note.)

**Paste-ready comment for #158.**

> Independent test (SCRUM-266): `PUT /api/parent/notification-preferences` accepts `lateAfterMinutes: 10.5` and `"10"`, and `pickedUp: "true"` and `pickedUp: 1`, and saves them (200). `inbox.md` says a value of the wrong type is refused and saves nothing. Your PR notes the 10.5 case; the contract and the code disagree, so one of them has to move. If the contract should win, it is Jackson's scalar coercion (an application-wide setting, so it may change other endpoints, please check before switching it off); if the code should win, change the sentence in `inbox.md`. Test: `NotificationPreferencesCriteriaTests.aValueOfTheWrongTypeIs400AndSavesNothing`, behind `-Dknown-bug.SCRUM-268-coercion=true`; delete that line when settled. The other refusals (missing, null, 4, 61, text for a boolean, a boolean for a number) all work and are tested.

---

## Notes for the authors (not failures)

### NOTE-1: an approval during a Nominatim outage removes the child's pickup pin (#145)

Seen on the live app (Nominatim unreachable, student without a manual pin): approving a request with no pin gave 200 `approved`, saved the new address and set the student's latitude and longitude to null. The head's own `PATCH .../students/{id}/address` did the same to an identical student. That is the documented students rule (`backend/CLAUDE.md`: a failed or empty lookup returns empty and clears a pin that is not manual), and the contract says approval works "the way the head's own address edit does", so it is not a bug against the contract as written. But `address-requests.md` also says "If anything fails, the request stays pending", so the word "fails" is ambiguous: a lookup that finds nothing is not a failure here. Held to what the head's edit does by `AddressRequestGeocodingCriteriaTests.anApprovalWhenTheProviderFindsNothingDoesWhatTheHeadsOwnEditDoes`.

**Paste-ready comment for #145.**

> Independent test (SCRUM-266), a question rather than a bug. With Nominatim down (or an address it cannot find), approving an address request for a student without a manual pin answers 200 `approved`, saves the address and clears the student's pin (latitude and longitude null), exactly as the head's own `PATCH .../address` does. That matches the students rule, but `address-requests.md` says "If anything fails, the request stays pending", so during an outage a parent's request quietly removes the child's pickup pin. Should a request that comes without a pin and cannot be geocoded keep the old pin, or stay pending, or is clearing it intended? One sentence in the contract settles it. Tested as "the same as the head's own edit": `AddressRequestGeocodingCriteriaTests.anApprovalWhenTheProviderFindsNothingDoesWhatTheHeadsOwnEditDoes`; if the answer changes, that test changes with it.

### NOTE-2: #142's draft contract conflicts with the merged one

Majd's #142 adds its own draft `docs/contracts/address-requests.md`. It is now an add/add conflict with the merged contract (`mergeable: CONFLICTING`), and the draft says an unknown `status` filter is `detail: "Invalid request parameter"`. The merged contract and `AddressRequestCriteriaTests` say **400 on `errors.status`**, so the 275 screen's client must read `errors.status`. Also for the 276/277 screens: the totals are head-only and an admin gets 403.

**Paste-ready comment for #142.**

> Heads-up (SCRUM-266): `address-requests.md` was merged from #145 and now conflicts with the draft in this PR. Please drop your copy and take the merged one. One difference that matters to the screen: an unknown `?status=` is `400` with `errors: { status: ... }`, not `detail: "Invalid request parameter"`. `AddressRequestCriteriaTests` checks the `errors.status` shape.
