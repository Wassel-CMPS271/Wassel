# Driver GPS and offline confirmation replay contract

Two things live here, at different stages:

- **Driver GPS (SCRUM-261 / PR #143) is not yet merged on `develop`.** Once it lands, the real
  contract is [`runs.md`'s "Live location"](runs.md#live-location) section, `Run.locationSharing`
  and the `BusLocation`/`RunLocation` shapes; this page no longer restates it — see
  [Client behaviour](#client-behaviour-driver-gps) below for what `frontend/src/lib/api/driverGps.ts`
  and the opt-in UI (SCRUM-273, PR #144) do with it. `driverGpsApi` only becomes real once PR #143
  merges, and PR #144 stays a draft until then.
- **Offline confirmation replay (SCRUM-263) is still DRAFT** — to be agreed with the SCRUM-263 owner
  (Hashem). Nothing below it is implemented on either side yet. Until it is agreed and the backend
  lands, `frontend/src/lib/api/confirmationReplay.ts` exports `null` in place of a client, and the
  offline queue keeps every item on the device instead of sending it (see
  [Open questions](#open-questions)).

This builds on [`runs.md`](runs.md), which owns the run, confirmation and location shapes. It does
not restate those; `Run`, `ConfirmationStatus` and the confirmation state table are as that page
defines them.

## Conventions

As in `runs.md`: ids are UUIDs, times of day are `"HH:mm"` school-local, and moments are ISO-8601
UTC with a `Z`. Every endpoint here needs the signed-in user with the `DRIVER` role, and only for
one of **today's** runs — same as `runs.md`'s driver endpoints, a run that is not today's (another
date, or hidden by a holiday) is **404**, exactly like an unknown run.

## Client behaviour (driver GPS)

How `frontend/src/lib/api/driverGps.ts` and the opt-in UI use `runs.md`'s GPS endpoints; nothing
here changes the contract, it only says what the client does with it.

- **Sending.** While sharing, the hook throttles fixes to about every 10 seconds (matching
  `runs.md`'s "send about every 10 seconds"), or sooner after 25 m of movement but never less than
  5 seconds apart, and sends `PUT .../location` with a `timeoutMs` of about 10 seconds. Only one
  send is in flight at a time: a fix that arrives meanwhile is skipped, not queued.
- **Opting in.** No position is sent until `setSharing(true)` has answered with success. A network
  failure or a 5xx keeps the opt-in and asks again when the connection is back (or on the
  connectivity retry tick); after 3 failures in a row the card shows an error with Try again.
  `setSharing` calls go out one at a time, in order, and an answer a newer call replaced is ignored.
- **Not queued offline.** A position is never written to the offline queue or retried after the
  fact: only the latest fix the device currently has is ever worth sending, so a stale one is never
  shown as current. This is unrelated to the confirmation queue below, which does persist items.
- **409 or 404 on opting in** pauses sharing as "refused" and the page refetches the day. A refused
  pause is sticky: going offline and back, or the screen hiding and showing, never clears it. Only
  a run change or the driver tapping Try again does; it is never retried on its own.
- **409 or 404 on sending a position** pauses the same way, and the page refetches the day.
  `setSharing(false)`'s answer then settles it: if the run is still `IN_PROGRESS`, sharing was
  withdrawn (another driver, a reassignment) and the card goes back to "Share my location";
  otherwise it stays refused. It never turns back on by itself, because consent belongs to the
  driver who gave it. The client never parses `detail` to tell these apart.
- **Any answer from the server** (400, 403, 5xx, with or without field errors) is not a network
  failure, so it never reports a connectivity failure; only a fetch that fails or times out does.
  A fix that's already out of range or non-finite on the device is skipped instead of sent.
- **`STALE` is shown as "last seen"**, never as "late": `runs.md`'s freshness rule means a locked
  phone or a backgrounded tab can make a position stale without anything being wrong, so the UI
  never implies the driver is behind schedule.
- **Opting out** (`setSharing(runId, { enabled: false })`) is sent on cleanup only when the server
  was told sharing was on — it's allowed any time for the driver's own run and safe to repeat,
  including right after End run.

## Shapes

### ConfirmationRequest (extended) — DRAFT

The existing `PUT .../confirmation` body (`runs.md#confirmations`), with one field added for
replay. It is new; nothing about `status` changes.

| Field | Type | Notes |
|---|---|---|
| `status` | `ConfirmationStatus` | unchanged |
| `clientRequestId` | string | an idempotency key the client generates once per confirmation attempt and resends on every retry of that same attempt (see [Confirmation replay and idempotency](#confirmation-replay-and-idempotency)). Not a header: it travels in the body like the rest of the request |

There is no client-sent time. `runs.md` is explicit that the confirmation time is the server's,
never the client's (see [Open questions](#open-questions)).

## Endpoints

| Method | Path | Role | Body | Success | Status |
|---|---|---|---|---|---|
| PUT | `/api/driver/runs/{runId}/students/{studentId}/confirmation` | DRIVER | `ConfirmationRequest` (extended) | 200 `Run` | DRAFT; extends an existing endpoint (`runs.md`) |

The confirmation endpoint's path and success shape are unchanged; only the body gains
`clientRequestId`. The GPS endpoints (`PUT .../location-sharing`, `PUT .../location`) are
`runs.md`'s, not restated here.

## Rules

### Confirmation replay and idempotency — DRAFT

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

In the same `ProblemDetail` shape as `runs.md`. GPS errors (409 on sharing/sending, 400 on a bad
fix) are `runs.md`'s own, not restated here; these are the confirmation replay extension's.

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` |
| A run that is not today's, not this driver's, or unknown | 404 | `detail` |
| A student who is not a stop on the run | 404 | as `runs.md` |
| A confirmation move `runs.md`'s table refuses, on a key not seen before | 409 | as `runs.md` |
| `clientRequestId` reused for a different `runId`/`studentId`/`status` | 422 | `detail` |
| Malformed body (bad numbers, missing `clientRequestId`, a date that isn't ISO-8601) | 400 | `detail: "Malformed request body"` |

## Open questions

1. **Can replay ship against the existing PUT, without this page's extension?** If SCRUM-263 is
   not ready when the rest of SCRUM-273 is, could the offline queue send plain
   `PUT .../confirmation { status }` (no `clientRequestId`) and rely only on `runs.md`'s existing
   "same status twice is a 200 no-op" rule for safety? That rule is weaker than a real idempotency
   key (it can't tell a genuine retry from a driver who tapped twice on purpose after seeing no
   feedback, and it does nothing for `PICKED_UP` → `DROPPED_OFF`, a different status each time), so
   SCRUM-273's queue is written against this page's extended body and stays behind the `null` API
   (confirmations behave online-only, as today) until SCRUM-263 ships either this or an equivalent.
2. **A client-sent confirmation time.** `runs.md` and the GPS rule above both say the server's own
   receive time is the only time; a client-supplied, server-clamped one would be a change to that
   rule and needs the owner's agreement, not just this page's. Until (and unless) that is agreed,
   the driver UI shows the local time of the tap as "saved at" and never assumes the server records
   that exact moment.

## Changing this contract

Change it by pull request to this file, tagging Hashem (SCRUM-261/263 owner) and Majd (SCRUM-273).
Once agreed, move the "DRAFT" note and the open questions above into resolved rules, the way
`runs.md` has none left.
