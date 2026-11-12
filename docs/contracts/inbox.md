# Parent inbox contract (SCRUM-267)

What a parent is told about their child on a run: picked up, dropped off, not at the stop, or late. An entry is made when the driver's confirmation is saved, or when a child is still waiting past the planned time. Each parent chooses which entries they receive. Build against this page, not against each other's code. One school.

Owner: Moustafa (SCRUM-267, SCRUM-268). Consumers: the parent inbox and notification preferences screen (S4-20) and the notification delivery (SCRUM-283).

## Conventions

- Cookie session, `credentials: "include"`, like every other endpoint. Every endpoint is for a signed-in **parent**; the school and the parent come from the session, never from the request.
- Ids are UUIDs. `createdAt` and `readAt` are moments, ISO-8601 in UTC with a `Z`. Field names are camelCase.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).
- Samples are in [`samples/inbox/`](samples/inbox).

## Shapes

### InboxEvent

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `type` | `"PICKED_UP"`, `"DROPPED_OFF"`, `"NOT_PRESENT"` or `"LATE"` | the driver's confirmation (`NOT_PRESENT` is "not at their stop"), or `LATE`: the child is still waiting and the pickup is later than planned by more than the parent's minutes (see [Late alerts](#late-alerts)) |
| `studentId` | uuid | |
| `studentName` | string | `firstName + " " + lastName` when it happened |
| `runId` | uuid | |
| `direction` | `"MORNING"` or `"AFTERNOON"` | the run's direction |
| `createdAt` | moment | the confirmation's time, or for `LATE` the moment the alert was made, from the server |
| `readAt` | moment or null | null while unread, set once |

The screen writes its own wording from `type`, `studentName` and `direction`; the server sends no message text. A `LATE` entry carries no position, estimate or planned time: only what every entry carries, about the parent's own child.

### UnreadCount

`{ "count": number }`

### NotificationPreferences

| Field | Type | Notes |
|---|---|---|
| `pickedUp` | boolean | tell me when my child is picked up |
| `droppedOff` | boolean | tell me when my child is dropped off |
| `notPresent` | boolean | tell me when my child was not at the stop |
| `late` | boolean | tell me when my child's pickup is late |
| `lateAfterMinutes` | integer, 5 to 60 | how many minutes after the planned pickup time a child still waiting counts as late |

A parent who never saved anything has `true, true, true, true` and `10`.

## Endpoints

| Method | Path | Role | Success |
|---|---|---|---|
| GET | `/api/parent/inbox?unread=` | PARENT | 200 `InboxEvent[]`, newest first, at most 50 |
| GET | `/api/parent/inbox/unread-count` | PARENT | 200 `UnreadCount` |
| POST | `/api/parent/inbox/{id}/read` | PARENT | 200 `InboxEvent` |
| POST | `/api/parent/inbox/read-all` | PARENT | 204 |
| GET | `/api/parent/notification-preferences` | PARENT | 200 `NotificationPreferences` |
| PUT | `/api/parent/notification-preferences` | PARENT | 200 `NotificationPreferences`, the saved choices |

## Rules

### When an entry is made

- One entry for each of the three confirmations, for the parent linked to the child **when the confirmation is saved**, unless that parent turned that type off ([Notification preferences](#notification-preferences)). A child with no linked parent makes none.
- An entry is made once per run, child and type. A driver's retry or a replay of a confirmation the child already has makes no second one, and neither does the job that makes late alerts, however often it runs. A wrong tap that the driver then moves on (`NOT_PRESENT`, then `PICKED_UP`) makes an entry for each, because both were true when saved.
- The entry is saved in the same transaction as the confirmation: both exist or neither does.
- An absence the parent reports is not an entry.

### Notification preferences

- `PUT` replaces all five choices at once: every field is required, so the answer never depends on what was saved before. Saving the same choices again changes nothing. A refused request (a missing field, `lateAfterMinutes` under 5 or over 60, a value of the wrong type) saves nothing.
- A choice applies to entries made **after** it is saved. Nothing already in the inbox is removed or added: turning a type off does not delete its entries, and turning it back on does not make the ones that were skipped. A type that is off makes no entry at all, so it is not counted as unread. The driver's confirmation is never affected.
- The choices are the signed-in parent's own, for all their children. Another parent and another school never see or change them, and every other role gets a 403.

### Late alerts

A job runs about once a minute and makes a `LATE` entry for a child who is **still waiting** on a **morning** run that is **in progress today**: not yet picked up or marked not present, and with no absence reported for today. It does not look at runs that have not started or have ended, at the afternoon (it has no planned times, see [`runs.md`](runs.md#live-eta-and-stop-progress)), or at a holiday.

- **Planned time.** The child's `plannedTime` from the runs contract, the school-local `HH:mm` of today. A stop with no planned time (no pin, or no schedule) is never late. School-local means the school's time zone (`Asia/Beirut`, summer and winter), not UTC.
- **Expected time.** The live estimate for the child's stop when the bus's position is `LIVE` (60 seconds or less, see [`runs.md`](runs.md#live-location)); otherwise the moment of the check, because the child has not been picked up yet.
- **Late** means the expected time is **after** the planned time plus the parent's `lateAfterMinutes`. Exactly that many minutes later is not late; one second more is. So a bus far from the stop makes the child late **before** the clock does, and a bus with no position, or one that went `STALE`, makes a child late only when the clock itself passes the planned time plus the minutes. **A stale or missing position is never a delay by itself**, and no alert says anything about GPS.
- **Once.** A child gets at most one `LATE` entry per run, however often the job runs, after a failed attempt, or if the parent changes their minutes afterwards. The entry is not withdrawn when the child is picked up later. A parent who has late alerts off is not told, and is told at the next check if they turn them on while the child is still late.
- **Who.** The parent linked to the child when the alert is made, and nobody else; a child with no linked parent makes none. The entry holds only the child's name, the run and the direction.

A client does not decide lateness itself: it shows the `LATE` entries the server made, and keeps showing `plannedTime` and `estimate` under their own labels.

### Reading

- A parent sees only their own entries. If the child is later linked to another parent, the earlier entries stay with the earlier parent.
- `unread=true` lists only unread entries; any other value, or none, lists all. Both are the newest 50. A parent with nothing gets `[]` and a count of `0`.
- The unread count counts all unread entries, not only the 50 listed.
- **Read** marks one entry read and answers with it. Reading an entry again changes nothing and keeps the first `readAt`. An unknown id and another parent's entry are the same 404.
- **Read all** marks every unread entry of the parent read, and is 204 even when there is nothing to mark.

## Errors

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` |
| An unknown entry, or another parent's | 404 | `detail` |
| An id in the path that does not parse | 400 | `detail: "Invalid request parameter"` |
| `PUT` preferences with a missing or invalid field | 400 | `errors` with the field's name |

## Known limits

- **No history beyond 50.** There is no paging and no clean-up of old entries yet.
- **No push or email.** This is the stored inbox only; delivering entries outside it is SCRUM-283.
- **Late alerts are morning only.** An afternoon run has no planned times. A run that was never started, or whose run row does not exist yet (a run is created the first time its day is asked for), is not watched: telling the head of transportation that a run has not started is not part of this.
- **The estimate runs early.** It is straight lines with no time at stops ([`runs.md`](runs.md#live-eta-and-stop-progress)), so a bus can be later than the alert says, never the reverse by design. A stop the driver passed but did not confirm still counts as waiting.
- **About a minute of delay.** The job runs a minute after its last run finished, so an alert is made within about a minute of the moment a child becomes late.
- **Entries before this release do not exist.** Confirmations saved earlier have no entry.

## Changing this contract

Change it by pull request to this file and the samples together, and tag Moustafa and the owners of the screen (S4-20) and SCRUM-283.
