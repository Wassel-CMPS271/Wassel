# Address requests contract (SCRUM-269)

A parent asks to change their child's pickup address; the head of transportation approves or rejects it. The school keeps the authoritative address: it changes only when a request is approved. Build against this page, not against each other's code. One school.

Agreed by Moustafa (SCRUM-269, owner of the endpoints). It replaces the draft that came with the SCRUM-275 screen (Majd); the shape and the head of transportation's three endpoints are the draft's, so that screen's types do not change.

## Conventions

- Cookie session, `credentials: "include"`, like every other endpoint.
- The school and the parent always come from the session, never from the request.
- Ids are UUIDs. `createdAt` and `decidedAt` are moments, ISO-8601 in UTC with a `Z`. Field names are camelCase.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).
- Samples are in [`samples/address-requests/`](samples/address-requests).

## Shapes

### AddressRequest

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | the request's own id, not the student's |
| `studentId` | uuid | |
| `studentName` | string | `firstName + " " + lastName` when the request was made |
| `currentAddress` | string or null | the student's saved address when the request was made; never re-read |
| `requestedAddress` | string | the address the parent asks for, trimmed, at most 255 characters |
| `requestedLat`, `requestedLng` | number or null | both set when the parent placed a pin, otherwise **both null**; always present |
| `requestedBy` | `{ parentUserId, email }` | the parent who sent it; `email` as it was then |
| `status` | `"pending"`, `"approved"` or `"rejected"` | |
| `createdAt` | moment | |
| `decidedAt` | moment or null | null while pending, set once |
| `rejectionReason` | string or null | only for a rejected request, and only if the head gave one |

## Endpoints

| Method | Path | Role | Body | Success | Owner |
|---|---|---|---|---|---|
| POST | `/api/parent/children/{studentId}/address-requests` | PARENT | `{ address, latitude?, longitude? }` | 201 `AddressRequest` (pending) | Moustafa, SCRUM-269 |
| GET | `/api/parent/children/{studentId}/address-requests` | PARENT | | 200 `AddressRequest[]`, newest first | Moustafa, SCRUM-269 |
| GET | `/api/head-of-transport/address-requests?status=` | HEAD_OF_TRANSPORT | | 200 `AddressRequest[]`, oldest first | Moustafa, SCRUM-269 |
| POST | `/api/head-of-transport/address-requests/{id}/approve` | HEAD_OF_TRANSPORT | none | 200 `AddressRequest` (approved) | Moustafa, SCRUM-269 |
| POST | `/api/head-of-transport/address-requests/{id}/reject` | HEAD_OF_TRANSPORT | `{ reason? }` | 200 `AddressRequest` (rejected) | Moustafa, SCRUM-269 |

## Rules

### Submitting

- Only the parent linked to the child. Another parent's child, another school's and an unknown id are one 404, like the absences endpoints.
- `address` is required, trimmed, at most 255 characters. `latitude` and `longitude` are both given or both left out (a pin for the new address, -90..90 and -180..180).
- **One pending request per child.** A second one while the first is pending is 409, for any parent, so a child never has two competing requests. After it is decided, a new one can be sent.
- An inactive child cannot have a request (409).
- A request that asks for the saved address again (ignoring case and surrounding spaces) with no pin changes nothing and is 400 on `address`.

### Listing

- A parent sees only the requests **they** sent for that child, all statuses, newest first.
- The head of transportation sees their school's requests with the given `status` (`pending` when omitted), oldest first. An unknown `status` is 400 on `status`.

### Deciding

- Approve and reject are each a one-way move from `pending`. A request that is not pending is 409 and nothing changes, including the same decision again. There is no undo.
- **The student's address and pin do not change while a request is pending or after it is rejected.**
- **Approve saves the address in the same transaction**, the way the head's own address edit does (`PATCH .../students/{id}/address`): it is geocoded unless the student has a manual pin. If the request has a pin, the pin is saved too and becomes a manual pin. If saving fails, the request stays pending. A geocoder that finds nothing for the address, or cannot be reached, is **not** a failure, as with the head's own edit: the address is saved, the request is approved, and a pin that is not manual is cleared, because it would otherwise point at the old address. The head then places the pin by hand. Send a pin with the request if the parent can give one.
- Approving a request whose child has become inactive is 409 and the request stays pending (reject it). Rejecting needs no check.
- `reason` is optional free text, at most 255 characters. Blank means none.
- Only the head of transportation of the request's school. Another school's request is a 404, never a 403.

## Errors

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` |
| A child that is not the parent's, a request of another school, an unknown id | 404 | `detail` |
| Invalid `address`, `reason`, pin or `status` filter | 400 | `errors: { field: message }` |
| A body that is not JSON | 400 | `detail: "Malformed request body"` |
| An id in the path that does not parse | 400 | `detail: "Invalid request parameter"` |
| The child already has a pending request | 409 | `detail` |
| The child is not active | 409 | `errors: { studentId: message }` |
| Approve or reject a request that is not pending | 409 | `detail`, naming the status and `decidedAt` |

## Known limits

- **A manual pin stays on approval.** If the student already has a manual pin and the request has none, the address changes and the old pin stays, as it does when the head edits the address. The head corrects the pin.
- **Parent changes.** A pending request stays with the parent who sent it if the child is later linked to another parent; the new parent cannot see it, but it still blocks a new request until the head decides it.
- No withdrawing by the parent, no notification, no history screen.

## Changing this contract

Change it by pull request to this file and the samples together, and tag Moustafa and Majd.
