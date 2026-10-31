# Runs contract

The agreement between the people building the daily runs, confirmations, absences and the parent view, and the screens that show them (SCRUM-232). Build against this, not against each other's code. One school.

The JSON examples live in [`samples/runs/`](samples/runs). They are the source of truth for field names and types; this page explains what the fields mean and what the endpoints do. They reuse the routes, vehicles, drivers and students of [`samples/routing/`](samples/routing) (Achrafieh's vehicle has 14 seats here, not the 3 of the routing "infeasible" example).

| File | Shape | What it shows | Used by |
|---|---|---|---|
| [`driver-today.json`](samples/runs/driver-today.json) | `DriverDay` | Karim's Wednesday: the Hamra morning run in progress (a pickup, a not present, an absent student to skip, the next stop) and the afternoon run not started | driver Today screen |
| [`driver-today-holiday.json`](samples/runs/driver-today-holiday.json) | `DriverDay` | A holiday: no runs | driver Today screen |
| [`run-finished.json`](samples/runs/run-finished.json) | `Run` | Walid's Verdun run, finished. This is also the answer to start, end and confirm. A stop with no pin | driver screen, maps button |
| [`hot-runs.json`](samples/runs/hot-runs.json) | `RunsDay` | A half-day: six runs in all three states | head of transportation Today screen |
| [`hot-absences.json`](samples/runs/hot-absences.json) | `AbsentStudent[]` | Two students absent on that day, one with no route | head of transportation Today screen |
| [`parent-children.json`](samples/runs/parent-children.json) | `Child[]` | A child with a route and one with none. The child with a route is absent on a morning run that is in progress, so `todayRun.stopsLeft` is null (SCRUM-237) | parent home |
| [`absences.json`](samples/runs/absences.json) | `Absence[]` | One child's upcoming absences: a range and a single day | parent absence screens |

## Conventions

- Paths and roles are in the [endpoint table](#endpoints). Each endpoint needs the signed-in user (cookie session, `credentials: "include"`) with exactly that role. The admin has none of these.
- The school always comes from the session. It is never sent and never appears as `schoolId`.
- Ids are UUIDs. **Dates** are `"YYYY-MM-DD"` and **times of day** are `"HH:mm"`, both **school-local**, no zone. **Moments** (`startedAt`, `endedAt`, `confirmation.at`) are ISO-8601 in UTC with a `Z`, like `createdAt` elsewhere.
- **"Today" is the calendar date in `Asia/Beirut`**, decided by the server. Clients never send "today"; only the head of transportation may ask for another date.
- Field names are camelCase and match the routing contract. A run's `vehicle` and `driver` are the `RouteSummary` shapes (`{ id, plateNumber, capacity }` and `{ id, firstName, lastName }`); the parent's `Child` has its own smaller ones (see [Child](#child-the-parents-view)).
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).

## Shapes

### Run

One route, one direction, one date.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `date` | `"YYYY-MM-DD"` | |
| `direction` | `MORNING` or `AFTERNOON` | |
| `state` | `NOT_STARTED`, `IN_PROGRESS` or `FINISHED` | see [Run states](#run-states) |
| `schoolTime` | `"HH:mm"` or null | the school's arrival time for a morning run, its dismissal time for an afternoon run. **Null** when the school has not set it, and **null for an afternoon run on a half-day** (there is no half-day dismissal time, and a wrong time is worse than none) |
| `startedAt`, `endedAt` | moment or null | null until the run starts / ends |
| `route` | `{ id, name }` | the route's name, the same for both directions (often "… morning run"), so screens label a run by `direction` |
| `vehicle`, `driver` | as in `RouteSummary` | the route's, read each time, never stored: a past run shows the route's current vehicle and driver |
| `counts` | `Counts` | |
| `stops` | `RunStop[]` | in `position` order. Only in the driver's responses; a `RunSummary` is a `Run` without `stops` |

### RunStop

One student on one run. **A stop is a student**, as in the routing contract: two siblings at one address are two stops. It is the routing `Stop` (`studentId`, `position`, `firstName`, `lastName`, `address`, `latitude`, `longitude`, `arrivalTime`) plus:

| Field | Type | Notes |
|---|---|---|
| `guardianName`, `guardianPhone` | string | for the "Call parent" button |
| `absent` | boolean | a parent reported this student absent for the run's date and has not cancelled it |
| `confirmation` | `{ status, at }` or null | the student's latest confirmation, null when there is none yet. `status` is `PICKED_UP`, `DROPPED_OFF` or `NOT_PRESENT` |
| `removedFromRoute` | boolean | `true` for a student who has a confirmation on this run and is no longer on the route. They stay on the run, **after the route's current stops** (numbered on, no duplicates by `studentId`), so a child who was picked up never disappears from the bus they are on. `false` for every other stop. See [Moving a student or changing the driver](#moving-a-student-or-changing-the-driver-during-a-run) |

`arrivalTime` is the morning estimate of the routing contract. On an **afternoon run it is always null**, and the stops are the morning order **reversed**, with `position` numbered `1..n` again (the first stop is the last pickup of the morning).

### Counts

| Field | Meaning |
|---|---|
| `students` | stops on the run, **absent ones included** |
| `absent` | stops with `absent: true` and no `confirmation` (the same as skippable). A child reported absent who is confirmed counts under that status instead; the stop keeps `absent: true` |
| `pickedUp` | students whose latest status is `PICKED_UP` **or** `DROPPED_OFF` (someone dropped off was picked up). "Picked up out of total" is `pickedUp` of `students` |
| `droppedOff` | latest status `DROPPED_OFF` |
| `notPresent` | latest status `NOT_PRESENT` |

`absent`, `pickedUp`, `notPresent` and the students still waiting add up to `students`. Counts are computed on every response, never stored. Children on the bus at any moment are `pickedUp - droppedOff`.

Progress, as the screens show it: on a morning run `pickedUp` of `students - absent`; on an afternoon run `droppedOff` of `students - absent`, because everyone is `PICKED_UP` at the gate and `pickedUp` says nothing about progress.

### DriverDay and RunsDay

Both are `{ date, dayType, runs }`.

| Field | Type | Notes |
|---|---|---|
| `date` | `"YYYY-MM-DD"` | the date the answer is for |
| `dayType` | `SCHOOL_DAY`, `HALF_DAY` or `HOLIDAY` | a holiday is a **200** with `HOLIDAY` and `runs: []`, not an error. **Saturday and Sunday are `HOLIDAY` too**, whether or not they are in the holiday calendar |
| `runs` | `Run[]` in a `DriverDay`, `RunSummary[]` in a `RunsDay` | grouped by route, routes in the order of `GET /routes` (oldest first), each route's morning run before its afternoon run. **Empty** on a holiday, for a driver with no route, and for a date with no runs yet |

The driver's Today screen tells "holiday" from "no run today" by `dayType`: `HOLIDAY` means the school is closed; `SCHOOL_DAY` or `HALF_DAY` with no runs means this driver has no route. For the head of transportation on another date, empty runs on a school day only mean none were made that day.

The driver's **current run** is the first in `runs` that is not `FINISHED`; when all are, the day is over.

### Child (the parent's view)

| Field | Type | Notes |
|---|---|---|
| `studentId` | uuid | the id the absence paths use |
| `firstName`, `lastName` | string | |
| `route` | `{ id, name }` or null | **null means "no route yet"**; then `driver`, `vehicle` and `expectedPickupTime` are null too. When `route` is set, `driver` and `vehicle` are set (a route always has both) |
| `driver` | `{ id, firstName, lastName, phone }` or null | the phone is for the "Call driver" button |
| `vehicle` | `{ id, plateNumber }` or null | |
| `expectedPickupTime` | `"HH:mm"` or null | this child's `arrivalTime` from the routing contract (morning), and null exactly when that is null (no pin, no school arrival time, or a route that would start before 06:00). It is the planned time, not a live estimate |
| `todayRun` | `{ direction, state, stopsLeft }` or null | today's run for this child, see [Today's run for a child](#todays-run-for-a-child-the-parents-view). Null when the child has no route, and on a holiday or weekend |

Every child linked to the signed-in parent, and no one else's, ordered by first name. A parent with no children gets `[]`.

### Absence

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `studentId` | uuid | |
| `fromDate`, `toDate` | `"YYYY-MM-DD"` | inclusive. A single day has both equal |

### AbsentStudent (head of transportation)

An absence seen from the school's side, for the date asked: `absenceId`, `studentId`, `firstName`, `lastName`, `fromDate`, `toDate`, `route` (`{ id, name }` or null) and `position` (the stop's place on the route, or null). A student with no route is listed with both null.

## Endpoints

| Method | Path | Role | Body | Success | Owner |
|---|---|---|---|---|---|
| GET | `/api/driver/runs/today` | DRIVER | | 200 `DriverDay` | Hashem, SCRUM-233 (absent flags: Moustafa, SCRUM-239) |
| POST | `/api/driver/runs/{runId}/start` | DRIVER | none | 200 `Run` | Hashem, SCRUM-234 |
| POST | `/api/driver/runs/{runId}/end` | DRIVER | none | 200 `Run` | Hashem, SCRUM-234 |
| PUT | `/api/driver/runs/{runId}/students/{studentId}/confirmation` | DRIVER | `{ status }` | 200 `Run` | Hashem, SCRUM-235 |
| GET | `/api/parent/children` | PARENT | | 200 `Child[]` | Moustafa, SCRUM-240 (`todayRun`: Hashem, SCRUM-237) |
| GET | `/api/parent/children/{studentId}/absences` | PARENT | | 200 `Absence[]`, upcoming only | Moustafa, SCRUM-238 |
| POST | `/api/parent/children/{studentId}/absences` | PARENT | `{ fromDate, toDate? }` | 201 `Absence`; 200 with the existing one on an exact repeat | Moustafa, SCRUM-238 |
| DELETE | `/api/parent/children/{studentId}/absences/{absenceId}` | PARENT | | 204 | Moustafa, SCRUM-238 |
| GET | `/api/head-of-transport/runs?date=` | HEAD_OF_TRANSPORT | | 200 `RunsDay` for `date` (today when omitted) | Hashem, SCRUM-233 (counts: SCRUM-235) |
| GET | `/api/head-of-transport/absences?date=` | HEAD_OF_TRANSPORT | | 200 `AbsentStudent[]` for `date` (today when omitted) | Moustafa, SCRUM-238 / SCRUM-239 |

The head of transportation's absence list is one endpoint for SCRUM-238 and SCRUM-239. Start, end and confirm return the whole `Run`, so the driver screen redraws from one response. There is no endpoint that lists past runs of a driver, or one run by id, until a screen needs it.

## Rules

### Creating runs

- Every route gets **one morning and one afternoon run** per date, except on a holiday or a weekend. A run is identified by route, date and direction; the same one is never created twice, however many people ask at once.
- Runs are created when **today's** runs are asked for, by the driver or by the head of transportation. Asking for any other date only reads runs that already exist, so a past date shows what happened and a future date shows no runs. Nothing else creates a run.
- The stops are the route's stops in the routing contract, in its **current** order, read each time, plus any student who has a confirmation on this run and has left the route (`removedFromRoute: true`, last). A student the head of transportation adds, removes or moves during the day changes the run at once, except one who is on the bus: see [Moving a student or changing the driver](#moving-a-student-or-changing-the-driver-during-a-run).
- Stop order, arrival times and guardians come from **one read** of the route's students, so they cannot disagree with each other when the route is reordered while a request is being answered.
- A route deleted during the day takes its runs with it: they are no longer listed, for that day or any other (see [Known limits](#known-limits)).
- The kind of day is decided when the runs are asked for, not when they were made. A holiday added for a date that already has runs, even a past date, hides them: a holiday always answers `runs: []`. Removing the holiday shows the same runs again, unchanged.
- **Morning:** the order and `arrivalTime`s of the routing contract. **Afternoon:** the same students reversed, no times (see [Known limits](#known-limits)).

### Run states

`NOT_STARTED` → `IN_PROGRESS` → `FINISHED`, and nothing else.

- **Start** moves `NOT_STARTED` to `IN_PROGRESS` and saves `startedAt`. Starting a run that is already `IN_PROGRESS` changes nothing and answers 200 (a retry after a bad connection is harmless). Starting a `FINISHED` run is **409**.
- **End** moves `IN_PROGRESS` to `FINISHED` and saves `endedAt`. Ending a `FINISHED` run changes nothing and answers 200. Ending a run that has **not started** is **409**.
- Ending is allowed while students are still on the bus (picked up, not dropped off). The screens should warn using `counts`; the server does not refuse.
- The morning and afternoon runs are independent: either can start first.
- The driver only ever gets today's runs, and can start or end only those: a run that is not in their list right now (another date, or a day made a holiday after the run was created) is **404**, like an unknown run. A run left `IN_PROGRESS` overnight stays that way and shows so to the head of transportation; a screen still holding yesterday's run after midnight gets 404, even for a repeated end, and should reload today's runs.

### Moving a student or changing the driver during a run

Only **today's** runs count here: a run left `IN_PROGRESS` on an earlier date never blocks anything.

- **A student who is on a bus stays on their route until the run ends.** When the head of transportation moves a student to another route or removes them from their route, and that student has a confirmation on one of today's `IN_PROGRESS` runs, the server answers **409** and changes nothing, for example *"Sara is on the Hamra bus (picked up 07:12). Move them after the run ends."* The text names the child by first name, the route, and the latest status in words (*picked up*, *dropped off*, *marked not present*) with the time of day in the school's zone. Once the run ends the move is allowed, and applies from the next run. Re-adding a student to the route they are already on is not a move.
- **Backup for a race.** If the head clicks "move" in the same instant the driver ticks "picked up", both checks can pass. So a student with a confirmation on the run always stays on it, last, with `removedFromRoute: true`, and still counts in `students` and `pickedUp`.
- **A route's driver or vehicle cannot change while one of its runs is `IN_PROGRESS` today.** The edit answers **409**, for example *"Route "Hamra morning run" has its morning run in progress. Change the driver or vehicle after it ends."* A rename, which changes neither, is allowed.
- Not covered: deleting a route, and applying generated routes (`/routes/generation`), still change rosters mid-run (see [Known limits](#known-limits)).

### Confirmations

`PUT .../confirmation { status }` sets a student's status on a run. It is allowed **only while the run is `IN_PROGRESS`**.

| From | To | Result |
|---|---|---|
| none | `PICKED_UP`, `NOT_PRESENT` | recorded with the server's time |
| `NOT_PRESENT` | `PICKED_UP` | allowed (the child came late) |
| `PICKED_UP` | `DROPPED_OFF` | allowed |
| the same status again | | 200, nothing changes, the first time is kept |
| anything else | | **409**: `DROPPED_OFF` without `PICKED_UP`, a different status after `DROPPED_OFF`, `NOT_PRESENT` after `PICKED_UP` |

- The time is the server's, never the client's. There is **no undo**.
- An absent student can still be confirmed. A parent's absence does not stop the driver, and a confirmation always wins over `absent` in what the screens show.
- A student who is not a stop on that run is **404**.
- Each status is recorded once per student and run, so a retry cannot create a second record. A status the student already has is answered 200 with nothing changed **even when a later status exists**: a retry of *picked up* that arrives after *dropped off* is not an error, and the stop keeps showing the later status.
- A student's **latest** confirmation is the highest status they have (`NOT_PRESENT` < `PICKED_UP` < `DROPPED_OFF`), not the newest record.
- Checks run in this order: the run is one of the driver's today (404), the student is a stop of the run or already confirmed on it (404), the run is `IN_PROGRESS` (409), then the table (409).
- A confirmation and a move or end of the same run never interleave: the server serialises them per run.

### What the driver screen works out for itself

So that the screens and their tests agree, these are defined here and not sent by the server:

- A stop is **skippable** when it is `absent` and has no `confirmation`. This is SCRUM-239's "marked as skippable": the server sends `absent`, the screen does the rest.
- A stop is **done** on a **morning** run when it has any `confirmation`, and on an **afternoon** run when its status is `DROPPED_OFF` or `NOT_PRESENT` (everyone is `PICKED_UP` at the school gate, so that is not done yet).
- The **next stop** is the first stop in `position` order that is not done and not skippable.

### Absences

- An absence is whole **days**, for one child, and covers the morning and the afternoon run. `toDate` is optional and defaults to `fromDate`.
- `fromDate` must be **today or later**, and `toDate` must not be before `fromDate` (400). Date pickers may grey out past days using today in `Asia/Beirut`; the server still decides.
- Any of the parent's children can be reported absent, with or without a route.
- Reporting exactly the same `fromDate` and `toDate` (after `toDate` defaults to `fromDate`) as an absence **this child** already has returns that absence with **200** and changes nothing, so a POST retried after a lost answer is harmless, like start, end and confirm.
- Any other **overlap** with an absence the child already has is **rejected** (409), not merged. Absences that only touch (one ends 10 Nov, the next starts 11 Nov) are fine. A cancelled absence is gone and overlaps nothing.
- The list returns absences whose `toDate` is today or later, ordered by `fromDate`.
- **Cancel** deletes an absence whose `fromDate` is **today or later**. One that started **before today** is cut to end **yesterday**, so the days gone by stay recorded. Cancelling one that ended before today is 409.
- An absence is read each time a run is fetched: one reported or cancelled after a run started shows on its next fetch, and never changes a confirmation already made.
- A child that is not the signed-in parent's, an unknown child, and an absence that is not that child's all answer **404**.

### Parent view

- `expectedPickupTime` follows the routing contract's arrival-time rule; the parent endpoint does not redo it.
- `todayRun` is the parent's run status and "stops left before my child" (SCRUM-237), defined below. Like the driver's and the head's views it is read on every request, and asking for it never creates a run.

#### Today's run for a child (the parent's view)

`todayRun` is `{ direction, state, stopsLeft }`:

| Field | Type | Notes |
|---|---|---|
| `direction` | `MORNING` or `AFTERNOON` | which of today's two runs this is, so a screen can say so |
| `state` | `NOT_STARTED`, `IN_PROGRESS` or `FINISHED` | that run's state, as in [Run states](#run-states) |
| `stopsLeft` | integer or null | how many stops the bus still has before this child's stop. **`0` means the child is next; null means no count applies.** A screen must not treat 0 as "no value" |

**Which run.** A route has a morning and an afternoon run, and either can start first. A direction with no run yet (the driver has not opened today's runs) counts as `NOT_STARTED`, so a parent is not shown "nothing" before the driver's day starts. The run shown is, in this order: one that is `IN_PROGRESS` (the morning run if both are), else the first `NOT_STARTED` (morning before afternoon), else the afternoon run, `FINISHED`. So after the morning run ends the parent sees the afternoon run as `NOT_STARTED` until it starts.

**When `todayRun` is null.** The child has no route, or today is a holiday (including Saturday and Sunday). Nothing else makes it null: a school day with a route always has a run to show.

**When `stopsLeft` is null.** Unless all of these hold: the shown run is `IN_PROGRESS`, the child is not absent without a confirmation (the bus skips them), and the child is not done on that run. Done is the driver screen's definition, [below](#what-the-driver-screen-works-out-for-itself): on a morning run any confirmation, on an afternoon run `DROPPED_OFF` or `NOT_PRESENT`. So a child already picked up (morning) or dropped off (afternoon) has no count.

**How it is counted.** The stops of the run before this child's `position`, in the run's order (the route's order for the morning, reversed for the afternoon), that are neither done nor skippable, using the same definitions. Stops are counted by what is still to do, not by position alone: a stop already picked up out of order does not count, and an absent child's stop does not count unless the driver has confirmed them (then it is done or still to do like any confirmed stop). A student confirmed on the run who has left the route (`removedFromRoute`) is after the route's stops and so never counts. It is live: a student removed from the route before any confirmation drops out of the count at once, and a reorder by the head of transportation can make it go up. It follows the confirmations, not the bus's position.

The same data counts under the same date and the same holiday rule as the driver's run, the date in `Asia/Beirut`. Example from [`driver-today.json`](samples/runs/driver-today.json): Tarek is stop 3 on the Hamra morning run, which is in progress; stops 1 and 2 are done, so he would have `stopsLeft: 0`, but he is absent, so it is null (as in [`parent-children.json`](samples/runs/parent-children.json)).

## Errors

The same `ProblemDetail` the other modules return, so `request()` in `frontend/src/lib/api/client.ts` reads them as before: a body with an `errors` map throws `ApiValidationError`, anything else throws `ApiError(status, detail)`.

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` ("Access denied") |
| A run that is another driver's, another school's, unknown, or not one of the driver's runs today (another date, or hidden by a holiday) | 404 | `detail` |
| A student who is not a stop on that run | 404 | `detail` |
| A child that is not yours, or unknown | 404 | `detail` |
| An absence that is gone, or not that child's | 404 | `detail` |
| Start a `FINISHED` run, or end a run that has not started | 409 | `detail`, including the run's state |
| Move a student off their route (add to another route, or remove) while they are on a bus | 409 | `detail`, naming the child, the route and the pickup time. On `POST` and `DELETE` `/head-of-transport/routes/{id}/students` |
| Change a route's driver or vehicle while one of its runs is in progress | 409 | `detail`, naming the route and the run. On `PUT /head-of-transport/routes/{id}` |
| Confirm while the run is not `IN_PROGRESS` | 409 | `detail`, including the run's state |
| A confirmation move the table above refuses | 409 | `detail`, including the current status |
| Report an absence that overlaps another (not an exact repeat) | 409 | `errors: { fromDate: message }`, naming the absence it overlaps |
| Cancel an absence that ended before today | 409 | `detail` |
| Absence `fromDate` in the past, or `toDate` before `fromDate` | 400 | `errors: { fromDate: message }` or `{ toDate: message }` |
| Missing `status` or `fromDate` | 400 | `errors: { status: message }` or `{ fromDate: message }` |
| An unknown `status`, a date that is not `"YYYY-MM-DD"`, a body that is not JSON | 400 | `detail: "Malformed request body"` |
| An id in the path, or the `date` parameter, that does not parse | 400 | `detail: "Invalid request parameter"` |

## Known limits

- **The school week is fixed.** The school runs Monday to Friday; Saturday and Sunday (by the date in `Asia/Beirut`) are `HOLIDAY` with no runs, and no one enters them in the calendar. The week is not a school setting; a different school week would be a new setting.
- **No half-day times.** A half-day has no dismissal time of its own, so a half-day afternoon run has `schoolTime: null`. Adding one later is a new nullable field. Half-days are **planned only** in Sprint 3: a same-day early dismissal is not supported (no time, no notice, and a half-day cannot be removed). A dismissal time and a delete are a separate ticket.
- **Afternoon has no schedule.** There are no afternoon stop times and no "expected pickup" for it; the afternoon is the morning's students in reverse order. The parent's `stopsLeft` on an afternoon run counts drop-offs still to do before the child's, in that order; it is not a time.
- **A live roster.** A student the head moves off a route before their run starts, or after it is over, leaves that day's run (before it starts: at once; after it ends: from the next run). A student on a bus cannot be moved, and one who still gets moved by a race stays on the run as `removedFromRoute`. A route deleted mid-day takes its runs with it (they are no longer listed), and applying generated routes mid-day rewrites rosters without these checks. A driver or vehicle swapped when no run is in progress shows on the day's runs, past runs included. A signed-in driver not linked to a driver record is a driver with no route.
- **No undo.** A wrong confirmation can only be moved on the way the table allows; it cannot be taken back.
- **Whole days only.** An absence cannot be for the morning run alone, or start part-way through a day.
- **The planned time only.** `expectedPickupTime` does not follow the bus. A late bus is visible through the run's state and the stops-left count.
- **A run nobody has opened reads as not started.** The parent's `todayRun` shows a direction with no run yet as `NOT_STARTED`. If a driver never opens the afternoon runs, the parent keeps seeing the afternoon run as not started.
- **A run started and never ended** stays `IN_PROGRESS` for its date.

## Interfaces (backend)

Reach other modules through their **services** only (`backend/CLAUDE.md`). What the new code needs and does not have yet, so each owner adds it to the owning module in their own PR:

- `routes` declares `ActiveRunGuard` (is a student on a bus, is a route's run in progress) and calls it before moving a student or changing a driver or vehicle; `runs` implements it. Routes never imports runs, and the implementation is its own class, not `RunService`, so the two do not need each other's beans.
- `runs` (Hashem): the run and confirmation tables, `RunService`. Reads `RouteService.findRouteOfDriver` and `listRoutes` (the driver's route with its stops and arrival times; every route), `DriverService.findDriverIdForUser` (the driver of a signed-in user), `StudentService` (a confirmed student who has left the route), `SchoolSettingsService.getTimes` (`schoolTime`), `HolidayService.isHoliday` / `HalfDayService.isHalfDay` (the day's type) and, from SCRUM-239, `AbsenceService`.
- `absences` (Moustafa): the absence table, `AbsenceService`. Reads `StudentService` (which children a parent has, as a lookup it does not have yet) and, for the head of transportation's list, `RouteService` (a student's route and position, as a lookup it does not have yet). Never reads `runs`.
- The new 404 and 409 exceptions need entries in the shared `GlobalExceptionHandler` (otherwise they answer 500). Hashem and Moustafa both edit it, so the second to merge rebases onto the first.
- The parent view is **its own module** (called `parent`), because it reads `runs` (SCRUM-237, `RunService.todayRunStatus`: one call for all of a parent's children, with no road-provider call) and `runs` already reads `routes`; it would be a cycle inside `routes` or `students`. Nothing depends on it.
- "Today" comes from one `Clock` bean and one zone constant (`Asia/Beirut`), so tests can fix the date and a server running in UTC is right after midnight in Beirut.
- Flyway: each story takes the **next free** `V<n>` when it merges and never merges a number lower than one already on `develop`. Say so at stand-up when two are open at once.

## Changing this contract

Change it by pull request to this file and the samples together, and tag the owners in the table above (Hashem, Moustafa, Majd, Wassim, Mohamad). The samples and this page must always agree. When a real endpoint replaces a sample, the screen deletes its sample client.
