# Driver GPS and offline confirmations: client behaviour

What the driver screen (SCRUM-273, PR #144) does with two contracts that are already merged into
[`runs.md`](runs.md). This page does not define an API. It only describes client behaviour on top
of them.

- **Driver GPS (SCRUM-261, PR #143, merged).** The contract is
  [`runs.md`'s "Live location"](runs.md#live-location): `Run.locationSharing` and the
  `BusLocation`/`RunLocation` shapes. The client is `frontend/src/lib/api/driverGps.ts`. See
  [Client behaviour (driver GPS)](#client-behaviour-driver-gps).
- **Offline confirmation replay (SCRUM-263, PR #155, merged).** The contract is
  [`runs.md`'s "Offline replay and `clientRequestId` (SCRUM-263)"](runs.md#offline-replay-and-clientrequestid-scrum-263):
  the request body, the order of checks, what each answer means and what the client must do with
  it. The client is `frontend/src/lib/api/confirmationReplay.ts`, and the queue is
  `frontend/src/lib/offline/`. See [Client behaviour (offline confirmations)](#client-behaviour-offline-confirmations).

`Run`, `ConfirmationStatus`, the confirmation table, ids, dates and "today" (`Asia/Beirut`) are as
`runs.md` defines them.

## Client behaviour (driver GPS)

How `driverGps.ts` and the opt-in UI use `runs.md`'s GPS endpoints. Nothing here changes the
contract.

- **Sending.** While sharing, the hook throttles fixes to about one every 10 seconds (matching
  `runs.md`'s "send about every 10 seconds"). It sends sooner after 25 m of movement, but never less
  than 5 seconds apart. Each `PUT .../location` has a `timeoutMs` of about 10 seconds. Only one send
  is in flight at a time: a fix that arrives meanwhile is skipped, not queued.
- **Opting in.** No position is sent until `setSharing(true)` has answered with success. A network
  failure or a 5xx keeps the opt-in and asks again when the connection is back (or on the
  connectivity retry tick). After 3 failures in a row the card shows an error with Try again.
  `setSharing` calls go out one at a time, in order, and an answer that a newer call replaced is
  ignored.
- **Not queued offline.** A position is never written to the offline queue or retried later. Only
  the latest fix the device has is worth sending, so a stale one is never shown as current. This is
  separate from the confirmation queue below, which does keep its items.
- **409 or 404 on opting in** pauses sharing as "refused", and the page refetches the day. A refused
  pause is sticky: going offline and back, or the screen hiding and showing, never clears it. Only a
  run change or the driver tapping Try again clears it. It is never retried on its own.
- **409 or 404 on sending a position** pauses the same way, and the page refetches the day.
  `setSharing(false)`'s answer then decides: if the run is still `IN_PROGRESS`, sharing was
  withdrawn (another driver, a reassignment) and the card goes back to "Share my location".
  Otherwise it stays refused. It never turns back on by itself, because consent belongs to the
  driver who gave it. The client never parses `detail` to tell these cases apart.
- **401 on opting in or sending** pauses sharing as "signed out": the watch stops, consent is kept,
  and the card says the session expired and offers Try again. No `setSharing(false)` is sent, since
  there is no session to send it with, and a stray 401 must not turn the run's sharing off behind
  the driver's back. The page then runs the [sign-in expiry flow](#sign-in-expiry-401). The pause
  is in the page's memory only: once the driver has left for `/login` and come back, the card starts
  at "Share my location", and positions are sent again only after the driver taps it.
- **Any other answer from the server** (400, 403, 5xx, with or without field errors) is not a
  network failure, so it never counts against connectivity. Only a fetch that fails or times out
  does. A fix that is already out of range or non-finite on the device is skipped, not sent.
- **`STALE` is shown as "last seen"**, never as "late". Under `runs.md`'s freshness rule, a locked
  phone or a background tab can make a position stale without anything being wrong, so the UI never
  implies the driver is behind schedule.
- **Opting out** (`setSharing(runId, { enabled: false })`) is sent on cleanup only when the server
  was told sharing was on. It is allowed any time for the driver's own run and safe to repeat,
  including right after End run.
- **Permissions-Policy.** `next.config.ts` sends `geolocation=(self)` on every page, which the
  opt-in needs.

## Client behaviour (offline confirmations)

How the queue (`lib/offline/queue.ts`, bound to the screen by `useOfflineQueue.ts`) uses `runs.md`'s
replay rules. The request, the checks and the answers are `runs.md`'s and are not restated here.

### Every tap goes through the queue

- Every Picked up / Dropped off / Not present tap is written to the queue first, **online or
  offline**, and the queue then sends it. There is one path, so an online tap gets a key too, and a
  timeout during an online tap is safe to resend.
- The replay is the same `PUT /api/driver/runs/{runId}/students/{studentId}/confirmation` as
  `confirmStudent` in `runs.ts`, with body `{ status, clientRequestId }`. The key is in the body,
  never in a header (the backend's CORS allows only `Content-Type`). There is no batch call: one
  request per tap, sent within a 15 second timeout.
- **Fallback when the phone cannot save a tap.** If storage is full, blocked or unreadable,
  `enqueue` refuses and the tap is sent straight away with `confirmStudent(runId, studentId,
  status)`, the plain `{ status }` body **without** a `clientRequestId`. `runs.md` allows this
  (the key is optional). The tap is never silently dropped. This path is online-only: a failure
  shows on the stop with its own Try again. It is taken only while that stop has no saved tap
  still unsent, so a direct request can never overtake an older saved tap for the same stop;
  otherwise the tap is refused with a message saying so, and Try again sends it once the saved one
  has gone. While the phone is offline (or the connection is being
  checked), the banner says confirmations can't be saved on this phone, because nothing is kept for
  later.

### One key per tap

- `enqueue()` gives each tap a new `clientRequestId`, an RFC 4122 v4 UUID (`crypto.randomUUID`, or
  `crypto.getRandomValues` outside a secure context, never `Math.random`). It writes the item, key
  included, to `localStorage` in the same synchronous call, before anything is sent.
- The key never changes after that. The automatic retry, the driver's Try again, a reload (an item
  left `sending` by a tab that closed mid-send goes back to `queued` with the same key) and a drain
  by another tab all read the stored item's key. No code path makes a key for an item that already
  exists.
- A stored item whose `clientRequestId` is not a UUID makes the stored queue unreadable (treated as
  storage failure, so taps use the fallback above) instead of becoming a request the server would
  refuse with 400 forever.
- Tapping the same status again while the earlier tap for that student is still waiting to go
  (`queued`, `blocked` or `sending`) changes nothing: one item, one key. Any other repeat (after a
  failure, or A → B → A) is a new item with a new key. Two tabs tapping the same thing make two
  items with two keys. `runs.md` rule 5 makes all of these one record on the server.

### Storage and ordering

- One queue per signed-in user, in `localStorage` under `wassel.driver.queue.v1.<userId>`. Another
  driver signing in on the same phone has a different key, so they neither see nor send the first
  driver's items.
- Items for one student on one run go out in the order they were tapped, one at a time. While the
  first unsent one has failed, the ones behind it are `blocked`.
- Two tabs share one stored queue. Every change runs under a write lock shared by the tabs (a Web
  Lock), and `enqueue()` writes to a pending key of its own (`<key>.pending.<itemId>`) so it never
  waits for a lock and a tap is never lost. A drain lock means only one tab sends at a time.
- The device's tap time (`occurredAt`) is kept for display only ("saved at …", labelled as this
  phone's time) and is **never sent**. The server times a replayed tap when it arrives (`runs.md`
  "Known limits").

### Status mapping

| Server answer | Queue | Stop shows |
|---|---|---|
| **200**: recorded, already recorded, or a repeat of a key already applied | `synced`; removed after about 3 s | Redrawn from the server's answer. A repeat answers with the run **as it is now**, so the stop may show a later status than the one tapped |
| **404** | The day is refetched, then the item is **dropped**, with the taps queued behind it for that student | The server's `detail` under the stop, until the driver taps that stop again, plus how many later taps were not sent when any were. When the refetched day no longer has the run (reassigned), the notice is on the page instead, with the student's name |
| **409** | The day is refetched, then the item is dropped. The taps behind it for that student are dropped too only when the refetched run is no longer `IN_PROGRESS` (or gone). While it still is, the 409 refused that one move (Not present, then Dropped off, say), so the next tap goes out and gets its own answer; the same when the refetch fails | `detail`, with the count of later taps not sent when any were, under the stop, or on the page when the run is `FINISHED` or gone (it has no card any more). Nothing is shown when the refetched stop already has the tapped status (or `DROPPED_OFF` for a Picked up) and no later tap was dropped: that is the double-tap after End run of `runs.md` rule 7 |
| **422**: the key was used for a different confirmation (a client bug, logged with `console.error`) | `error` (rejected); never resent | The message, and **Dismiss only**. Try again would resend the same key and get the same answer |
| **400** (including field errors) | `error` (rejected); never resent | Message, **Dismiss only** |
| **403** | `error` (rejected); never resent | Message, **Dismiss only** |
| **5xx**, 429, 408, network error, timeout, or an unexpected failure | `error` (retryable), resent automatically after a backoff (2 s, 4 s, 8 s … at most 60 s) and on the connectivity tick, always with the **same** key. The drain stops at the first one (most likely offline) | "Couldn't send" with **Try again** (same key) |
| **401** | Back to `queued` with the same key. The whole queue **pauses** and keeps every item; nothing else is sent | The [sign-in expiry flow](#sign-in-expiry-401) |
| An item from an earlier day | Never sent (`runs.md`: it would be 404). Shown as `conflict` | "Conflict" with "This confirmation is from an earlier day and wasn't sent.", **Dismiss** only |

### End run

End run is disabled while the current run has any unsent item (queued, sending, blocked, or a
retryable or rejected error), with the reason shown, so queued confirmations go out before the run
ends (`runs.md` rule 7). 404/409 items are dropped, so they never block it. `UserBlock` warns before
a voluntary sign-out while the phone holds unsent items from today.

### Sign-in expiry (401)

A 401 from the queue, from the day's load, from Start/End run or from a GPS call goes to one handler
on the page:

1. Only the queue's own 401 pauses the queue at once (it keeps every item, with its key, in
   `localStorage`). A 401 from anything else leaves the queue running until `me()` has answered. A
   GPS 401 pauses sharing as "signed out" with consent kept (see
   [above](#client-behaviour-driver-gps)).
2. The page calls `me()` to tell a real sign-out from a stray 401:
   - **`me()` is 401:** the session is gone. The queue is paused (if it was not already), the GPS
     card is told it is signed out (so neither that nor its unmount sends a location-sharing
     request without a session), and only then does the page navigate to `/login?expired=1`, which
     shows "Your session expired. Please sign in again." The banner also says the session expired
     and has a "Sign in again" link to the same page, in case the redirect does not happen. Until
     `me()` has said 401, a paused banner only says sending is paused while the sign-in is checked.
   - **`me()` answers:** the session is fine. A 401 from another call changes nothing. After the
     queue's own 401 the queue resumes once; a second queue 401 before anything has synced leaves
     it paused, so a 401 that keeps coming back cannot loop. The banner's Send now still resumes it
     by hand.
   - **`me()` cannot answer** (offline, 5xx): it asks again on the next connectivity tick (every
     30 s). A queue paused by its own 401 stays paused meanwhile, and no tick resumes it.
3. After signing in (`/login`, then `/verify-2fa`), the driver lands on `/driver`, their home. The
   page builds a new queue for the same user and storage key. It starts unpaused and **drains
   everything left, with the original keys**. If the server had already applied one of them, it
   answers 200.
4. The 401 path never clears storage. Items stay until they are sent or dismissed, even if
   another driver signs in on the phone in between.

## Known follow-ups

- Scoping `next.config.ts`'s `Permissions-Policy: geolocation=(self)` to `/driver` (rather than
  every page) needs full-page loads into `/driver`, since a header applies to the response that
  set it, not to a client-side navigation that lands there.
- A tap sent directly (the online-only fallback, storage already failing) that gets a 401 is lost
  once the redirect to `/login` happens: nothing re-saves it first, unlike a queued item, which
  storage already holds.
- Tapping Try again on a retryable item while an earlier send for it is still finishing (in
  flight) waits for the next 30-second connectivity tick rather than going at once: `drain()`
  returns the in-flight run without starting a new one, so Try again should ask it to run again
  once that send settles, rather than assume the one in flight already covers it.

## Changing this page

Change it by pull request, tagging Hashem (SCRUM-261/263 owner) and Moustafa (raised the
Permissions-Policy scoping point above). A change to the API itself belongs in `runs.md` and its
samples, not here.
