# Driver GPS and offline confirmation replay contract

**DRAFT — to be agreed with the SCRUM-261/263 owner (Hashem).** Nothing below is implemented on
either side yet. SCRUM-261 (the driver GPS API) and SCRUM-263 (the offline confirmation replay
API) are not started; this page is the frontend's proposal for what they should look like, written
for SCRUM-273 (driver GPS opt-in and offline queue UI). Until it is agreed and the backend lands,
`frontend/src/lib/api/driverGps.ts` and `frontend/src/lib/api/confirmationReplay.ts` export `null`
in place of a client, and the driver screens behave as they do today (no position sharing, no
offline queue — see [Open questions](#open-questions)).

This builds on [`runs.md`](runs.md), which owns the run, confirmation and driver-day shapes. It
does not restate those; `Run`, `ConfirmationStatus` and the confirmation state table are as that
page defines them.

## Conventions

As in `runs.md`: ids are UUIDs, times of day are `"HH:mm"` school-local, and moments are ISO-8601
UTC with a `Z`. Every endpoint here needs the signed-in user with the `DRIVER` role, and only for
one of **today's** runs — same as `runs.md`'s driver endpoints, a run that is not today's (another
date, or hidden by a holiday) is **404**, exactly like an unknown run.

## Shapes

### LocationSharing

Whether the driver is sharing their position on one run.

| Field | Type | Notes |
|---|---|---|
| `enabled` | boolean | |
| `since` | moment or null | when sharing last turned on; null while `enabled` is false |

### Position

The body of one position update. Not stored as its own resource the client can read back; the
server only ever answers 204.

| Field | Type | Notes |
|---|---|---|
| `latitude`, `longitude` | number | as `Stop.latitude`/`longitude` in `routing.md` |
| `accuracyMeters` | number | the device's reported accuracy, so the backend (or a later screen) can discard a bad fix instead of trusting every reading equally |
| `recordedAt` | moment | the device's clock when the fix was taken, not when the request arrived — the two can differ once a retry or a slow connection is involved |

### ConfirmationRequest (extended)

The existing `PUT .../confirmation` body (`runs.md#confirmations`), with two fields added for
replay. Both are new; nothing about `status` changes.

| Field | Type | Notes |
|---|---|---|
| `status` | `ConfirmationStatus` | unchanged |
| `clientRequestId` | string | an idempotency key the client generates once per confirmation attempt and resends on every retry of that same attempt (see [Confirmation replay and idempotency](#confirmation-replay-and-idempotency)). Not a header: it travels in the body like the rest of the request |
| `occurredAt` | moment, optional (omitted, not null) | **OPEN QUESTION** — see [Open questions](#open-questions). When sent, the time the driver tapped the button on their device, for the server to use instead of its own receive time, clamped so a late replay doesn't misrecord progress |

## Endpoints

| Method | Path | Role | Body | Success | Status |
|---|---|---|---|---|---|
| GET | `/api/driver/runs/{runId}/location-sharing` | DRIVER | | 200 `LocationSharing` | proposed |
| PUT | `/api/driver/runs/{runId}/location-sharing` | DRIVER | `{ enabled }` | 200 `LocationSharing` | proposed; the client turns sharing off with `{ enabled: false }` too |
| DELETE | `/api/driver/runs/{runId}/location-sharing` | DRIVER | | 204 | alternative to `PUT { enabled: false }`, not used by the client (open question) |
| POST | `/api/driver/runs/{runId}/positions` | DRIVER | `Position` | 204 | proposed |
| PUT | `/api/driver/runs/{runId}/students/{studentId}/confirmation` | DRIVER | `ConfirmationRequest` (extended) | 200 `Run` | extends an existing endpoint (`runs.md`) |

The confirmation endpoint's path and success shape are unchanged; only the body gains
`clientRequestId` and `occurredAt`.

## Rules

### GPS consent

- Turning sharing on (`PUT { enabled: true }`) is allowed only while the run is `IN_PROGRESS`
  (SCRUM-273's decision: GPS is tied to an active, consented run, never to the driver in general).
  Any other state is **409**, same wording style as `runs.md`'s run-state errors.
- Turning sharing off is `PUT { enabled: false }` (what `DriverGpsApi.setSharing` sends; `DELETE`
  is listed above as an alternative, see [Open questions](#open-questions)). It is always allowed for
  one of today's runs, whatever its state, so a driver can always withdraw consent.
- `GET` answers `{ enabled: false, since: null }` for a run sharing has never been turned on for;
  it is not a 404 just because nothing has happened yet.
- Sharing does not carry over between runs or between the morning and afternoon run of the same
  route: each run starts with `enabled: false` (see [Open questions](#open-questions) on whether
  that should instead be "once a day").

### Position submission

- Allowed only while `enabled` is true **and** the run is `IN_PROGRESS`. Either failing is **409**
  (two different reasons, one status — the client already knows which one it expects, having just
  read or set `LocationSharing` and the run's state).
- A run that is not today's, or not this driver's, is **404**, as elsewhere.
- Not queued by the client while offline (SCRUM-273's decision): only the latest fix is sent once
  back online, so a stale position is never shown as current. The server does not need to care
  about catching up a backlog.
- **429 is reserved** for a rate limit (e.g. more than one fix in a short window), to stop a buggy
  client from flooding the backend. Not necessarily enforced in the first version; documented here
  so the client's error handling has somewhere to put it from day one.

### Confirmation replay and idempotency

- `clientRequestId` is generated once per confirmation **attempt** — one tap of Picked up / Dropped
  off / Not present — and the same value is sent on every retry of that attempt, including a
  driver-initiated "Try again". A new tap (a different status, or the same status after an earlier
  attempt already succeeded) gets a new id.
- **Same `clientRequestId`, same `{ runId, studentId, status }`:** the server returns the recorded
  result again (**200**, the same `Run` an identical fresh request would get under `runs.md`'s own
  rules — this does not change what counts as a duplicate status, only guarantees a retried network
  call never double-submits or gets a different answer than the first attempt did).
- **Same `clientRequestId`, a different `runId`, `studentId` or `status`:** **422** — the key was
  reused for a different request, which the client must never do on purpose; this exists so a bug
  fails loudly instead of silently returning the wrong student's confirmation.
- Keys are **scoped to the driver**: two different drivers may use the same key value (in practice
  never, since a UUID is generated per attempt) without colliding.
- Keys are kept for **at least the rest of the school day** they were made on (so a reconnect any
  time before the driver's day ends still replays correctly); exactly how much longer is an
  implementation choice for the owner, not a client concern.
- This dedup happens **before** `runs.md`'s confirmation table is consulted, and only for a key
  seen before. A first-seen key is checked against that table as today; nothing about `runs.md`'s
  own transition rules changes.

## Per-item result → UI state

How the offline queue (SCRUM-273, `frontend/src/lib/offline/`) turns one call's outcome into what
a stop shows. Not part of the HTTP contract itself — this table exists so the two sides agree on
what each status means for the UI before either is built.

| Outcome | UI state | Meaning |
|---|---|---|
| Not yet sent | `queued` | Written to the device, not sent yet (offline, or waiting behind an earlier item for the same stop) |
| In flight | `sending` | A request for it is in progress |
| 200, matches what was tapped | `synced` | Recorded (or already was, via `clientRequestId` dedup); shown briefly, then the item is dropped |
| 404, 409 from the confirmation table, or any other answer saying the server disagrees with what the UI expected | `conflict` | Something changed server-side since the tap (the run ended, the student was moved, a later status already exists). The day is refetched and the server's own `detail` is shown; dismissing only clears the local item, never retries it |
| 400, 403, 422 (422: key reused for a different request), other 4xx | `error` (rejected) | The server refused the request itself; never sent again automatically, only on the driver's Try again |
| Network failure, timeout (see `client.ts`'s `timeoutMs`), or 5xx/429 | `error` | Retryable: "Try again" resends the same `clientRequestId` |
| 401 | — (not shown per item) | Pauses the whole queue; the driver is routed to sign in again, and items are kept for when they're signed in again |

## Errors

In the same `ProblemDetail` shape as `runs.md`.

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` |
| A run that is not today's, not this driver's, or unknown | 404 | `detail` |
| Turn sharing on, or send a position, while the run is not `IN_PROGRESS` | 409 | `detail`, naming the run's state |
| Send a position while sharing is off | 409 | `detail` |
| Too many position updates in a short time | 429 | `detail` (reserved; see [Position submission](#position-submission)) |
| `clientRequestId` reused for a different `runId`/`studentId`/`status` | 422 | `detail` |
| A confirmation move `runs.md`'s table refuses, on a key not seen before | 409 | as `runs.md` |
| A student who is not a stop on the run | 404 | as `runs.md` |
| Malformed body (bad numbers, missing `clientRequestId`, a date that isn't ISO-8601) | 400 | `detail: "Malformed request body"` |

## Open questions

1. **`occurredAt`.** `runs.md` is explicit that confirmation time "is the server's, never the
   client's" and "there is no undo". A client-supplied, server-clamped `occurredAt` is a change to
   that rule and needs the owner's agreement, not just this page's. Until agreed, the driver UI
   shows the local time of the tap as "saved at" and never assumes the server records that exact
   moment.
2. **Consent scope.** Per run (as drafted above — each run starts with sharing off) or per day
   (turn on once, applies to both the morning and afternoon run)? Per-run is simpler to reason
   about and matches "share positions only for a consented active run" in the ticket most
   literally; per-day is fewer taps for the driver.
3. **Does End run turn sharing off?** If a driver ends the run without explicitly stopping sharing
   first, should the server turn it off for them (so the next run starts clean per question 2), or
   leave it for the client to call `DELETE` itself before/after ending? Affects whether `RunAction`
   needs to also call the GPS endpoint.
4. **Who can see positions, and for how long?** Not just the driver's own screen — presumably the
   head of transportation and/or the parent, for a "where's the bus" view, which this page doesn't
   define (no read endpoint for anyone but the driver is proposed here). Retention: are positions
   kept after the run ends, and if so for how long, or are they transient (last-known-position
   only, nothing kept)?
5. **Can replay ship against the existing PUT, without this page's extension?** If SCRUM-263 is
   not ready when the rest of SCRUM-273 is, could the offline queue send plain
   `PUT .../confirmation { status }` (no `clientRequestId`) and rely only on `runs.md`'s existing
   "same status twice is a 200 no-op" rule for safety? That rule is weaker than a real idempotency
   key (it can't tell a genuine retry from a driver who tapped twice on purpose after seeing no
   feedback, and it does nothing for `PICKED_UP` → `DROPPED_OFF`, a different status each time), so
   SCRUM-273's queue is written against this page's extended body and stays behind the `null` API
   (confirmations behave online-only, as today) until SCRUM-263 ships either this or an equivalent.

## Changing this contract

Change it by pull request to this file, tagging Hashem (SCRUM-261/263 owner) and Majd (SCRUM-273).
Once agreed, move the "DRAFT" note and the open questions above into resolved rules, the way
`runs.md` has none left.
