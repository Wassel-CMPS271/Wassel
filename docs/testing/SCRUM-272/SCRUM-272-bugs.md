# SCRUM-272: findings in the live, offline and reassignment work

Found while testing SCRUM-261, 262, 263 and 264 for SCRUM-272 (2026-11-13). **One finding**, small, in merged code; plus three notes that are not failures. Nothing damages data. The finding is kept as a test behind a switch (so CI stays green and the test is not weakened) and has a paste-ready comment below. Not fixed here: the tester raises failing tests on the author's PR and does not change feature code.

| | Story | Where | What | Raise it on |
|---|---|---|---|---|
| BUG-1 | SCRUM-261 location (merged, PR #143) | the bodies of `PUT .../location-sharing` and `PUT .../location` | a value of the wrong type is **converted**, not refused: `{"enabled":"true"}` and `{"enabled":1}` give consent (200), and a latitude, longitude or accuracy written as a text (`"33.9"`) is accepted and stored (204) | a comment on the merged PR #143, or a small bug ticket |

---

## BUG-1: wrong-typed values are converted in the location bodies

**Severity: Minor.** Nothing is corrupted (`"33.9"` is stored as 33.9, `1` and `"true"` as consent), but two rules do not hold for these bodies: the contract's "all required, all finite numbers. Anything else is 400" for a position, and the ticket's explicit opt-in. A client bug (a form that sends a checkbox as `1`, a number kept as text) is saved as if it were a clear choice. It is the same class as SCRUM-266's BUG-2 on the notification preferences, which was fixed for that one request; it comes from the application's Jackson settings, so it is probably true of **every** endpoint with a boolean or number body, not only these two.

**Contract.** `docs/contracts/runs.md`, "Live location": "**Validation.** `latitude` -90 to 90, `longitude` -180 to 180, `accuracyMeters` 0 to 10000, all required, all finite numbers. Anything else is 400." and "**Consent.** The driver opts in per run with `PUT .../location-sharing { enabled: true }`". A text is not a number, and `1` is not `true`.

**Repro** (driver signed in, own run `IN_PROGRESS`), each answers a success status and is acted on:

```
PUT /api/driver/runs/{runId}/location-sharing  {"enabled":"true"}                              -> 200, sharing on
PUT /api/driver/runs/{runId}/location-sharing  {"enabled":1}                                   -> 200, sharing on
PUT /api/driver/runs/{runId}/location          {"latitude":"33.9","longitude":0,"accuracyMeters":5}   -> 204, stored
PUT /api/driver/runs/{runId}/location          {"latitude":0,"longitude":"35.5","accuracyMeters":5}   -> 204, stored
PUT /api/driver/runs/{runId}/location          {"latitude":0,"longitude":0,"accuracyMeters":"5"}      -> 204, stored
```

Refused correctly (400, run in CI): a missing field, `null`, `true` or `[33.9]` for a number, `NaN`, `1e999`, an out-of-range value (90.000001, 180.000001, accuracy -0.001 and 10000.001), `{}`, `[]`, text that is not JSON; and for consent `{}`, `null`, `"yes"`, `[true]`.

**Test.** `LiveLocationCriteriaTests.aTextForANumberAndATextOrANumberForConsentAreRefusedNotConverted`, run with `-Dknown-bug.SCRUM-261-coercion=true` (on `develop`: 1 failure, the five bodies above listed). The refusals that already work run in CI.

**Why (inferred, not read in the code).** The records use `Boolean` and `Double` and Jackson's default scalar conversion turns `"true"`, `1` and `"33.9"` into them; the same conversion explains SCRUM-266's BUG-2. Not checked in the code.

**Suggested fix.** What SCRUM-268 did for its one request (`inbox/dto/StrictScalar`, two small strict deserializers on those fields), or one application-wide setting, which is a decision for the owner because it would change every endpoint and a client may rely on it.

**Paste-ready comment for #143.**

> Independent test (SCRUM-272): `PUT .../location-sharing` accepts `{"enabled":"true"}` and `{"enabled":1}` as an opt-in (200), and `PUT .../location` accepts a latitude, longitude or accuracy written as a text, `"33.9"` (204, stored). `runs.md` says a position's fields are all finite numbers and anything else is 400, and the ticket asks for an explicit opt-in. It is Jackson's default scalar conversion, so it is probably true of every endpoint with a boolean or number body; SCRUM-268 made its own request strict (`inbox/dto/StrictScalar`) after the same finding (SCRUM-266, BUG-2). Either do the same for these two bodies, or decide on one application-wide setting (it would change every endpoint, so please check the clients first). Test: `LiveLocationCriteriaTests.aTextForANumberAndATextOrANumberForConsentAreRefusedNotConverted`, behind `-Dknown-bug.SCRUM-261-coercion=true`; delete that line when settled. All the other refusals (missing, null, out of range, NaN, wrong JSON) work and are tested.

---

## Notes for the authors (not failures)

### NOTE-1: #155 and #156 conflict in `RunService.confirm`, and the order of the two checks matters (#155, #156)

Both PRs change `RunService.confirm` and `docs/contracts/runs.md`, and the second to merge has to combine them. Hashem's own note on #155 says how: `lockOwnedRun` first, the `clientRequestId` lookup after it. **Checked on a scratch merge** (the two branches merged by hand with exactly that order, not committed, removed afterwards): `OfflineReplayCriteriaTests` 16 of 16, `DriverReassignmentCriteriaTests` 20 of 20 (including the one test that needs both: an old driver's key used before the change is a 404 and never the "already applied" 200), and the authors' `ConfirmationReplayTests` (29), `RunOwnershipRecheckTests` (4) and `DriverWritesRecheckOwnershipTests` (7) all pass. The migrations are V13 (#155) then V14 (#156), and #158 (V15) after both.

### NOTE-2: the withdrawal of sharing that the review asked for is in #156

On the first review of #156 the reassignment did not call `stopSharing`. At `e3d4a77` it does: `reassigningWithdrawsSharingSoTheNewDriverMustOptInAndTheOldPositionIsGone` passes (the old position disappears from the parent's view and the head's list, the old driver's position and opt-in are 404, the new driver's position is 409 until they opt in).

### NOTE-3: a time sent by the phone

The contract says the server's receive time is the only time and the phone's clock is never read. A body that also carries a time (`receivedAt`, `timestamp`, `time` on a position; `at`, `confirmedAt` on a confirmation) is either refused (400) or its time is ignored: the tests accept both and assert that the time is never used. Which of the two happens is not in the contract.
