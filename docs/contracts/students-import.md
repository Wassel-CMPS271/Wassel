# Students import contract (SCRUM-59)

**Status: PROPOSED, not implemented.** Nothing on this page exists in the backend yet: today the CSV import screen calls the single create (`POST /api/head-of-transport/students`) once per row. This page is the shape both sides agree on before the endpoint is built.

The head of transportation imports many students from a file in one request and gets a result for every row. Build against this page, not against each other's code. One school.

Owner: to be agreed with the backend owner of the `students` module (Moustafa or Hashem). Consumer: the head of transportation's students screen, CSV import (SCRUM-59, Majd).

## Conventions

- Cookie session, `credentials: "include"`, like every other endpoint. For a signed-in **head of transportation** only; the school comes from the session, never from the request.
- JSON in and out, camelCase. The browser reads the file; the server never receives the CSV itself.
- Ids are UUIDs. `createdAt` is a moment, ISO-8601 in UTC with a `Z`.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).
- Samples are in [`samples/students-import/`](samples/students-import).

## Endpoints

| Method | Path | Role | Body | Success |
|---|---|---|---|---|
| POST | `/api/head-of-transport/students/import` | HEAD_OF_TRANSPORT | `ImportRequest` | 200 `ImportResult` |

200 and not 201: a well-formed request may create nobody.

## Shapes

### ImportRequest

`{ "students": ImportRow[] }`, [sample](samples/students-import/request.json). From 1 to 500 rows; the limit counts the rows **sent**, not the rows of the file.

### ImportRow

| Field | Type | Notes |
|---|---|---|
| `row` | integer, 1 or more | the **line of the file the record starts on** (the header is line 1, so the first data row is 2; blank lines are counted; a record whose quoted cell spans several lines has the number of its first line). Unique within the request. Echoed back, so the screen can say "Row 7". The server does not read it otherwise. |
| `firstName` | string | as single create |
| `lastName` | string | as single create |
| `grade` | string | as single create |
| `guardianName` | string | as single create |
| `guardianPhone` | string | as single create |

There is **no `address` in this version** (see [Known limits](#known-limits) and [Open questions](#open-questions-for-the-backend-owner)). The frontend sends exactly these six fields and nothing else. What the server does with a field it does not know is an open question.

### ImportResult

[Samples](samples/students-import): `response-all-created.json`, `response-partial.json`, `response-all-rejected.json`.

| Field | Type | Notes |
|---|---|---|
| `created` | integer | how many results have `status: "created"` |
| `rejected` | integer | how many results have `status: "rejected"` |
| `results` | `RowResult[]` | exactly one per request row, **in request order** |

`created + rejected` is always the number of rows sent.

### RowResult

| Field | Type | Notes |
|---|---|---|
| `row` | integer | the `row` that was sent for it |
| `status` | `"created"` or `"rejected"` | |
| `student` | `Student` | only when `created`: the roster's `Student` shape, as `GET /api/head-of-transport/students` returns it (`status: "active"`, `address`, `latitude`, `longitude`, `route` and `parentUserId` null) |
| `errors` | `{ field: message }` | only when `rejected`: the same field-keyed map single create puts in its 400/409 body, one message for every field that failed |

A result has `student` or `errors`, never both and never neither.

**The keys of `errors` are only ever `firstName`, `lastName`, `grade`, `guardianName` and `guardianPhone`**: never `row`, never `address`. A duplicate is reported under `guardianPhone`, as single create reports it.

## Rules

### Validation of each row

Each row is checked exactly as single create checks its body, `CreateStudentRequest` (`backend/src/main/java/com/wassel/backend/students/dto/CreateStudentRequest.java:14-33`):

- Every value is trimmed first, so surrounding spaces never fail a check and are never saved.
- `firstName`, `lastName`, `grade`, `guardianName` and `guardianPhone` are required (not missing, not blank). Messages: `"First name is required"`, `"Last name is required"`, `"Grade is required"`, `"Guardian name is required"`, `"Guardian phone is required"`.
- `guardianPhone` must match `^\+961 \d{1,2} \d{3} \d{3}$`: `+961`, a 1-2 digit prefix, then two groups of 3 digits, single spaces between (`"+961 3 123 456"`, `"+961 70 234 567"`). Message: `Use a format like "+961 3 123 456" or "+961 70 234 567"`.
- **One message per field, and "is required" wins.** A missing or blank value gets only its "is required" message, never a format or length message too. This matters for `guardianPhone`: a blank phone also fails the pattern, and today the handler keeps whichever violation comes first (`putIfAbsent`, `GlobalExceptionHandler.java:80-82`), an order Bean Validation does not guarantee. How the backend makes "is required" win is an open question.

**Length limits (required for single create and for import).** The `students` columns are `first_name`, `last_name`, `guardian_name` `varchar(100)`, `grade` `varchar(50)` and `guardian_phone` `varchar(30)` (`V1__baseline_schema.sql:75-79`). Both endpoints must reject a longer value as a field error instead of reaching the database:

| Field | At most | Message (proposed, in the style of `address`'s) |
|---|---|---|
| `firstName` | 100 | `"First name must be 100 characters or fewer"` |
| `lastName` | 100 | `"Last name must be 100 characters or fewer"` |
| `guardianName` | 100 | `"Guardian name must be 100 characters or fewer"` |
| `grade` | 50 | `"Grade must be 50 characters or fewer"` |
| `guardianPhone` | 30 | already implied by the pattern (at most 15 characters), so a long phone gets the format message; stated so the rule does not depend on it |

Today single create has no such check, so a 101-character name is a database error and a 500 (`"An unexpected error occurred"`). Adding the limits to `CreateStudentRequest` fixes single create and gives import the same rule; see open question 5.

A row with field errors is `rejected` with all of them. Its duplicate check is not run.

### Duplicates

The rule is single create's (`backend/src/main/java/com/wassel/backend/students/service/StudentService.java:93-98`): two students are the same when they are in the same school, have the same first name and the same last name **in any letter case**, and the same guardian phone (exact, after trimming). The grade and the guardian name do not count.

- **Already in the roster** (any status, archived included, as for single create): `rejected` with `errors.guardianPhone` = `"A student named <firstName> <lastName> with guardian phone <guardianPhone> already exists."`, the single-create text, with the names as this row sent them (trimmed).
- **Repeated inside the request.** Rows are taken in request order, and only rows whose fields are valid are compared. The first copy is judged on its own: created if it is new, rejected if it is already in the roster. Every later copy is `rejected` with `errors.guardianPhone` = `"Same student and guardian phone as row <N>."`, where `<N>` is the `row` of the first copy, whatever happened to that copy.
- **Re-sending the same file creates nobody.** Every row created the first time is now in the roster, every other row fails as before. This is what makes a retry after a lost answer safe.

### Partial success

- **Each row stands alone.** A row that fails validation or is a duplicate is `rejected` and does not stop, delay or change any other row. The answer is 200 whenever the request itself is well formed, even when every row is rejected.
- **How the created rows are saved is to be agreed** (open question 3): together in one transaction, or each on its own. Whichever is chosen, a 200 means every `created` row is saved and no `rejected` row is.
- New students are `active`, on no route, with no address and no pin, exactly like a single create without an address. The roster lists students oldest first as usual; the order of the imported students **among themselves** is to be agreed with the backend owner (open question 9).

### Well-formed request

A request is malformed, and answered 400 with **nothing** created and no `results`, when any check below fails. They run in this order and the first one that fails is the answer, so the 400 carries one message:

1. **The body.** It is not JSON, `students` is not an array, or a row is a value other than an object or `null` (`detail: "Malformed request body"`, the existing handler for an unreadable body). Which wrongly typed values actually reach this handler, and which are converted instead, is unverified (open question 7).
2. **The row count.** `students` is missing, empty, or has more than 500 rows: `errors.students` = `"Import between 1 and 500 students at a time."`.
3. **The row numbers.** A row is `null`, has no `row`, or has a `row` below 1: `errors.students` = `"Every row needs a row number of 1 or more."`.
4. **Repeated row numbers.** Two rows have the same `row`: `errors.students` = `"Row <N> appears more than once."`, where `<N>` is the first repeated one: going through the rows in request order, the number of the first row whose number was already used.

Problems with a row's **fields** never make the request malformed: they make that row `rejected` (see [Row rejections](#row-rejections)).

## Errors

The request as a whole fails, nothing is created and there are no `results`.

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` |
| A body that is not JSON, `students` not an array, a row that is not an object | 400 | `detail: "Malformed request body"` |
| `students` missing, empty, or more than 500 rows | 400 | `errors: { students: "Import between 1 and 500 students at a time." }` ([sample](samples/students-import/response-400.json)) |
| A row that is `null`, has no `row`, or has a `row` below 1 | 400 | `errors: { students: "Every row needs a row number of 1 or more." }` ([sample](samples/students-import/response-400-row.json)) |
| Two rows with the same `row` | 400 | `errors: { students: "Row <N> appears more than once." }` ([sample](samples/students-import/response-400-repeat.json)) |
| Unexpected failure | 500 | `detail: "An unexpected error occurred"`; which rows, if any, were saved depends on open question 3, so the client treats it like a lost answer |

400 bodies use the `"Validation failed"` `detail` and the `errors` map of the existing validation handler, so the frontend's `request()` raises them as `ApiValidationError` (any answer with an `errors` map) and the others as `ApiError`. The three `errors.students` messages are proposed text.

## Row rejections

The request succeeds (200) and only that row is `rejected`, with these `errors`:

| Case | `errors` |
|---|---|
| A required field missing or blank | `{ <field>: "<Label> is required" }`, the only message for that field |
| A guardian phone in the wrong format | `{ guardianPhone: "Use a format like \"+961 3 123 456\" or \"+961 70 234 567\"" }` |
| A value longer than its column | `{ <field>: "<Label> must be <n> characters or fewer" }` |
| Already in the roster | `{ guardianPhone: "A student named <firstName> <lastName> with guardian phone <guardianPhone> already exists." }` |
| A repeat of an earlier row of the request | `{ guardianPhone: "Same student and guardian phone as row <N>." }` |

`<field>` is one of the five keys above and `<Label>` its label: First name, Last name, Grade, Guardian name, Guardian phone.

## Samples

[`request.json`](samples/students-import/request.json) is a file with a header on line 1, two good rows (2 and 3), a blank line 4, then a bad phone (5), a repeat of row 2 in another letter case (6), a student already in the roster (7, Tarek Mansour of [`roster/student-paused.json`](samples/roster/student-paused.json), who is paused) and a row with no first name and a blank grade (8). **The frontend never sends a row like 8**: its preview drops rows with a missing field before the request. Row 8 is there to show what the server does with one.

- [`response-partial.json`](samples/students-import/response-partial.json): the first time `request.json` is sent. Rows 2 and 3 are created; 5, 6, 7 and 8 are rejected.
- [`request-all-created.json`](samples/students-import/request-all-created.json) and [`response-all-created.json`](samples/students-import/response-all-created.json): rows 2 and 3 of `request.json` alone, sent to a school that has neither student yet. This is the same moment as `response-partial.json` seen from a smaller file, so the two students have the same ids.
- [`response-all-rejected.json`](samples/students-import/response-all-rejected.json): `request.json` sent a second time, after `response-partial.json`. Rows 2 and 3 are now already in the roster, row 6 still names row 2, and nobody is created.
- [`response-400.json`](samples/students-import/response-400.json): a request with 501 rows.
- [`response-400-row.json`](samples/students-import/response-400-row.json): a request in which one row has no `row`.
- [`response-400-repeat.json`](samples/students-import/response-400-repeat.json): a request whose rows are numbered 2, 3, 3 and 4.

## How the frontend uses it

- The screen parses the CSV in the browser (header row naming the five columns, any order, extra columns ignored), keeps the line each record starts on as `row`, and shows the preview with its own checks (missing fields) before any request.
- It sends the rows that pass those checks in one `POST`, through `importStudents` in `frontend/src/lib/api/students.ts` (`request()`, never `fetch` directly). If there would be more than 500 of them it sends nothing and asks for a smaller file.
- The results step shows "N students added." and one list of every row that did not make it, sorted by `row`: the server's `rejected` results with each field's message (the key mapped to its label), and the rows the preview skipped, e.g. `Row 5 · Rami Aziz — Guardian phone: Use a format like …`.
- After a 200 it reloads the roster with `GET /api/head-of-transport/students`, so what the head of transportation sees is the server's list.
- A 400 shows its `errors.students` message and leaves the preview as it was.
- A 401, 403 or 500 follows the general rule of `frontend/CLAUDE.md` ("API calls"): forms say "Something went wrong. Please try again." for anything they don't handle by status. The screen handles none of these three by status.
- **A network failure or a timeout may or may not have created the rows**: the server may have saved them and only the answer was lost. The same is true of a 500 until open question 3 is settled. Sending the file again is still safe, because of the duplicate rule: nothing is created twice. But rows saved by the lost attempt then come back as "already exists", so after such a retry the screen must say that rows marked "already in the roster" may have been added by the attempt that failed.
- Until this endpoint is merged the screen keeps calling single create once per row; the frontend's API rules allow no sample client for it.

## Known limits

- **No address.** Single create geocodes an address inside its transaction, at most one lookup a second with a 5 s timeout (`geocoding` module); 500 addresses would hold a connection for minutes. Addresses are set afterwards, per student, as today.
- **The duplicate check is read-then-write**, as for single create: two imports of the same rows at the same moment could both create them. No unique index backs it.
- **One phone, two spellings.** The pattern accepts a prefix with or without its leading zero, so `"+961 3 222 111"` and `"+961 03 222 111"` are both valid and are different phones to the duplicate rule: the same student entered both ways is not treated as a duplicate, by import or by single create.
- **No dry run.** The preview is the browser's; the server's checks happen only on the real request.
- **No undo.** A created row is an ordinary student; archive it to take it back.

## Open questions for the backend owner

1. **Validator per row, not `@Valid` on the list.** `@Valid` on `List<ImportRow>` makes one bad row a 400 for the whole request (`MethodArgumentNotValidException`, keys like `students[3].firstName`). The proposal is an injected `jakarta.validation.Validator` run on each row, reusing `CreateStudentRequest`'s constraints and messages, so that row alone is `rejected`. Agree, or propose another way to get one result per row.
2. **"Is required" wins over the format message.** How will the backend guarantee it for a blank `guardianPhone` (and for the length checks once they exist)? For example a validation group sequence (required first, format and length second), or keeping the "is required" violation when a field has several. It should hold for single create too, so the two never disagree.
3. **One transaction or one per row.** Save the created rows together in one transaction (an unexpected failure is a 500 and saves nobody), or each row on its own (a failure partway saves the rows before it)? The frontend treats a 500 like a lost answer either way. **Whichever is chosen, a unique-constraint conflict at insert** (possible only if the index of question 4 is added, when another request created the same student in between) must not fail the batch: that row is `rejected` with the "already exists" message and the other rows are not affected. In one PostgreSQL transaction that needs a savepoint per row or an `INSERT ... ON CONFLICT DO NOTHING`, because a failed statement aborts the whole transaction.
4. **One batch duplicate query, and an optional unique index.** Instead of one `existsBySchoolIdAndFirstNameIgnoreCaseAndLastNameIgnoreCaseAndGuardianPhone` per row, one query for the school's keys among the request's phones. It must compare letter case exactly as the derived query does today, so single create and import never disagree. Separately: add a unique index on `(school_id, lower(first_name), lower(last_name), guardian_phone)` to close the race in Known limits? It needs a migration and a check that existing data has no duplicates, and its conflicts are handled as in question 3.
5. **The length limits change single create.** Today a too-long value on `POST /api/head-of-transport/students` is a 500; with the limits it becomes a 400 with `errors.firstName` (and so on). That is a change to an existing endpoint, so it should land in the same backend PR as import, with a test for single create, and the add-student form (`AddStudentForm.tsx`) must show the new field errors next to their fields. Agree?
6. **Addresses and the geocoding rate.** Keep "no address" for this version, or accept an address and save it without a lookup, leaving the pin to the existing flow? And should a row that does send `address` be ignored or rejected? If the row type reuses `CreateStudentRequest` as it is, an `address` would be bound and geocoded, which this page does not allow.
7. **Wrong types and unknown fields (unverified).** The app has no Jackson settings of its own, so the defaults of Spring Boot 4.1 apply, and other endpoints have found that they convert values instead of refusing them (backend `CLAUDE.md`: the SCRUM-268 and SCRUM-261 coercion findings). For this endpoint, which of these is a 400 `"Malformed request body"` and which is converted or accepted: `"students": ""`, `"students": {}`, a single object instead of an array, `"row": "5"`, `"row": 5.5`, `"firstName": 123`, `"firstName": true`? And is an unknown field (an `address`, a typo) ignored or a 400? This page says `row` is an integer and the frontend sends only the six fields; the answers decide whether that is enforced.
8. **Role-access test row.** Add `POST /api/head-of-transport/students/import` as `HEAD_OF_TRANSPORT_ONLY` to `RoleAccessMatrixTests` in the same PR, with a valid one-row body in `VALID_BODIES` (otherwise a caller without the role gets 400 before 403).
9. **Order of the imported students in the roster.** They are listed oldest first with everyone else, by `createdAt` (`@CreationTimestamp`); among themselves, is that request order (so file order), or unspecified? The frontend sorts nothing itself.
10. **The proposed message texts** (length limits, the three `errors.students` messages, the in-file duplicate) are suggestions; change them here before building if you prefer others.
11. **The 500-row cap.** Chosen so a request stays quick without addresses; raise or lower it if the insert and duplicate query say otherwise.

## Changing this contract

Change it by pull request to this file and the samples together, and tag the backend owner of the `students` module (Moustafa or Hashem, once agreed) and Majd (the import screen). When the endpoint is built, replace the status line with the PR that implements it.
