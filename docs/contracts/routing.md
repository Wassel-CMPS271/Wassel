# Routing contract

The agreement between the people building routes, the optimizer and the route screens (SCRUM-201). Build against this, not against each other's code. Everything is **morning pickup, one school**.

The JSON examples live in [`samples/routing/`](samples/routing). They are the source of truth for field names and types; this page explains what the fields mean and what the endpoints do.

| File | Shape | Used by |
|---|---|---|
| [`routes.json`](samples/routing/routes.json) | `RouteSummary[]`, the list | routes screen |
| [`route.json`](samples/routing/route.json) | `Route`, with a stop that has no pin | route page, map |
| [`proposal.json`](samples/routing/proposal.json) | `Proposal`, feasible | optimize preview |
| [`proposal-infeasible.json`](samples/routing/proposal-infeasible.json) | `Proposal`, not feasible | optimize preview |

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
| `school` | `{ latitude, longitude, arrivalTime }` | where the route ends, and the arrival time it works back from. Same for every route |
| `stops` | `Stop[]` | in `position` order |

### Proposal

What the optimizer suggests. Making one never changes the route.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid or null | the handle for apply and discard. **Null when not feasible**: nothing is saved |
| `feasible` | boolean | |
| `current` | `{ drivingMinutes, stops }` | the route's order right now, for the side-by-side view |
| `proposed` | `{ drivingMinutes, stops }` or null | the suggested order. Null when not feasible |
| `reasons` | `{ code, message }[]` | empty when feasible. Switch on `code`, show `message` |

`drivingMinutes` is the time from the first pickup to the school. The time saved is `current.drivingMinutes - proposed.drivingMinutes`.

`proposed.stops` uses the same `Stop` shape, with `position` renumbered, so the map and the preview need no second request.

## Endpoints

Moustafa's rows are **draft**: the response shapes above are what Majd should build against, and Moustafa confirms the request bodies in his PR to this file.

| Method | Path | Body | Success | Owner |
|---|---|---|---|---|
| GET | `/api/head-of-transport/routes` | | 200 `RouteSummary[]` | Moustafa, SCRUM-208 (draft) |
| POST | `/api/head-of-transport/routes` | `{ name, vehicleId, driverId }` | 201 `Route` | Moustafa, SCRUM-208 (draft) |
| GET | `/api/head-of-transport/routes/{routeId}` | | 200 `Route` | Moustafa, SCRUM-208 (draft) |
| PUT | `/api/head-of-transport/routes/{routeId}` | `{ name, vehicleId, driverId }` | 200 `Route` | Moustafa, SCRUM-208 (draft) |
| DELETE | `/api/head-of-transport/routes/{routeId}` | | 204 | Moustafa, SCRUM-208 (draft) |
| POST | `/api/head-of-transport/routes/{routeId}/students` | `{ studentId }` | 200 `Route` | Moustafa, SCRUM-209 (draft) |
| DELETE | `/api/head-of-transport/routes/{routeId}/students/{studentId}` | | 200 `Route` | Moustafa, SCRUM-209 (draft) |
| PUT | `/api/head-of-transport/routes/{routeId}/stops` | `{ studentIds }`, the full new order | 200 `Route` | Moustafa, SCRUM-210 (draft) |
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

- A route can only be optimized when it has at least one stop and **every stop has a pin**. Otherwise the request answers 409 and says which students (see [Errors](#errors)).
- The optimizer only orders the stops inside one route. It never moves students between routes.
- The route is an open path: the first pickup is the start and the school is the end. There is no depot leg.
- Not being able to find an order is **not an error**. It is a 201 with `feasible: false`, `id: null`, `proposed: null` and `reasons`.
- A route has at most one pending proposal. Proposing again replaces it.
- **Apply** makes the proposal the route's order and keeps the previous order as a version. It answers 404 if the proposal was discarded, replaced or never existed, and **409 if the route's stops or their order have changed since the proposal was made** (compare with `current`). The screen should say so and offer to optimize again.
- **Discard** drops the proposal. The route is untouched.

### Reason codes

| `code` | Meaning |
|---|---|
| `CAPACITY_EXCEEDED` | more students on the route than the vehicle has seats |
| `ARRIVAL_TIME_UNREACHABLE` | no order reaches the school by its arrival time |

More codes may be added later. A client must show `message` for a code it does not know.

## Errors

The same `ProblemDetail` the other modules return, so the existing `request()` helper in `frontend/src/lib/api/client.ts` handles them: a body with an `errors` map throws `ApiValidationError`, anything else throws `ApiError(status, detail)`.

| Case | Status | Body |
|---|---|---|
| Invalid create or edit input | 400 | `errors: { field: message }` |
| Not found, or another school's route | 404 | `detail` |
| Vehicle or driver already on an overlapping route | 409 | `errors: { vehicleId: message }`, naming the conflicting route |
| Adding beyond capacity | 409 | `detail`, including the current count and the capacity |
| Optimize with no stops | 409 | `detail` |
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

- `TravelTimes.matrix(List<Coordinate>)`: square matrix of `Duration`, `[i][j]` is point i to point j in input order, never null, zero on the diagonal, not assumed symmetric. One call per route, because the road provider is rate limited. `StraightLineTravelTimes` is the stand-in; the road client (SCRUM-204) wraps it as its fallback and becomes the injected implementation.
- `RouteOptimizer.optimize(stops, school, capacity, schoolArrivalTime)`: returns a `Plan` with the order, arrival times, total driving time and reasons. The solver (SCRUM-202) implements it.

## Changing this contract

Change it by pull request to this file and the samples together, and tag the owners in the table above (Moustafa, Majd, Wassim, Hashem). The samples and this page must always agree. When a real endpoint replaces a sample, the screen deletes its sample client.
