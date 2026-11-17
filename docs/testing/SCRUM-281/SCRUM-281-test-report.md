# SCRUM-281 — Parent address-change request and attendance history UI

**Owner:** Wassim Fawaz · **Sprint:** 4 · **Scope:** stretch, 4 points

## What is implemented

- Each linked child has an **Address changes & attendance history** link from the parent Home card, even without an assigned route.
- A separate parent-only route, /parent/children/[studentId]/records, verifies the selected child against the authenticated /api/parent/children list. An unlinked id never triggers a child-specific read.
- Address-change form and newest-first request status from the real SCRUM-269 API. Pending, approved and rejected requests and optional reason/decision timestamps are shown. A requested address is never labelled as the saved pickup address. An existing pending request prevents a second POST.
- A request accepts an address (trimmed, 1–255 characters) and optional latitude/longitude as a pair. 400/409, validation, loading, empty, retry, 401/403/404 and network errors are handled without inventing a successful request.
- Read-only attendance rows from the real SCRUM-265 API, with inclusive required school-local from/to dates, maximum 62 days, latest status and server-recorded timestamps. Corrections retain earlier recorded statuses. Reported absences are separate.
- Uses the existing parent RoleGuard and backend cookie-session ownership for every read/write. Access loss unmounts both panels so stale private data is not shown.
- Mobile layout uses one-column content and existing 44px-target input/button styles.
- No backend, contract, teammate-branch or Jira status modification.

## Accepted dependencies

SCRUM-269 / PR #145; SCRUM-265 / PR #157. Both are merged in develop.

Sources: docs/contracts/address-requests.md and docs/contracts/attendance.md and accepted samples.

## Added tests

- parentTransportRecords.test.ts: authenticated paths, optional pin, invalid/malformed data, 400/409/401/403/404/500, date boundaries, empty state, recorded correction.
- ParentTransportRecordsPage.test.tsx: owned and unlinked child, pending status, submission/retry, invalid coordinates, inclusive date range, recorded correction, authorization loss, sign-in, empty/error states.

## Validation and remaining gates

- [ ] GitHub CI full frontend regression, lint and build
- [ ] Real PostgreSQL/Flyway browser checks with two parents, address submission, Head approval/rejection, dated attendance
- [ ] Independent Majd review and tests
- [ ] Update from latest develop and merge after green checks
- [ ] Jira completion only after actual merge and scope acceptance

**Known contract limits:** The parent child-list API does not expose the authoritative saved pickup address, so the view only shows each requested address and its decision status. Offline app-shell availability and a map-based pin picker are not part of this change. Optional pin coordinates can be entered directly.

**Stretch approval:** Jira originally kept this ticket To Do pending a scope pull-in. The owner requested implementation on 17 November; keep the PR Draft and do not mark Jira Done before team/release acceptance.
