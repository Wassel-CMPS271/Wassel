# Roster contract: pause, archive and best route (SCRUM-270)

Three things the head of transportation does to a student that touch the routes: pause their transport, archive them, and find the best route for them. Build against this page, not against each other's code. One school.

Owner: Moustafa (SCRUM-270). Consumer: the head of transportation's archive/pause and route-insertion screen (SCRUM-287).

## Conventions

- Cookie session, `credentials: "include"`, like every other endpoint. Every endpoint is for a signed-in **head of transportation**; the school comes from the session, never from the request. A student of another school, and an id nobody has, are the same 404.
- Ids are UUIDs. Field names are camelCase. A pickup time is a school-local `"HH:mm"`.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).
- Samples are in [`samples/roster/`](samples/roster).

## Statuses

A student has one of three statuses, shown in lower case in `Student.status` and accepted in the roster's `status` filter:

| Status | Meaning | On a route? |
|---|---|---|
| `active` | takes the transport | may be |
| `paused` | the transport is paused: still on the roster, comes back with `active` | never |
| `inactive` | **archived**: they have left; only a restore brings them back | never |

`inactive` keeps its name so nothing that already reads it changes; the screen may call it "Archived". Only an `active` student can be put on a route, and every endpoint that already asks for an active student (adding to a route, approving an address request) treats `paused` and `inactive` alike.

## Endpoints

| Method | Path | Role | Body | Success |
|---|---|---|---|---|
| PUT | `/api/head-of-transport/students/{id}/status` | HEAD_OF_TRANSPORT | `{ status }` | 200 `Student` (the roster's shape, [sample](samples/roster/student-paused.json)) |
| GET | `/api/head-of-transport/students/{id}/best-route` | HEAD_OF_TRANSPORT | | 200 `BestRoute` |
| POST | `/api/head-of-transport/students/{id}/best-route` | HEAD_OF_TRANSPORT | | 201 `BestRoutePlacement` |

## Changing a student's status

`PUT .../status { "status": "active" | "paused" | "inactive" }`, in any letter case.

| From \ to | `active` | `paused` | `inactive` |
|---|---|---|---|
| `active` | nothing changes | yes | yes |
| `paused` | yes | nothing changes | yes |
| `inactive` | yes (a restore) | **409** | nothing changes |

- **Asking for the status they already have is 200 and changes nothing**, so a retry after a lost answer is harmless.
- **Pausing or archiving takes the student off their route**, in the same step as the new status: both happen or neither. The route's seat is free at once and the other stops keep their order. Going back to `active` puts them on **no route**: place them again with the best-route insertion or by hand.
- **A student who is on a bus today stays until the run ends** (409): one with a confirmation on a run in progress, as for taking a stop off a route. A student of a run in progress with no confirmation yet can be paused or archived.
- **The past is kept.** Runs, confirmations, the attendance history and the audit hold the student's id and are not touched: a paused or archived student's earlier rows still list, with their name, and a finished run still shows them as having left the route.
- A refused change (409) never takes anyone off a route. Archiving a student who is already `inactive` but is still a stop (data from before these rules) is allowed and takes the stop off.
- A body that is not one of the three words, or missing, is 400 with `errors.status`.

## Best route for a student

`GET .../best-route` ranks the routes without changing anything. `POST .../best-route` puts the student on the best one at the best place.

### BestRoute

| Field | Type | Notes |
|---|---|---|
| `studentId` | uuid | |
| `recommended` | `RouteOption` or null | the first option; null when no route can take the student |
| `options` | `RouteOption[]` | the routes that can, best first |
| `skipped` | `{ routeId, routeName, reason }[]` | every other route of the school, with `FULL` or `STARTS_TOO_EARLY` |

[Samples](samples/roster/best-route.json): `best-route.json`, `best-route-none.json`. Every route of the school is in `options` or in `skipped`, never both and never neither.

### RouteOption

| Field | Type | Notes |
|---|---|---|
| `routeId`, `routeName` | uuid, string | |
| `position` | integer | the stop number the student would get (1 is the first stop) |
| `extraMinutes` | integer | how many driving minutes the student adds to the route |
| `arrivalTime` | `"HH:mm"` | the pickup time they would get, from the same schedule rule as the route's own stops |
| `seatsLeft` | integer | seats left **before** the student takes one |

### BestRoutePlacement

`{ position, extraMinutes, arrivalTime, route }`: where the student went, what it added, and the route (the routing contract's `Route`) as it is now.

### Rules

- **Who can be placed.** The student must be `active` (409), on **no** route (409: take them off first, or move them by hand), and have a **pin** (409). The school must have an arrival time (409). Placing a student who is already on a route is therefore 409 every time, so a repeated `POST` places them once.
- **Which routes.** Every route of the school. A route is **skipped** `FULL` when every seat of its vehicle is taken (a route with exactly one seat left is an option), and `STARTS_TOO_EARLY` when, wherever the student went, its first pickup would be before 06:00 or the day before (06:00 exactly can be driven). Nothing else excludes a route.
- **Where on a route.** The place that adds the fewest driving minutes: for every place among the route's stops that have a pin, the schedule is worked out again with the student in it, with the routing contract's legs (road times when a road provider is set, straight lines at 30 km/h otherwise, each leg rounded up to whole minutes) and the same arrival-time rule, backwards from the school's arrival time; the least increase of the total driving time wins, and the earlier place on a tie. A stop with no pin holds a seat but is not on the schedule, so it adds no leg; the student's `position` counts it.
- **Which route.** The fewest `extraMinutes`; on a tie the route whose name sorts first (then the lower id), so the same question always has the same answer.
- **The seat is checked under a lock.** `POST` locks the chosen route and works its seats and schedule out again before it places the student, so two students cannot take the last seat. The later one gets **409** "The route filled up or changed while it was being chosen. Try again.", and asking again finds the room that is left.
- **No feasible route.** `GET` answers 200 with `recommended: null` and `options: []`; `POST` is 409 "No route has a free seat and a schedule that can be driven for this student."
- **After a `POST`** the route's stops are renumbered 1 to n and its own schedule gives the student the same `arrivalTime`.
- `GET` has no effect: asking twice gives the same answer and changes no route.

## Errors

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` |
| An unknown student, or another school's | 404 | `detail` |
| A status other than `active`, `paused` or `inactive`, or none | 400 | `errors: { status: message }` |
| `inactive` to `paused` | 409 | `detail: "An archived student can only be restored to active."` |
| Pausing or archiving a student who is on a bus today | 409 | `detail` naming the child, the bus and the time, as for taking a stop off a route |
| Best route for a student who is not `active` | 409 | `errors: { studentId: message }`, as when adding to a route |
| Best route for a student already on a route, with no pin, or in a school with no arrival time | 409 | `detail` saying which |
| `POST` best route when no route can take them, or the route changed meanwhile | 409 | `detail` |

## Known limits

- **One road-provider request per route with a seat.** The ranking works out each candidate route's matrix, so a school with many routes asks the road provider once for each (its cache serves every pair it already knows). A school with a dozen routes is fine; hundreds would need a smarter search. Without a provider key the legs are straight lines.
- **The best place is the cheapest, not the optimum.** The other stops keep their order; the route is not re-optimized (that is the route proposal's job).
- **A student must have a pin.** There is no place to put one without; set the address or place the pin first.
- **No history of status changes.** The status is the current one; who paused a student, and when, is not recorded.
- **Archiving does not touch the parent link or the parent's inbox.** The child stays linked and the parent keeps their entries.
- **Going back to `active` does not remember the old route.** The head places the student again.

## Changing this contract

Change it by pull request to this file and the samples together, and tag Moustafa and the owner of the screen (SCRUM-287).
