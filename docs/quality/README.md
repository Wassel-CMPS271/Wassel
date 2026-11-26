# Test coverage (SCRUM-292)

Two numbers, published on every CI run and protected by a floor that never goes down.

## Definitions

| Number | What it is | Where it comes from |
|---|---|---|
| Backend line coverage | Lines run by the tests divided by all lines, over the whole backend | JaCoCo, `backend/target/site/jacoco/` (HTML and `jacoco.csv`) |
| Front-end line coverage | Lines run by the tests divided by all lines, over `frontend/src` (test files and `src/test-support/` left out) | Vitest with v8, `frontend/coverage/` (HTML and `coverage-summary.json`) |

Both are **line** coverage, so the two can be compared and are read the same way. Neither says the tests are good,
only which lines they run.

## Where to read them

- **Every CI run:** open the run, then Summary. `backend-build` and `frontend-build` each print their number
  ("Backend line coverage: ...", "Front-end line coverage: ..."). The full HTML reports are the `backend-coverage` and
  `frontend-coverage` artifacts of the same run.
- **Locally:** `./mvnw verify` in `backend/` (needs Docker), `npm run test:coverage` in `frontend/`.

## The floor

| | Reading on Day 1 (2026-11-22) | Floor (two points below) | Where it is set |
|---|---|---|---|
| Backend | 96.72% (3331 of 3444 lines) | 94.7% | `backend/pom.xml`, the `check` execution of the JaCoCo plugin |
| Front end | 88.58% (3763 of 4248 lines) | 86.6% | `frontend/vitest.config.mts`, `coverage.thresholds.lines` |

- Below the floor, `mvn verify` (backend) or `npm run test:coverage` (front end) fails, and so does the CI job, so the
  PR cannot merge.
- **The floor is never lowered.** If a change drops coverage, add the tests; do not edit the number. Raising it is
  allowed: change the value in the file above and add the new reading here in the same PR.
- New and changed code should be covered at 80% or better; that is checked in the PR, not by the floor.

## Daily readings

Add one row a day from the CI run on `develop` (Summary page), and the floor in force that day.

| Date | Backend | Front end | Note |
|---|---|---|---|
| 2026-11-22 | 96.72% | 88.58% | Day 1 reading, measured locally on `develop` (`dec60bc`) before the floor was added |
