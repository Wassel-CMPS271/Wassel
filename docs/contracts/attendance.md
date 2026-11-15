# Attendance contract

The agreement between the people building the attendance history and pickup/drop-off audit API (SCRUM-265) and the screens that show it: the parent's attendance history (SCRUM-281) and the head of transportation's attendance and audit screens (SCRUM-277). Build against this, not against each other's code. One school. It reads what the drivers recorded in [`runs.md`](runs.md) (SCRUM-235 confirmations); nothing here writes.

The JSON examples live in [`samples/attendance/`](samples/attendance). They are the source of truth for field names and types; this page explains what the fields mean and what the endpoints do. They reuse the routes, runs and students of [`samples/runs/`](samples/runs).

| File | Shape | What it shows | Used by |
|---|---|---|---|
| [`parent-attendance.json`](samples/attendance/parent-attendance.json) | `ChildAttendance[]` | Tarek over two days: a dropped-off afternoon and a morning corrected from not present to picked up on the 4th, a not-present morning on the 3rd | parent history |
| [`parent-attendance-empty.json`](samples/attendance/parent-attendance-empty.json) | `ChildAttendance[]` | A valid range with nothing recorded | parent history |
| [`hot-attendance.json`](samples/attendance/hot-attendance.json) | `AttendancePage` | One day, one row per child per run | head of transportation attendance screen |
| [`hot-attendance-deleted-route.json`](samples/attendance/hot-attendance-deleted-route.json) | `AttendancePage` | A run of a route that was deleted: `route.name` is null | head of transportation attendance screen |
| [`hot-attendance-audit.json`](samples/attendance/hot-attendance-audit.json) | `AuditPage` | The three newest of seven recorded taps that day | head of transportation audit screen |
| [`invalid-range.json`](samples/attendance/invalid-range.json) | `ProblemDetail` | A range longer than 62 days | both |

## Conventions

- Each endpoint needs the signed-in user (cookie session, `credentials: "include"`) with exactly the role in the [endpoint table](#endpoints). The admin has none of these: attendance belongs to the head of transportation, like every other operational read.
- The school always comes from the session. It is never sent and never appears as `schoolId`.
- Ids are UUIDs. **Dates** are `"YYYY-MM-DD"`, school-local (`Asia/Beirut`), no zone. **Moments** are ISO-8601 in UTC with a `Z`.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).

## Endpoints

| Method | Path | Role | Query | Returns |
|---|---|---|---|---|
| GET | `/api/parent/children/{studentId}/attendance` | `PARENT` | `from`, `to` (required) | `ChildAttendance[]` |
| GET | `/api/head-of-transport/attendance` | `HEAD_OF_TRANSPORT` | `from`, `to` (required); `studentId`, `routeId`, `page`, `size` (optional) | `AttendancePage` |
| GET | `/api/head-of-transport/attendance/audit` | `HEAD_OF_TRANSPORT` | the same | `AuditPage` |

## Shapes

### ChildAttendance (the parent's view)

One run the child has a recorded status on. Minimal on purpose: no run id, route, vehicle, driver or other children.

| Field | Type | Notes |
|---|---|---|
| `date` | date | the run's date |
| `direction` | `MORNING` or `AFTERNOON` | |
| `status` | `NOT_PRESENT`, `PICKED_UP` or `DROPPED_OFF` | the latest status recorded: the highest of the three, in that order |
| `notPresentAt` | moment or null | when the server recorded "not present"; null if never |
| `pickedUpAt` | moment or null | as above |
| `droppedOffAt` | moment or null | as above |

A not present later corrected to picked up shows `status: PICKED_UP` with both `notPresentAt` and `pickedUpAt`.

### AttendanceRow (head of transportation)

A `ChildAttendance` plus:

| Field | Type | Notes |
|---|---|---|
| `runId` | uuid | |
| `route` | `{ id, name }` | `name` is null when the route has been deleted |
| `student` | `{ id, firstName, lastName }` | |

### AuditEntry (head of transportation)

One recorded confirmation. Never changed, so a correction shows as two entries.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `at` | moment | when the server recorded it |
| `status` | `NOT_PRESENT`, `PICKED_UP` or `DROPPED_OFF` | |
| `runId`, `date`, `direction`, `route`, `student` | as in `AttendanceRow` | |

### AttendancePage and AuditPage

`{ from, to, page, size, total, items }`. `total` is the number of rows (or entries) matching the query across all pages. Past the last page, `items` is `[]` and `total` is unchanged.

## Rules

- **Range.** `from` and `to` are both required, both inclusive, and filter on the run's date (never on the moment it was recorded: a tap at 00:30 for a run dated the day before stays on that day). A range may cover at most 62 days counting both ends, and `to` may not be before `from`. Future dates are allowed and give an empty answer.
- **What is recorded.** The statuses the driver gave (SCRUM-235). Each status is recorded at most once per child per run and never changed or deleted, so the audit is complete for what was recorded. Refused taps and retries are not recorded. A run with no row for a child means nothing was recorded; reported absences are not here (see `runs.md`).
- **Times are when the server recorded the tap.** For a tap replayed later from an offline phone (SCRUM-263) that is the sync time. Nothing here is the phone's clock.
- **Order.** Attendance rows: `date` newest first, `AFTERNOON` before `MORNING`, then route id ascending, then student id ascending. Audit entries: `at` newest first, then higher status first, then id descending. The parent's list: `date` newest first, `AFTERNOON` before `MORNING`.
- **Paging (head of transportation).** `page` is 0-based, default 0. `size` is 1 to 200, default 50.
- **Filters (head of transportation).** `studentId` and `routeId`, both optional, combinable. An id that is unknown or another school's is a 404, never an empty list.
- **Parent.** Only the signed-in parent's linked children, by the link as it is now: a child unlinked from a parent is a 404 for that parent, and a newly linked parent sees the child's earlier history.
- **Route names are the current ones.** `route.name` is the route's name now, not when the tap was recorded: a renamed route shows its new name on old rows.
- **Deleted routes.** Runs of a deleted route are still listed, with `route.id` kept and `route.name` null. A deleted route's id cannot be used as `routeId` (404).
- **One value per parameter.** A parameter given twice (`?from=a&from=b`) is a 400 against that parameter, never a silent pick of one.
- **One snapshot per page.** A page and its `total` are read together, so a tap recorded in between cannot make `total` differ from the rows the pages add up to.
- **Empty is not failed.** A valid range with nothing recorded is a 200 with `[]` (parent) or `items: []` and `total: 0`. Every failure is an error body, never an empty list.

## Errors

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` ("Access denied"). Query parameters are checked before the role, so a caller with the wrong role who also omits or garbles `from`/`to` gets the 400 below; it reveals nothing and a client that sends valid parameters sees the 403 |
| `from` or `to` missing | 400 | `detail: "Validation failed"`, `errors: { from: "from is required" }` (or `to`) |
| A date, `page`, `size` or id that does not parse | 400 | `detail: "Invalid request parameter"` |
| `to` before `from`; more than 62 days | 400 | `errors: { to: message }` |
| `page` below 0; `size` outside 1 to 200 | 400 | `errors: { page: message }` or `{ size: message }` |
| A parameter given more than once | 400 | `errors: { name: "name must be given once" }` |
| Parent: a child that is not theirs, unknown, in another school, or unlinked | 404 | `detail: "Child not found."` |
| Head: an unknown or another school's `studentId` or `routeId` | 404 | `detail` |
| A confirmation whose student no longer exists (a data fault, not a client mistake; there is no way to delete a student today, so only a manual edit of the database causes it) | 500 | `detail: "An unexpected error occurred"`; the run and student ids are in the server log |

## Known limits

- No driver is shown: the driver who recorded a tap is not stored.
- No client-side time (the phone's clock) is shown.
- No CSV of rows yet. Any CSV the head of transportation has today comes from the transport totals report (SCRUM-271), which is separate. A rows export is a follow-up.
- A deleted route's id cannot be used as a filter.

## Interfaces (backend)

Module `attendance`, read-only. It reads `runs` (through `RunService`), `students` and `routes` only through their services. It has its own `AttendanceStatus` and `AttendanceDirection` enums, mapped by name from the ones `runs` stores, so it imports no `runs` entity.

## Changing this contract

Change this page and the samples in the same pull request, and tell the owners of SCRUM-277 (Majd) and SCRUM-281 (Wassim) and the contract owner (Mohamad).
