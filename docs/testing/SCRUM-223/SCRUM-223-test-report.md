# SCRUM-223: independent tests of the connected screens

## What was added

Frontend tests for the five screens connected to the real backend: vehicles, drivers and students (head of transport), school times and calendar (admin). The screens are Wassim's and Mohamad's; the tests were written separately by Majd, from what each screen should do (the ticket, the backend's contract and its real error messages), not copied from the components. Every backend call is mocked at the `lib/api` module (page tests) or at `fetch` (API module tests), as `frontend/CLAUDE.md` says.

| File | Tests | Skipped |
|---|---|---|
| `head-of-transport/vehicles/page.test.tsx` | 10 | 2 |
| `head-of-transport/drivers/page.test.tsx` | 8 | 2 |
| `head-of-transport/students/page.test.tsx` (5 already there, 5 added) | 10 | 2 |
| `head-of-transport/students/AddStudentForm.test.tsx` | 4 | 0 |
| `head-of-transport/students/ImportStudentsForm.test.tsx` | 5 | 0 |
| `admin/school-times/page.test.tsx` | 4 | 0 |
| `admin/calendar/page.test.tsx` | 7 | 1 |
| `lib/api/vehicles.test.ts` | 6 | 0 |
| `lib/api/drivers.test.ts` | 6 | 0 |
| `lib/api/students.test.ts` | 27 | 0 |
| `lib/api/parents.test.ts` | 10 | 0 |

Each skipped test is a finding (see below). It is written as the test that should pass, with a `BUG` or `NOT BUILT` comment above it, so un-skipping it is the check once the fix lands.

### Cleanup in the review

- **Duplicates removed.** The API module tests repeated `client.test.ts`: "network failure rejects as it is" (4 files) and "a non-2xx without `errors` is an `ApiError`" (3 files). Removed; each module keeps one test that its own error comes back as `ApiValidationError`, like the existing `schoolTimes.test.ts`. On the pages, the driver's duplicate-phone test ran the same code path as duplicate-email, and the vehicle form's backend capacity error can't be reached (the form rejects any capacity the backend would), so both were dropped.
- **Tests that only mirrored the code removed.** `StudentFilters.test.tsx` checked that each control calls its prop. Replaced by two page tests of what the user sees: searching narrows the roster (and says when nothing matches), and the status filter hides the other students.
- **Weak or wrong assertions fixed.** The driver assignment conflict was mocked as a plain `ApiError(409)`, but the backend sends a 409 with `errors.vehicleId`; the test now uses that shape. Field errors use the backend's real messages (`GlobalExceptionHandler` and the services). Field-error checks wait for the message rather than reading the input once. The calendar and school times toasts are checked as `role="status"`, like the other screens.
- **Added.** Students: a successful add through the page, and the "created, but the address was not saved" case. Calendar: the half-day list's load error and retry.

## Acceptance criteria

| Criterion | How it is met |
|---|---|
| Written independently of each screen's author | Tests by Majd, screens by Wassim and Mohamad. Expectations come from the behaviour and the backend's contract; where a screen disagrees, the test is skipped with the finding, not changed to match |
| Loading and error states | Every screen: a `role="status"` loading message with no list, and a `role="alert"` when the load fails. Retry is tested where it exists (school times, holidays, half-days) and is a skipped `BUG` test where it doesn't (vehicles, drivers, students) |
| A successful add or save | Vehicles add, capacity edit, deactivate, reactivate; drivers add, assign, unassign; students add (with and without the address saved), pin save, CSV import; school times save; holiday add; half-day add. Each checks the call, the list and the confirmation |
| A backend validation error next to its field | Vehicles: duplicate plate, capacity edit. Drivers: duplicate email. Students: duplicate student on guardian phone. School times: dismissal. Calendar: holiday date, half-day date. Each checks the input's accessible description and `aria-invalid` |
| Run in CI | `.github/workflows` job `frontend-build` runs `npm ci`, `npm run lint`, `npm test`, `npm run build` in `frontend/`; `npm test` is `vitest run`, which picks up every `*.test.ts(x)` |

## Do the tests fail when the screens break?

Each line was broken on its own, the screen's tests run, then the file restored with `git checkout`.

| Production line broken | Test that went red |
|---|---|
| Vehicles: loading message never shown | `shows a loading status while the vehicles load` |
| Vehicles: backend plate error not passed to the field | `shows the backend's duplicate plate error next to the plate field…` |
| Vehicles: added vehicle not put in the list | `adds a vehicle to the list, resets the form and confirms it` |
| Drivers: added driver not put in the roster | `adds a driver to the roster, resets and closes the form…` |
| Drivers: backend email error not passed to the field | `shows the backend's duplicate email error next to the email field…` |
| Drivers: assignment conflict shows the generic message | `shows the backend's message when assigning a vehicle is refused…` |
| Students: added student not put in the roster | both add tests |
| Students: load error not shown | `shows an error when the students fail to load` |
| Students: filters ignored | `narrows the roster as the user searches…`, `filters the roster by status` |
| Students: backend duplicate error dropped | `shows a duplicate-student 409 next to the guardian phone field…` |
| School times: backend field error dropped | `shows a backend validation error next to the dismissal field` |
| School times: Try again does nothing | `shows an error with a retry when the times fail to load` |
| School times: no save confirmation | `saves the arrival and dismissal times and confirms it` |
| Calendar: holidays Try again does nothing | `shows an error with a retry when the holidays fail to load` |
| Calendar: half-days Try again does nothing | `shows an error with a retry when the half-days fail to load` |
| Calendar: backend holiday date error dropped | `shows a backend validation error next to the holiday date field` |

16 of 16 broken lines were caught, each by the test meant for it and no other. The 7 skipped tests were also run un-skipped once: each fails for the reason in its comment (no "Try again" button, no "Deactivate", no "Delete", `getStudents` never called again, "Request failed" instead of a sign-in message).

## Findings

### 1. BUG: vehicles, drivers and students offer no retry after a failed load

All three show "Couldn't load … Please try again." but have no retry control, and nothing calls the API again; only reloading the whole page recovers. The pages already have a `loadVehicles` / `loadDrivers` / `loadStudents` callback, so the fix is a "Try again" button calling it, as the others do.

The routes page, the school times page and the calendar page (holidays and half-days) do have a working "Try again". No other screen has the gap: the route detail page has "Try again", the parents page "Retry parent list", the student's parent picker "Retry parents", and the route form dialog says "Close this and try again", which works because the dialog is unmounted on close and loads again when reopened.

Reproduce: start the frontend with the backend stopped (or block `/api/head-of-transport/vehicles`), open Vehicles, Drivers or Students, then start the backend. The alert stays and there is no control to reload. Tests: the skipped `shows an error with a retry when the … fail to load` in each of the three page tests.

### 2. DESIGN OBSERVATION, not a bug: the students screen filters in memory

Search, status and grade filter the roster loaded once on mount (`matchesFilters` in `page.tsx`) and never ask the backend, although `getStudents()` in `students.ts` takes those filters and builds the query string. SCRUM-223's criteria don't require backend filtering and the in-memory filter works (tested). SCRUM-66 (filter students by route) will need it, because the route a student is on is the backend's to answer. Test: skipped `asks the backend for filtered results instead of filtering the loaded roster in memory`.

### 3. NOT COVERED: features not built

- **Deactivate a driver.** `Driver["status"]` allows `"deactivated"`, but there is no `deactivateDriver` in `drivers.ts`, no Deactivate control in `DriverListItem`, and no backend endpoint (`DriverController` has list, add, resend-invite, and assign/unassign vehicle). Test: skipped `deactivates a driver after confirming, and announces it`.
- **Delete a holiday.** The backend endpoint exists, `DELETE /api/admin/school-calendar/holidays/{id}` (SCRUM-214, PR #62), but `holidays.ts` has no delete call and `HolidayListItem` has no control. The frontend is what is missing. Test: skipped `deletes a holiday after confirming, and announces it`.
- **Delete a half-day.** Not covered and not testable: `HalfDayController` has only GET and POST, so there is no endpoint to call.

### 4. Other bug: an expired session shows "Request failed"

The backend answers an unauthenticated request with a 401 and an empty body (`HttpStatusEntryPoint`), so `ApiError.message` is the fallback "Request failed". `AddVehicleForm` and the vehicle capacity editor show any status below 500 as `error.message`, and so does the drivers page's `failureMessage` (assign, unassign, resend invite). The user sees "Request failed" and is not told to sign in. `AddDriverForm`, `AddStudentForm` and the parents screens handle 401 themselves.

Reproduce: sign in as head of transport, open Vehicles, delete the `wassel_token` cookie in the browser's dev tools (or wait for the session to expire), then add a vehicle. The form shows "Request failed". Test: skipped `tells the user to sign in again when the session has expired` in the vehicles page test; un-skipped, it receives "Request failed".

## Result

| Check (in `frontend/`) | Outcome |
|---|---|
| `npm run lint` | no errors, no warnings |
| `npx tsc --noEmit` | no errors |
| `npm test`, run 1 | 321 passed, 1 failed, 7 skipped: the flaky route detail test below |
| `npm test`, runs 2 and 3 | 322 passed, 0 failed, 7 skipped |
| `npm run build` | builds every route |

**Flaky test seen.** `routes/[routeId]/page.test.tsx` › `focuses the error heading when Try again fails again` failed once in the review's baseline run and once in the final first run (`expect(heading).toHaveFocus()` timing out), and passed on every re-run. It is outside this ticket's screens and was not changed; it is the known route page flakiness. No test written for this ticket failed in any run.

## Not covered

- **Features not built:** driver deactivation, holiday delete in the frontend, half-day delete (see finding 3).
- **The real backend.** Every test mocks the API; the backend's own tests cover its rules. No browser or Playwright run was done.
- **Visual design.** Colors, spacing and motion are not asserted; motion is only relevant in that list items leave through an exit animation, which the tests wait for.
- **Students' edit form (`EditStudentForm.tsx`)** is not imported anywhere (the list shows "Other edits and status changes coming soon"), so there is nothing on screen to test. The pickup address and pin editor that is used (`EditStudentAddressForm`) has its own existing tests.
- **Keyboard focus moves** on the vehicles and drivers rows (`VehicleListItem`, `AddDriverForm`) are only checked where an existing test already did (the add-student dialog returns focus to its trigger).
