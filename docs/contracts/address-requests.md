# Address requests contract (SCRUM-269)

> **DRAFT — to be agreed with the SCRUM-269 owner (Moustafa).** Nothing here is built yet. This
> is a starting proposal for the endpoints, shapes and rules so the head-of-transportation
> roster screen (SCRUM-275) can build its "Address requests" section behind a typed interface
> ahead of the real API, and swap it in with no UI rewrite once this is agreed and merged. Every
> field name, path and status code below is open to change in review.

The agreement between whoever builds the address-request endpoints (`students` or a new module —
see [Open questions](#open-questions)) and the head-of-transportation roster screen that shows
pending requests. Build against this, not against each other's code. One school.

A parent asks to change their child's pickup address; the head of transportation approves or
rejects the request. This contract covers only the head-of-transportation side (list, approve,
reject). The parent-facing "submit a request" endpoint is **not designed here** — see
[Open questions](#open-questions) — because the review side is what SCRUM-275 needs first.

No sample JSON exists yet. Once this is agreed, samples go in `samples/address-requests/`,
following the pattern of [`samples/routing/`](samples/routing) and [`samples/runs/`](samples/runs).

## Conventions

- Every endpoint below needs the signed-in **head of transportation** (cookie session,
  `credentials: "include"`), the same as the other `/api/head-of-transport/*` endpoints.
- The school always comes from the session, never sent and never appears as `schoolId`. A
  request for a student outside the signed-in head of transportation's school answers **404**,
  like a request that does not exist — the same "can't tell not-yours from unknown" rule the
  `students` module already uses elsewhere (`findChildOf`).
- Ids are UUIDs. `createdAt` and `decidedAt` are moments, ISO-8601 in UTC with a `Z`, like
  `createdAt` on `StudentResponse` and the runs contract.
- Field names are camelCase.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).

## Shapes

### AddressRequest

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | the request's own id, not the student's |
| `studentId` | uuid | |
| `studentName` | string | `firstName + " " + lastName` at the time of the request, so a row still reads correctly if the student's name is edited afterwards, and so the roster screen needs no second lookup to show the request |
| `currentAddress` | string or null | the student's saved address at the time of the request. Matches `StudentResponse.address` as it was then; it is **not** re-read live, so an approval or rejection can be explained against what it actually compared to |
| `requestedAddress` | string | the new address text the parent is asking for |
| `requestedLat`, `requestedLng` | number or null | both set only when the parent placed a pin for the requested address (mirroring `manualPin` on `Student`); otherwise **both null** (always present, never omitted, like the routing contract's pins), and approval would geocode `requestedAddress` the normal way |
| `requestedBy` | `{ parentUserId, email }` | the parent who submitted it. `parentUserId` matches `Student.parentUserId`/`StudentResponse.parentUserId`; `email` is theirs at request time, the same convention as `studentName` |
| `status` | `"pending"`, `"approved"`, or `"rejected"` | see [Rules](#rules) |
| `createdAt` | moment | when the parent submitted it |
| `decidedAt` | moment or null | null while `status` is `"pending"`; set once, when approved or rejected |
| `rejectionReason` | string or null | only ever set when `status` is `"rejected"`, and only when the head of transportation gave one — it is optional on reject |

## Endpoints

| Method | Path | Role | Body | Success | Owner |
|---|---|---|---|---|---|
| GET | `/api/head-of-transport/address-requests?status=` | HEAD_OF_TRANSPORT | | 200 `AddressRequest[]`, `status=pending` when omitted (see [Listing](#listing)) | TBD — Moustafa, SCRUM-269 |
| POST | `/api/head-of-transport/address-requests/{id}/approve` | HEAD_OF_TRANSPORT | none | 200 `AddressRequest`, now `"approved"` | TBD — Moustafa, SCRUM-269 |
| POST | `/api/head-of-transport/address-requests/{id}/reject` | HEAD_OF_TRANSPORT | `{ reason? }` | 200 `AddressRequest`, now `"rejected"` | TBD — Moustafa, SCRUM-269 |

`POST` rather than `PATCH` for approve/reject, matching the existing revoke/restore pattern
(`PATCH .../{id}/revoke`) would also be reasonable — open to the owner's preference; either way
each is a one-way transition, never a partial update of other fields.

## Rules

### Listing

- `GET` with no `status` (or `status=pending`) returns only requests still awaiting a decision,
  which is what the roster screen's "Address requests" section shows, so a newly decided request
  disappears from the list on the next load without the screen filtering client-side.
- `status=approved` or `status=rejected` lists that school's decided requests (for a future
  history view; not required for SCRUM-275's first cut). An unrecognized `status` value is **400**
  with `detail: "Invalid request parameter"`, like the runs contract's `date` parameter (see
  [Errors](#errors)).
- Ordered oldest-first (`createdAt` ascending), matching `StudentController.listStudents`.
- Every request is scoped to the signed-in head of transportation's school; a parent's requests
  for a student in another school never appear and can't be approved or rejected (404, see
  [Errors](#errors)).

### Deciding

- **Approve** and **reject** are each a one-way move from `"pending"` to the respective final
  status. Approving or rejecting a request that is already `"approved"` or `"rejected"` is
  **409** and changes nothing, including a repeat of the exact same decision — there is no "undo"
  and no re-deciding, the same as a run's confirmation table in the runs contract.
- **The student's saved address and pin are unchanged while a request is `"pending"` or after it
  is `"rejected"`.** Only an **approval** may update `Student.address`/`latitude`/`longitude`,
  and whether it does so automatically (e.g. by calling the same path
  `PATCH .../students/{id}/address` uses) or requires a separate save by the head of
  transportation is an implementation decision for whoever builds this — not fixed by this draft
  or shown as a warning in the SCRUM-275 UI (decided out of scope for that screen). If approval
  does update the student, it should follow the existing `manualPin` rule: a pin the parent
  supplied with the request (`requestedLat`/`requestedLng` set) should behave like a manual pin,
  and otherwise the address should be geocoded the normal way.
- **Only the signed-in head of transportation of that request's own school may decide it.**
  Another school's head of transportation gets the same 404 as listing — the request doesn't
  appear to exist to them, not a 403 that would confirm it exists elsewhere.
- Rejecting without a `reason` is allowed; `reason`, when given, is free text (a max length, e.g.
  255 to match `UpdateStudentAddressRequest.address`, is left to the owner).
- Not decided here: whether a student who becomes inactive while their request is pending blocks
  approval, and whether a parent can withdraw a still-pending request (no endpoint above covers
  that) — both are for the owner to settle before this leaves draft.

## Errors

The same `ProblemDetail` shape the other contracts use, read by `request()` in
`frontend/src/lib/api/client.ts` the same way.

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` ("Access denied") |
| A request id that is unknown, or belongs to another school | 404 | `detail` |
| Approve or reject a request that is not `"pending"` (already decided, either way) | 409 | `detail`, including the current `status` and `decidedAt` |
| A `reason` over the length limit | 400 | `errors: { reason: message }` |
| A body that is not JSON | 400 | `detail: "Malformed request body"` |
| An unrecognized `status` filter, or an id in the path that does not parse | 400 | `detail: "Invalid request parameter"` |

## Open questions

These need the owner's answer before this draft can be finalized and the real endpoints built:

1. **The parent-facing side is undesigned here.** How does a request get created — a new
   `POST /api/parent/children/{studentId}/address-requests`? Can a parent have more than one
   pending request per child, or does submitting a new one replace/cancel the old? This contract
   only covers the head-of-transportation review side because that's what SCRUM-275 needs first.
2. **Does approval write the student's address automatically**, or does the head of
   transportation still have to save it through the existing edit form after approving? Affects
   whether `StudentListItem`/`EditStudentAddressForm` need to refresh after an approval.
3. **Owning module.** Does this belong in `students` (it only ever touches `Student` rows) or a
   new module (it also needs to read/notify `parent`/`accounts`, similar to why `parent` is its
   own module rather than living in `students` or `routes`)? `backend/CLAUDE.md`'s dependency
   rules say a genuinely new feature gets a new top-level module; a request table that only
   updates `Student` rows and is owned entirely by `students` methods may not need one.
4. **PATCH/PUT vs POST** for approve/reject, to match whichever convention the owner prefers
   elsewhere (the existing revoke/restore accounts endpoints use `PATCH`).
5. **Can a request be withdrawn by the parent**, and does an inactive student block approval?
   Flagged in [Deciding](#deciding).

## Changing this contract

This is a draft. Change it by pull request to this file (and the samples, once added), and get
the SCRUM-269 owner (Moustafa) to agree before anyone builds against it. The roster screen codes
against `AddressRequestsApi` in `frontend/src/lib/api/addressRequests.ts`, whose `addressRequestsApi`
is `null` until then (the screen shows a "Soon" placeholder, no fake data). The PR that merges the
real endpoints replaces that `null` with a `request()`-based client and updates the types there if
this page changed.
