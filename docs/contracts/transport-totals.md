# Transport totals contract (SCRUM-271)

How many runs were driven and how many students were picked up, dropped off, not present or absent, day by day over a date range, and the same figures as a CSV file. Build against this page, not against each other's code. One school.

Owner: Moustafa (SCRUM-271). It covers the stories "see how many students use transport" and "export a report" for the head of transportation (SCRUM-93, SCRUM-95).

## Conventions

- Cookie session, `credentials: "include"`. Both endpoints are for the signed-in **head of transportation**; the school comes from the session, never from the request.
- Dates are `"YYYY-MM-DD"`, the school's day in `Asia/Beirut` (the same days as the runs). Field names are camelCase.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).
- Samples are in [`samples/transport-totals/`](samples/transport-totals).

## Shapes

### TransportTotals

| Field | Type | Notes |
|---|---|---|
| `from`, `to` | date | the range that was used, both days included |
| `studentsOnRoutes` | number | active students on a route **when the request is made**. It is the roster now, not a figure of the range, and is not in the CSV |
| `total` | `Figures` | the days added up |
| `days` | `DayTotals[]` | every date of the range in order, with zeros when nothing happened |

### DayTotals (and Figures, without `date`)

| Field | Type | Notes |
|---|---|---|
| `date` | date | |
| `runs` | number | the day's runs that exist (morning and afternoon, per route) |
| `runsFinished` | number | of those, in state `FINISHED` |
| `pickedUp` | number | students picked up on a run that day, **including those since dropped off** |
| `droppedOff` | number | students dropped off on a run that day |
| `notPresent` | number | students whose latest status on a run that day is not present (one later picked up on that run is not counted here) |
| `absent` | number | students with a live absence covering the day (cancelled ones are not counted) |

Each student counts **once a day** in `pickedUp`, `droppedOff`, `notPresent` and `absent`, however many runs they were on. `total` is the sum of the days, so a student on three days counts three times (student-days); it is not a count of different students in the range.

## Endpoints

| Method | Path | Role | Success |
|---|---|---|---|
| GET | `/api/head-of-transport/transport-totals?from=&to=` | HEAD_OF_TRANSPORT | 200 `TransportTotals` |
| GET | `/api/head-of-transport/transport-totals/export?from=&to=` | HEAD_OF_TRANSPORT | 200 `text/csv`, an attachment |

## Rules

### The range

- `from` defaults to today and `to` defaults to `from`, so no parameters is today.
- `to` before `from` is 400 on `to`. A range of more than **62 days** (both ends included) is 400 on `to`. A date in the future is allowed and is all zeros.
- A date that is not `"YYYY-MM-DD"` is 400.

### The figures

- They are read from what was stored: the runs and the drivers' confirmations as they were saved, and the absences as they are now. A run nobody opened has no row and counts as nothing.
- A student's status on a run is their **latest** one (the highest: not present, then picked up, then dropped off), as everywhere else.
- Only the head's own school is read. Another school's runs, confirmations and absences are never counted.

### The export

- The same figures, from the same call, as JSON: a header row, a row for every date, then a `TOTAL` row. Columns: `date,runs,runsFinished,pickedUp,droppedOff,notPresent,absent`. Numbers and dates only, rows end with CRLF, UTF-8.
- The file is named `wassel-transport-<from>_<to>.csv`.
- `studentsOnRoutes` is not in the file.

## Errors

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` |
| `to` before `from`, or more than 62 days | 400 | `errors: { to: message }` |
| A date that does not parse | 400 | `detail: "Invalid request parameter"` |

## Known limits

- **Not a count of different students over a range.** `total` adds days up. Different students over a range is a new figure.
- **Past rosters are not stored.** A run keeps no list of its students, so there is no "students on routes" for a past day; `studentsOnRoutes` is only the roster now.
- **A student who is later removed from the route** still counts on the days they were on a run.
- **No per-route or per-driver breakdown, no admin access.** The admin has no school-scoped reports yet.

## Changing this contract

Change it by pull request to this file and the samples together, and tag Moustafa and the owner of any screen that shows the totals.
