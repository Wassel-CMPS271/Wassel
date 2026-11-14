# Parent inbox contract (SCRUM-267)

What a parent is told about their child on a run: picked up, dropped off, or not at the stop. An entry is made when the driver's confirmation is saved. Build against this page, not against each other's code. One school.

Owner: Moustafa (SCRUM-267). Consumers: the parent inbox screen (S4-20) and the notification preferences and late alerts (SCRUM-268).

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
| `type` | `"PICKED_UP"`, `"DROPPED_OFF"` or `"NOT_PRESENT"` | the driver's confirmation; `NOT_PRESENT` is "not at their stop" |
| `studentId` | uuid | |
| `studentName` | string | `firstName + " " + lastName` when it happened |
| `runId` | uuid | |
| `direction` | `"MORNING"` or `"AFTERNOON"` | the run's direction |
| `createdAt` | moment | the confirmation's time, from the server |
| `readAt` | moment or null | null while unread, set once |

The screen writes its own wording from `type`, `studentName` and `direction`; the server sends no message text.

### UnreadCount

`{ "count": number }`

## Endpoints

| Method | Path | Role | Success |
|---|---|---|---|
| GET | `/api/parent/inbox?unread=` | PARENT | 200 `InboxEvent[]`, newest first, at most 50 |
| GET | `/api/parent/inbox/unread-count` | PARENT | 200 `UnreadCount` |
| POST | `/api/parent/inbox/{id}/read` | PARENT | 200 `InboxEvent` |
| POST | `/api/parent/inbox/read-all` | PARENT | 204 |

## Rules

### When an entry is made

- One entry for each of the three confirmations, for the parent linked to the child **when the confirmation is saved**. A child with no linked parent makes none.
- An entry is made once per run, child and type. A driver's retry or a replay of a confirmation the child already has makes no second one. A wrong tap that the driver then moves on (`NOT_PRESENT`, then `PICKED_UP`) makes an entry for each, because both were true when saved.
- The entry is saved in the same transaction as the confirmation: both exist or neither does.
- An absence the parent reports is not an entry.

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

## Known limits

- **No history beyond 50.** There is no paging and no clean-up of old entries yet.
- **No push, email or preferences.** This is the stored inbox only; choosing which entries a parent gets and late alerts are SCRUM-268.
- **Entries before this release do not exist.** Confirmations saved earlier have no entry.

## Changing this contract

Change it by pull request to this file and the samples together, and tag Moustafa and the owners of the screen (S4-20) and SCRUM-268.
