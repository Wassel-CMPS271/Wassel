# Routing contract

The agreement between the people building routes, the optimizer and the route screens (SCRUM-201). Build against this, not against each other's code. Everything is **morning pickup, one school**.

The JSON examples live in [`samples/routing/`](samples/routing). They are the source of truth for field names and types; this page explains what the fields mean and what the endpoints do.

| File | Shape | Which route | Used by |
|---|---|---|---|
| [`routes.json`](samples/routing/routes.json) | `RouteSummary[]`, the list | all three | routes screen |
| [`route.json`](samples/routing/route.json) | `Route`, with a stop that has no pin | Verdun morning run | route page, map |
| [`proposal.json`](samples/routing/proposal.json) | `Proposal`, feasible | Hamra morning run | optimize preview |
| [`proposal-infeasible.json`](samples/routing/proposal-infeasible.json) | `Proposal`, not feasible (4 students, 3 seats) | Achrafieh morning run | optimize preview |
| [`fleet-proposal.json`](samples/routing/fleet-proposal.json) | `FleetProposal` with five routes: three update existing routes, one is new, one existing route is emptied (no stops) | all three, plus a new D 456789 run and an emptied Gemmayzeh run | generate-all screen |
| [`fleet-proposal-nothing.json`](samples/routing/fleet-proposal-nothing.json) | `FleetProposal` with nothing to apply (`id: null`, no seats) | none | generate-all screen |

The school in every sample is the one in `route.json`.

## Conventions

- Every endpoint is under `/api/head-of-transport/routes` and needs the signed-in head of transportation (cookie session, `credentials: "include"`).
- The school always comes from the session. It is never sent and never appears as `schoolId`. A route that belongs to another school answers **404**, like a route that does not exist.
- Ids are UUIDs. Times are `"HH:mm"`, **school-local time**, no date and no zone. Coordinates are decimal degrees (WGS84) as plain JSON numbers.
- Field names are camelCase and match the existing vehicle, driver and student responses.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).

## Shapes

### Stop

One student on one route. **A stop is a student**: `studentId` is its only identity (there is no separate stop id), so two siblings at the same address are two stops.

| Field | Type | Notes |
|---|---|---|
| `studentId` | uuid | |
| `position` | integer | 1-based place in the order |
| `firstName`, `lastName` | string | |
| `address` | string or null | as saved on the student |
| `latitude`, `longitude` | number or null | the map pin. Both null, or both set. Null means the student has no pin yet |
| `arrivalTime` | `"HH:mm"` or null | estimated arrival, see [Arrival times](#arrival-times). Null when the stop has no pin |

### RouteSummary

What the list returns.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | string | |
| `vehicle` | `{ id, plateNumber, capacity }` | |
| `driver` | `{ id, firstName, lastName }` | |
| `studentCount` | integer | stops on the route |
| `seatsLeft` | integer | `capacity - studentCount`. **Negative when the route is over capacity**, which happens if the vehicle's capacity is lowered after students were assigned. The screen should warn |

### Route

Everything in `RouteSummary`, plus:

| Field | Type | Notes |
|---|---|---|
| `school` | `{ latitude, longitude, arrivalTime }` | where the route ends, and the arrival time it works back from. Same for every route. `arrivalTime` is the school's arrival time from the school settings and is **null until an admin sets it**: while it is null, every stop's `arrivalTime` is null too and optimizing answers 409 |
| `stops` | `Stop[]` | in `position` order |

### Proposal

What the optimizer suggests. Making one never changes the route.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid or null | the handle for apply and discard. **Null when not feasible**: nothing is saved |
| `feasible` | boolean | |
| `current` | `{ drivingMinutes, stops }` | the route's order right now, for the side-by-side view. Built by the optimize endpoint with the [arrival-time rule](#arrival-times), the same rule that fills `Route.stops[].arrivalTime` |
| `proposed` | `{ drivingMinutes, stops }` or null | the suggested order. Null when not feasible |
| `reasons` | `{ code, message }[]` | empty when feasible. Switch on `code`, show `message` |

`drivingMinutes` is the time from the first pickup to the school. The time saved is `current.drivingMinutes - proposed.drivingMinutes`.

`proposed.stops` uses the same `Stop` shape, with `position` renumbered, so the map and the preview need no second request.

### FleetProposal

What generating all routes suggests for the whole school (SCRUM-207). Making one never changes a route or a student.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid or null | the handle for apply and discard. **Null when `routes` is empty**: there is nothing to apply and nothing is saved |
| `routes` | `PlannedRoute[]` | one per vehicle that got students, plus one with **empty `stops`** for each planned vehicle whose existing route gets none of its students: applying empties that route, and its students are in `leaving` |
| `unplaced` | `UnplacedStudent[]` | every active student that is on none of `routes`, each with a reason |
| `excludedVehicles` | `{ vehicle, message }[]` | active vehicles that were not planned because no active driver is free for them: none is assigned, the driver is invited or deactivated, or the assigned driver is already on another route. `vehicle` is `{ id, plateNumber, capacity }`. Show `message` |
| `school` | `{ latitude, longitude, arrivalTime }` | same as `Route.school`, so the map needs no second request |

`PlannedRoute`:

| Field | Type | Notes |
|---|---|---|
| `existingRouteId` | uuid or null | the route this one updates. **Null means applying creates it** |
| `name` | string | the existing route's name, or `"<plate> morning run"` for a new one |
| `vehicle`, `driver` | as in `RouteSummary` | an existing route keeps its driver; a new one gets the vehicle's assigned driver |
| `drivingMinutes` | integer | from the first pickup to the school. 0 when `stops` is empty |
| `stops` | `Stop[]` | in `position` order, with arrival times, as in `proposed.stops`. Seats used is `stops.length` against `vehicle.capacity`. **Can be empty**: the route is emptied (no line to draw on the map) |
| `leaving` | `{ studentId, firstName, lastName }[]` | students on the existing route today who will not be on it afterwards (moved to another route, or unplaced). Empty for a new route |

`UnplacedStudent` is `{ studentId, firstName, lastName, address, reason: { code, message } }`.

## Endpoints

All of Moustafa's rows are confirmed: the request bodies below are what's actually built.

| Method | Path | Body | Success | Owner |
|---|---|---|---|---|
| GET | `/api/head-of-transport/routes` | | 200 `RouteSummary[]` | Moustafa, SCRUM-208 |
| POST | `/api/head-of-transport/routes` | `{ name, vehicleId, driverId }` | 201 `Route` | Moustafa, SCRUM-208 |
| GET | `/api/head-of-transport/routes/{routeId}` | | 200 `Route` | Moustafa, SCRUM-208 |
| PUT | `/api/head-of-transport/routes/{routeId}` | `{ name, vehicleId, driverId }` | 200 `Route` | Moustafa, SCRUM-208 |
| DELETE | `/api/head-of-transport/routes/{routeId}` | | 204 | Moustafa, SCRUM-208 |
| POST | `/api/head-of-transport/routes/{routeId}/students` | `{ studentId }` | 200 `Route` | Moustafa, SCRUM-209 |
| DELETE | `/api/head-of-transport/routes/{routeId}/students/{studentId}` | | 200 `Route` | Moustafa, SCRUM-209 |
| PUT | `/api/head-of-transport/routes/{routeId}/stops` | `{ studentIds }`, the full new order | 200 `Route` | Moustafa, SCRUM-210 |
| POST | `/api/head-of-transport/routes/{routeId}/optimization` | none | 201 `Proposal` | Hashem, SCRUM-203 |
| POST | `/api/head-of-transport/routes/{routeId}/optimization/{proposalId}/apply` | none | 200 `Route` | Hashem, SCRUM-203 |
| DELETE | `/api/head-of-transport/routes/{routeId}/optimization/{proposalId}` | | 204 | Hashem, SCRUM-203 |
| POST | `/api/head-of-transport/routes/generation` | none | 201 `FleetProposal` | Hashem, SCRUM-207 |
| POST | `/api/head-of-transport/routes/generation/{proposalId}/apply` | none | 200 `RouteSummary[]`, the same list as `GET /routes` | Hashem, SCRUM-207 |
| DELETE | `/api/head-of-transport/routes/generation/{proposalId}` | | 204 | Hashem, SCRUM-207 |

Every route response includes the arrival times, so there is no separate arrival-time endpoint. Assigning, removing and reordering return the whole `Route`, so the screen redraws from one response.

## Rules

### Arrival times

Arrival times are worked **backwards from the school's arrival time** using `TravelTimes.matrix`:

1. Take the stops that have a pin, in `position` order, then the school.
2. The leg between two neighbours is `matrix[i][i+1]`, in whole minutes.
3. The last stop arrives at `school.arrivalTime` minus its leg to the school. Each earlier stop arrives at the next stop's arrival minus the leg between them.
4. `drivingMinutes` is the sum of the legs.

A stop with no pin gets `arrivalTime: null` and is skipped in the legs. Times change whenever the order or the students change.

The legs are **road driving times from OpenRouteService, each leg rounded up to whole minutes** (SCRUM-204). When the provider cannot answer (no key, a failure, its quota used up) the leg is **straight-line distance at 30 km/h, rounded up**, which is also what the sample files were generated with. A pair of points with no road between them is also straight-line, even while the provider answers. Real road times are different numbers, never different shapes.

### Optimizing

- A route can only be optimized when it has at least one stop, **every stop has a pin**, and the school's arrival time is set. Otherwise the request answers 409 (see [Errors](#errors)): a `detail` for no stops or no school time, and a `detail` naming the students plus `studentIds` for stops without a pin.
- The optimizer only orders the stops inside one route. It never moves students between routes. Splitting students across vehicles is the fleet planner's job (see [Fleet planning](#fleet-planning-scrum-206)), and it only proposes.
- The route is an open path: the first pickup is the start and the school is the end. There is no depot leg.
- Not being able to find an order is **not an error**. It is a 201 with `feasible: false`, `id: null`, `proposed: null` and `reasons`.
- A route has at most one pending proposal. **Every propose that answers 201 clears it first**, even when the new answer is not feasible, so an earlier proposal can never be applied after a later one found nothing. A propose rejected with a 409 (no stops, no school arrival time, stops without a pin) changes nothing, so the earlier proposal stays pending.
- **Apply** makes the proposal the route's order and keeps the previous order as a version. It answers 404 if the proposal was discarded, replaced or never existed, and **409 if the route's stops or their order have changed since the proposal was made** (compare with `current`). The screen should say so and offer to optimize again.
- **Discard** drops the proposal. The route is untouched. It answers 404 for a proposal that is already gone, the same as apply.
- Two proposes for one route at the same moment: one wins, the other answers **409** and the screen asks again.
- The previous orders kept by apply are stored only: no endpoint lists or restores them yet, and a manual reorder (`PUT .../stops`) does not make a version.

### Earliest first pickup

Arrival times are worked backwards, so no stop can arrive after the school's arrival time. What can fail is the start: the best order found takes `drivingMinutes`, so its first pickup is `school.arrivalTime - drivingMinutes`. If that is **before 06:00**, or before midnight, the route cannot be driven and the plan is not feasible with `ARRIVAL_TIME_UNREACHABLE`. The order with the least driving time starts latest, so one the solver cannot place after 06:00 has no better alternative. 06:00 is a constant while the MVP serves one school (SCRUM-202, `RouteTimings.EARLIEST_FIRST_PICKUP`); a first pickup at exactly 06:00 is allowed.

### Capacity

Capacity is checked first. A route with more stops than the vehicle has seats answers `CAPACITY_EXCEEDED` only, without searching, so it never also reports `ARRIVAL_TIME_UNREACHABLE`. No student is ever dropped to make a route fit. The fleet planner may leave students out, but never silently: each one is reported with a reason.

### Fleet planning (SCRUM-206)

The fleet planner splits a school's students across its vehicles and orders each route. It only proposes; saving the result is the generate-all endpoints' job (SCRUM-207).

- **Input:** the students to place (each with a pin), the vehicles (id and seats), the school and its arrival time. The caller chooses them: only active students with a pin, and only active vehicles with a driver who can drive them, because a route needs both. A vehicle without a driver is not a seat.
- **Output:** one route per vehicle that got students, each a feasible plan with the same arrival-time rule as above, and the students it could not place, each with a reason. A vehicle with no students gets no route. Every student given is on exactly one route or in the unplaced list.
- **Rules:** no vehicle carries more students than its seats, and no route's first pickup is before 06:00. Within that, it keeps the total driving time low. It does not balance route lengths.
- **Unplaced reasons:** `CAPACITY_EXCEEDED` when there are more students than seats in the whole fleet (checked first, as for one route), otherwise `ARRIVAL_TIME_UNREACHABLE`: the student could not be fitted into a route that starts at or after 06:00, or, above 58 students only, was on a route that failed 06:00 once its own road times were known, in which case some of those students might fit on another vehicle (see [Known limits](#known-limits)); the screen should offer to add them by hand. Who is left out when seats run short is whoever costs the most driving to collect, usually the students farthest away; the head of transportation sees the list before anything is saved.
- It ignores which routes students are on today. Matching the result to existing routes is SCRUM-207's job.

### Generating all routes (SCRUM-207)

- **Generate** gathers the school's active students and vehicles, asks the fleet planner, and saves the result as the school's one pending proposal. It changes no route and no student. A new generate replaces the pending proposal, so the old id answers 404. It is one request that can take 10 to 20 seconds for a large school, so the screen shows progress until it answers. Only one generation per school runs at a time.
- **Who is planned:** every active student with a pin. An active student **without a pin** is in `unplaced` with `NO_PIN`. Inactive students are ignored. An active vehicle is planned when its driver is **active** (not invited, not deactivated): the driver of the route it is already on, or, if it has no route, its assigned driver, who must not be on another route. Any other active vehicle is in `excludedVehicles`.
- **Apply** is one transaction. A planned vehicle that already has a route **updates that route**: it keeps its name and driver, and its students and their order are replaced by the proposal's. A planned vehicle without a route gets a **new route**. A planned vehicle that already has a route but gets no students still updates it: the route is **emptied**, and the proposal lists it with no stops and everyone on it in `leaving`. Routes of vehicles that are not planned are left alone. A student is taken off a route only when the proposal puts them on another one, or when the route is updated and the student is not on it (see `leaving`). Stop positions become a clean `1..n` on every route it writes. It answers with the school's routes as `GET /routes` would.
- **Apply is refused with 409 if the data changed since the proposal was made**: a student added, deactivated or given a different pin; a vehicle, its capacity or its driver changed; a route created or deleted, its vehicle or driver changed, or its students or their order changed (renaming a route does not count); or the school's arrival time changed. The `detail` says which of these changed, nothing is written, and the proposal stays so it can be discarded. The screen offers to generate again.
- **Applying the same proposal twice:** the second answers **404**, like apply on a proposal that is gone. Generating and applying again never duplicates a route, because a vehicle's route is matched, not created again.
- **Discard** drops the proposal and changes nothing. A proposal that is gone answers 404.
- A pending single-route proposal (SCRUM-203) is left as it is. If apply changed that route's students or order, the single-route apply answers 409 as it does today.
- There is no undo. Apply logs the previous student-to-route assignment at INFO, which is the only record.

### Reason codes

| `code` | Meaning |
|---|---|
| `CAPACITY_EXCEEDED` | more students on the route than the vehicle has seats |
| `ARRIVAL_TIME_UNREACHABLE` | the best order found would have to start before the earliest first pickup (06:00), or before midnight, to reach the school on time. See [Earliest first pickup](#earliest-first-pickup) |
| `NO_PIN` | an active student has no map pin, so generating all routes could not place them (SCRUM-207). Only in `FleetProposal.unplaced` |

More codes may be added later. A client must show `message` for a code it does not know.

### Vehicle and driver assignment

All routes are the same morning run, so a vehicle and a driver can each be on **at most one route**. "Overlapping" has no other meaning until routes have times. An inactive vehicle, or a deactivated driver, cannot be put on a route — both must be reactivated first (confirmed, SCRUM-208). There is no deactivate endpoint for drivers yet; the check exists for when one lands. Editing a route re-checks only a vehicle or driver that is being **changed**: a route can still be renamed after its current vehicle or driver was deactivated, which is a reminder to swap them, not a reason to refuse the rename.

### Student assignment (confirmed, SCRUM-209)

- **Capacity is checked against the route's current occupants before the student is resolved**, so adding to a full route answers `CAPACITY_EXCEEDED`-shaped 409 even for an unknown student id — the same "cheapest check first" order the solver uses for capacity vs. arrival time.
- **A student is on at most one route.** Adding a student already on a different route moves them: they leave the old route (its `studentCount` drops) and join the new one. There is nothing to undo on the old route beyond that — no version history, unlike optimizer apply/discard.
- **Adding a student who is already a stop on this same route changes nothing**: they keep their place and the answer is the unchanged route (200). It takes no new seat, so the capacity check is skipped.
- **Only an active student can be added.** Removing has no such restriction — an inactive student already on a route can still be taken off it.
- **Removing a student who exists but isn't a stop on *that* route is 404**, the same as a route or student that doesn't exist — the endpoint describes a relationship between the two ids, not just whether the student exists.
- The old text `students.route` column is untouched by any of this (still SCRUM-209's call per the earlier draft note, now settled: it keeps working for filtering, nothing here writes it).
- A stop's position comes from insertion order (each new stop goes to the end); there's no gap-filling when a stop is removed. Manual reordering (SCRUM-210) is the only way to change it.

### Manual reorder (confirmed, SCRUM-210)

- The request is the **full** new order, every student id that's currently a stop on the route — not a delta (a `{ from, to }` move, or a single swap). The screen sends the whole list it already has after a drag-and-drop, reordered.
- **Rejected (400) if the list repeats a student id, or doesn't contain exactly the route's current stops** — missing one, or naming a student who isn't a stop on this route at all. Both are reported under `errors.studentIds`; the two cases have distinct messages.
- Reordering moves nobody on or off the route. Assigning and removing (SCRUM-209) are the only ways to change *which* students are stops; this only changes their order.
- Positions become a clean `1..n` after a reorder, not a watermark like a single assign — the whole order was just given explicitly, so there's nothing to leave gaps in.
- Reordering a route with no stops, with an empty list, succeeds (a no-op).
- This is the fallback that keeps a route demoable before the optimizer (SCRUM-202/203) exists; apply/discard later replaces the saved order the same way.

## Errors

The same `ProblemDetail` the other modules return, so the existing `request()` helper in `frontend/src/lib/api/client.ts` reads them the same way: a body with an `errors` map throws `ApiValidationError`, anything else throws `ApiError(status, detail)`. One frontend change comes first: `request()` types `method` as `"GET" | "POST"` today, so it must be widened for the PUT and DELETE calls (the backend's CORS already allows them).

| Case | Status | Body |
|---|---|---|
| Invalid create or edit input | 400 | `errors: { field: message }` |
| Not found, or another school's route | 404 | `detail` |
| Vehicle or driver already on another route (see [Rules](#rules)) | 409 | `errors: { vehicleId: message }` or `{ driverId: message }`, naming the conflicting route |
| Inactive vehicle or driver | 409 | `errors: { vehicleId: message }` or `{ driverId: message }` |
| Adding beyond capacity | 409 | `detail`, including the current count and the capacity |
| Adding an inactive student | 409 | `errors: { studentId: message }` |
| Reorder repeats a student, or doesn't match the route's current stops | 400 | `errors: { studentIds: message }` |
| Removing a student who isn't a stop on that route | 404 | `detail` |
| Optimize with no stops | 409 | `detail` |
| Optimize before the school's arrival time is set | 409 | `detail` |
| Optimize with stops that have no pin | 409 | `detail` naming them, and `studentIds: [uuid, ...]` as an extra property |
| Apply on a route that changed since the proposal | 409 | `detail` |
| Apply or discard a proposal that is gone, replaced, never existed or is on another route | 404 | `detail` |
| Propose while another propose for the route is in flight | 409 | `detail` |
| Generate before the school's arrival time is set | 409 | `detail` |
| Generate while another generate for the school is running | 409 | `detail` |
| Apply generated routes when the data changed since the proposal was made | 409 | `detail` naming what changed |
| Apply or discard a generated proposal that is gone, replaced, already applied, never existed or is another school's | 404 | `detail` |

`studentIds` is an extra property, not part of `errors`, because `errors` is for field messages. The client keeps it as `ApiError.studentIds` (undefined for every other answer), so the route screen can name the students and link to the Students page.

## Known limits

- **Morning run only.** Afternoon (dismissal) routes and depot legs are out of scope. The daily runs ([`runs.md`](runs.md)) drive each route in the afternoon too, as the morning order reversed with no times.
- **No boarding time.** A stop takes zero minutes, so real pickup windows are a little longer than shown.
- **The school's location is a configuration value**, not an admin setting, because the MVP serves one school. The `school` object has the final shape, so moving it to a school setting later changes nothing for consumers. The first story that reads it adds the property, and the app should refuse to start without it.
- **Straight-line times when the road provider is unavailable** (see [Arrival times](#arrival-times)). While the provider is unavailable, a route whose stops changed shows straight-line times for every leg (never a mix of road and straight-line legs), and goes back to road times once the provider answers; a route whose points were all seen before keeps its road times. A change to a route's stops costs one provider request for its whole set of points.
- **The fleet planner assigns on straight-line times above 58 students.** It asks for one matrix over every student and the school, and the road provider takes at most 59 points a request, so a larger school is split using straight-line times (no request is spent on it). Each route is then ordered again with its own road matrix; a route that turns out to start before 06:00 on road times is dropped and its students are reported `ARRIVAL_TIME_UNREACHABLE`.
- **The fleet planner's answer can differ between runs.** Its search stops at a time limit (50 ms per student, at most 5 s, plus each route's own ordering), so two runs on the same input may split students differently. Every answer keeps the rules above. Measured on straight-line times: about 1 s for the demo school, 12.5 s for 150 students on 10 vehicles, so a caller shows progress and does not hold a database transaction while it runs.
- **Generating all routes costs road-provider requests.** About one for the whole fleet (none above 58 students) plus one per route, for point sets not seen before. The free key appears to allow about 50 requests a day (unconfirmed), so generating repeatedly on changed data can use the day up; times then fall back to straight-line, as above. Generating the same data again costs nothing once its pairs are cached.
- **A route of a vehicle that is not planned is not listed.** If the proposal moves one of its students onto a planned route, the student shows up in that route's `stops`, but the route they leave has no `leaving` entry. This only happens when a vehicle with a route lost its driver or its driver became unusable.
- **Apply can overwrite a change made at the same moment.** The data is compared and written in one transaction, but a manual edit that commits between the comparison and the write is overwritten, the same limit as the single-route apply.
- **The solver is a heuristic.** It starts from the order it was given and is never worse than it, and it matched the brute-force best on every small test route, but for large routes it does not prove optimality. `ARRIVAL_TIME_UNREACHABLE` therefore says the best order *found* starts too early.

## Interfaces (backend)

In `com.wassel.backend.routing.service`:

- `TravelTimes.matrix(List<Coordinate>)`: square matrix of `Duration`, `[i][j]` is point i to point j in input order, never null, zero on the diagonal, not assumed symmetric. Every entry is a whole number of minutes, rounded up. One call per route, because the road provider is rate limited. `OpenRouteServiceTravelTimes` (SCRUM-204) is the `@Primary` implementation: it asks OpenRouteService, caches every pair, and wraps `StraightLineTravelTimes` as its fallback, because two `TravelTimes` beans stop startup.
- `RouteOptimizer.optimize(stops, school, capacity, schoolArrivalTime)`: returns a `Plan` with the order, arrival times, total driving time and reasons, which become `proposed` and `reasons`. A plan that is not feasible has reasons, no stops and zero time, and the `Plan` constructor enforces it. `Reason.code` is the `RouteOptimizer.Code` enum, so the codes above cannot be misspelled. The caller checks that stops are non-empty and pinned first. `OrToolsRouteOptimizer` (SCRUM-202) implements it.
- `FleetPlanner.plan(students, vehicles, school, schoolArrivalTime)` (SCRUM-206): returns a `FleetPlan` of `VehicleRoute(vehicleId, plan)`, each plan feasible and made by `RouteOptimizer`, and `Unplaced(studentId, reason)` using the same `Reason` and codes. One matrix for the assignment, then one per route. If the solver itself fails it throws (the endpoint answers 500); a failure is never reported as unplaced students.
- `RouteTimings.schedule(...)`: the arrival-time rule, written once. Pass `TravelTimes`, the pinned stops already in order, the school and its arrival time, or a matrix you already hold with a visiting order. It returns `Timing(arrivals, drivingTime, crossesMidnight)` and `startsTooEarly()`. The propose endpoint's `current` (SCRUM-203) and the route's own arrival times (SCRUM-212) must call it instead of redoing the arithmetic. When the first pickup falls before midnight `arrivals` is empty, because a time of day cannot say it: treat `startsTooEarly()` as "no times".

## Changing this contract

Change it by pull request to this file and the samples together, and tag the owners in the table above (Moustafa, Majd, Wassim, Hashem). The samples and this page must always agree. When a real endpoint replaces a sample, the screen deletes its sample client.
