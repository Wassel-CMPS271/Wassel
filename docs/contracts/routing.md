# Routing contract

The agreement between the people building routes, the optimizer and the route screens (SCRUM-201). Build against this, not against each other's code. Everything is **morning pickup, one school**.

The JSON examples live in [`samples/routing/`](samples/routing). They are the source of truth for field names and types; this page explains what the fields mean and what the endpoints do.

| File | Shape | Which route | Used by |
|---|---|---|---|
| [`routes.json`](samples/routing/routes.json) | `RouteSummary[]`, the list | all three | routes screen |
| [`route.json`](samples/routing/route.json) | `Route`, with a stop that has no pin | Verdun morning run | route page, map |
| [`proposal.json`](samples/routing/proposal.json) | `Proposal`, feasible | Hamra morning run | optimize preview |
| [`proposal-infeasible.json`](samples/routing/proposal-infeasible.json) | `Proposal`, not feasible (4 students, 3 seats) | Achrafieh morning run | optimize preview |

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

Every route response includes the arrival times, so there is no separate arrival-time endpoint. Assigning, removing and reordering return the whole `Route`, so the screen redraws from one response.

## Rules

### Arrival times

Arrival times are worked **backwards from the school's arrival time** using `TravelTimes.matrix`:

1. Take the stops that have a pin, in `position` order, then the school.
2. The leg between two neighbours is `matrix[i][i+1]`, in whole minutes.
3. The last stop arrives at `school.arrivalTime` minus its leg to the school. Each earlier stop arrives at the next stop's arrival minus the leg between them.
4. `drivingMinutes` is the sum of the legs.

A stop with no pin gets `arrivalTime: null` and is skipped in the legs. Times change whenever the order or the students change.

Until the road provider client exists (SCRUM-204) the legs are **straight-line distance at 30 km/h, each leg rounded up to whole minutes**. The sample files were generated with exactly that rule. Real road times will be different numbers, never different shapes.

### Optimizing

- A route can only be optimized when it has at least one stop, **every stop has a pin**, and the school's arrival time is set. Otherwise the request answers 409 (see [Errors](#errors)): a `detail` for no stops or no school time, and a `detail` naming the students plus `studentIds` for stops without a pin.
- The optimizer only orders the stops inside one route. It never moves students between routes.
- The route is an open path: the first pickup is the start and the school is the end. There is no depot leg.
- Not being able to find an order is **not an error**. It is a 201 with `feasible: false`, `id: null`, `proposed: null` and `reasons`.
- A route has at most one pending proposal. **Every propose clears it first**, even when the new answer is not feasible, so an earlier proposal can never be applied after a later one found nothing.
- **Apply** makes the proposal the route's order and keeps the previous order as a version. It answers 404 if the proposal was discarded, replaced or never existed, and **409 if the route's stops or their order have changed since the proposal was made** (compare with `current`). The screen should say so and offer to optimize again.
- **Discard** drops the proposal. The route is untouched.

### Reason codes

| `code` | Meaning |
|---|---|
| `CAPACITY_EXCEEDED` | more students on the route than the vehicle has seats |
| `ARRIVAL_TIME_UNREACHABLE` | no order reaches the school by its arrival time |

More codes may be added later. A client must show `message` for a code it does not know.

### Vehicle and driver assignment

All routes are the same morning run, so a vehicle and a driver can each be on **at most one route**. "Overlapping" has no other meaning until routes have times. An inactive vehicle, or a deactivated driver, cannot be put on a route — both must be reactivated first (confirmed, SCRUM-208). There is no deactivate endpoint for drivers yet; the check exists for when one lands.

### Student assignment (confirmed, SCRUM-209)

- **Capacity is checked against the route's current occupants before the student is resolved**, so adding to a full route answers `CAPACITY_EXCEEDED`-shaped 409 even for an unknown student id — the same "cheapest check first" order the solver uses for capacity vs. arrival time.
- **A student is on at most one route.** Adding a student already on a different route moves them: they leave the old route (its `studentCount` drops) and join the new one. There is nothing to undo on the old route beyond that — no version history, unlike optimizer apply/discard.
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

`studentIds` is an extra property, not part of `errors`, because `errors` is for field messages. The current client keeps only `detail`; the stops already say which students have no pin (`latitude: null`), so a screen does not need it.

## Known limits

- **Morning run only.** Afternoon (dismissal) routes and depot legs are out of scope.
- **No boarding time.** A stop takes zero minutes, so real pickup windows are a little longer than shown.
- **The school's location is a configuration value**, not an admin setting, because the MVP serves one school. The `school` object has the final shape, so moving it to a school setting later changes nothing for consumers. The first story that reads it adds the property, and the app should refuse to start without it.
- **Straight-line times** until SCRUM-204 (see [Arrival times](#arrival-times)).
- `ARRIVAL_TIME_UNREACHABLE` is defined, but a solver that can always leave earlier will not produce it until a latest-departure rule exists. SCRUM-202 decides.

## Interfaces (backend)

In `com.wassel.backend.routing.service`:

- `TravelTimes.matrix(List<Coordinate>)`: square matrix of `Duration`, `[i][j]` is point i to point j in input order, never null, zero on the diagonal, not assumed symmetric. Every entry is a whole number of minutes, rounded up. One call per route, because the road provider is rate limited. `StraightLineTravelTimes` is the stand-in; the road client (SCRUM-204) wraps it as its fallback and is `@Primary`, because two `TravelTimes` beans stop startup.
- `RouteOptimizer.optimize(stops, school, capacity, schoolArrivalTime)`: returns a `Plan` with the order, arrival times, total driving time and reasons, which become `proposed` and `reasons`. A plan that is not feasible has reasons, no stops and zero time, and the `Plan` constructor enforces it. `Reason.code` is the `RouteOptimizer.Code` enum, so the codes above cannot be misspelled. The caller checks that stops are non-empty and pinned first. The arrival-time rule is written once and reused for the route's own arrival times (SCRUM-212); it comes with the solver (SCRUM-202), which implements `RouteOptimizer`.

## Changing this contract

Change it by pull request to this file and the samples together, and tag the owners in the table above (Moustafa, Majd, Wassim, Hashem). The samples and this page must always agree. When a real endpoint replaces a sample, the screen deletes its sample client.
