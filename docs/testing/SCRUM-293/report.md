# SCRUM-293 (S5-G): load test for a normal school, report

How to run it again: [`loadtest/README.md`](../../../loadtest/README.md). Raw output of the run below:
`summary-2026-11-22-sunday.json` and `docker-stats-2026-11-22-sunday.txt` in this folder.

## Result in one line

**Run 1 (Sunday 22 November 2026, 10 minutes, 300 users, 100 sign-ins in one minute): every threshold passed**, with
zero 5xx answers, but it was run on a Sunday, which the backend treats as a holiday, so it did **not** exercise the
bus-position and driver-location paths. **Run 2, on a weekday, is still to do** and decides whether the ticket's
"p95 under 1 s" is shown for the real morning peak.

## What was run

| | |
|---|---|
| Script | `loadtest/load.js` (k6 1.0.0), commit of this PR |
| School | 1,000 students, 40 buses and drivers, 40 routes, 800 parent accounts (`loadtest/seed.sql`) |
| Parents | 260 at once, polling their child's bus every 5.5 to 6.5 s, a few also the inbox (about 43 requests a second) |
| Drivers | 40 at once, one request every 10 s each (about 4 a second) |
| Concurrent users | 300 for 10 minutes, 40 to 50 requests a second |
| Sign-in burst | 100 more parents sign in during one minute, from minute 5 (two steps: password, then emailed code) |
| Before the clock | the 300 users are signed in first (10 at a time), as at a real peak where sessions last an hour |
| Mail | slow stand-in answering after 800 ms, no email sent (`WASSEL_MAIL_BREVO_BASE_URL`) |
| Road routing | stub: `ORS_API_KEY` empty, straight-line times, no request leaves the machine |
| Data | throwaway stack, never the live school |

## Results, run 1

| Measure | Result | Limit | |
|---|---|---|---|
| p95, all requests except sign-in | **5.0 ms** (avg 8.0 ms, max 1.18 s) | under 1 s | pass |
| p95, sign-in (password and code) | **887 ms** (avg 441 ms, max 903 ms) | under 3 s (my choice, see below) | pass |
| 5xx answers | **0** | 0 | pass |
| Failed sign-ins | **0** of 100 in the burst (and 300 of 300 before it) | 0 | pass |
| Checks | 33,846 of 33,846 passed | | |
| Requests | 37,766 in all, 55 a second with sign-in and the mail stand-in's lookups | | |
| 429 answers | 0 (there is no rate limit yet; S5-A adds it) | | |

The sign-in limit of 3 s is mine: the ticket asks for p95 under 1 s and zero 5xx errors. Sign-in cannot meet 1 s here
because the stand-in mail provider takes 800 ms by design, so sign-in is measured on its own and everything else
against 1 s.

## Host limits (what the numbers hold for)

- Backend container: **1 CPU, 1 GB**, JVM heap 70% of that, 10 database connections (the production default).
  PostgreSQL 16 container: 1 CPU, 1 GB. One backend instance.
- Use during the run: backend CPU **17% on average, 61% at most** of its one CPU, memory 506 MiB at most of 1 GB;
  PostgreSQL 6% and 22% CPU, 71 MiB. So there was room to spare on this host.
- The machine that ran it also ran k6: Windows 11, 16 GB, Docker Desktop with 12 CPUs and 8 GB, in the same Docker
  network, so no internet latency is included.
- A real host is smaller or slower than this in unknown ways. These numbers say the app is not the bottleneck at this
  size on this hardware; they are not a promise for Railway's plan.

## Why run 1 is not the final word

Saturday and Sunday are holidays for the backend (the school day is decided by the `Asia/Beirut` clock, which a test
cannot move). On a holiday the drivers have no run, so they sent no positions (the 40 drivers only re-read their run
list), and a parent's `bus-location` answers `UNAVAILABLE` straight away. The slowest and most important part of the
peak (a driver's position write, and a parent's read of a live bus with its estimate) was therefore not tested.
The fast 5 ms figure for everything but sign-in comes from that.

**To do on a weekday:** the same command, `docker compose run --rm --no-deps k6` after a fresh `down -v`, `up` and
seed; then replace this section with run 2's numbers.

## Finding for S5-H: a sign-in stampede exhausts the database pool

Before I changed the script to sign the 300 users in first, an early smoke run had all of them sign in in the same
second. Result (90 s run, then stopped): sign-in p95 **52 s**, other requests p95 12 s, **8 answers of 500**. The
backend log shows why: `Connection is not available, request timed out after 30000ms (total=10, active=10, idle=0,
waiting=183)`, then `CannotCreateTransactionException`. The sign-in sends its email inside the database transaction
(5 s timeout), so each login holds one of the 10 connections for as long as the mail provider takes to answer.

The modelled burst (100 sign-ins in a minute, under 2 a second) does **not** do this: sign-in stayed at about 0.9 s.
So the ticket's burst already passes today. What S5-H (SCRUM-289) still protects against is a crowd that signs in all
at once, for example everybody after a deploy, or every parent whose hour-long session ends together. The stand-in
mail delay is a parameter (`MAIL_DELAY_MS`); a slower provider lowers the number of sign-ins a second the app can take.
After S5-H, repeat the early scenario (it is `PARENT_VUS=260 DRIVER_VUS=40` with the setup step taken out) and compare.

## What this test does not cover

- Weekday traffic (above), the afternoon run, and parents and heads of transportation using other screens.
- Rate limiting (S5-A): nothing returned 429 because nothing limits yet.
- More than one backend instance, a real mail provider, real road times, or the live database.
- A longer run than 10 minutes, or growth over a school year.

## Problems found and fixed in the script while preparing

- k6 empties a user's cookies at the start of each iteration; a signed-in user would be signed out after one poll.
  Fixed with `noCookiesReset`.
- The first version used the wrong field for the child's id and signed everyone in at second zero (the finding above).
- Running `docker compose run k6` without `--no-deps` once recreated the database container and lost the seed. The
  README and compose file now say `--no-deps`.
