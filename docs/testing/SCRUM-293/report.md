# SCRUM-293 (S5-G): load test for a normal school, report

How to run it again: [`loadtest/README.md`](../../../loadtest/README.md). Raw output of the runs below:
`summary-2026-11-22-sunday.json` and `docker-stats-2026-11-22-sunday.txt` (run 1), `summary-2026-11-23-monday.json`
and `docker-stats-2026-11-23-monday.txt` (run 2), `summary-2026-11-23-monday-run3.json` and
`docker-stats-2026-11-23-monday-run3.txt` (run 3) in this folder. The summaries have k6's `setup_data` (the session
tokens of the 300 test accounts) taken out.

## Result in one line

**Run 3 (Monday 23 November 2026, a school day, 10 minutes, 300 users, 100 sign-ins in one minute, with the stricter
pass rules from the review): every threshold passed**: p95 **8.8 ms** for everything except the password step of
sign-in, password step p95 **876 ms**, code step p95 **3.6 ms**, whole sign-in p95 **879 ms**, **zero 5xx answers**,
no failed sign-in, **every check passed and no request failed** (0 of 37,240 answered 4xx or 5xx). All 40 drivers
started their morning run and sent positions, and parents got live bus positions with an estimate, so the real morning
peak was tested. Runs 1 (Sunday, a holiday for the backend) and 2 (Monday, before the stricter rules) passed too. One
thing to know: the first 15 seconds, when all 300 users start at once, are slow (below).

## What was run

| | |
|---|---|
| Script | `loadtest/load.js` (k6 1.0.0), commit of this PR |
| School | 1,000 students, 40 buses and drivers, 40 routes, 800 parent accounts (`loadtest/seed.sql`) |
| Parents | 260 at once, polling their child's bus every 5.5 to 6.5 s, a few also the inbox (about 43 requests a second) |
| Drivers | 40 at once, one request every 10 s each (about 4 a second) |
| Concurrent users | 300 for 10 minutes, about 60 requests a second (bus location 43, unread count 8, driver positions 4, the rest inbox and children) |
| Sign-in burst | 100 more parents sign in during one minute, from minute 5 (two steps: password, then emailed code) |
| Before the clock | the 300 users are signed in first (10 at a time), as at a real peak where sessions last an hour |
| Mail | slow stand-in answering after 800 ms, no email sent (`WASSEL_MAIL_BREVO_BASE_URL`) |
| Road routing | stub: `ORS_API_KEY` empty, straight-line times, no request leaves the machine |
| Data | throwaway stack, never the live school |

## Results, run 1

| Measure | Result | Limit | |
|---|---|---|---|
| p95, all requests except sign-in | **5.0 ms** (avg 8.0 ms, max 1.18 s) | under 1 s | pass |
| p95, sign-in (password and code under one tag) | **887 ms** (avg 441 ms, max 903 ms) | under 3 s (my choice, see below) | pass |
| 5xx answers | **0** | 0 | pass |
| Failed sign-ins | **0** of 100 in the burst (and 300 of 300 before it) | 0 | pass |
| Checks | 33,846 of 33,846 passed | | |
| Requests | 37,766 in all, 55 a second with sign-in and the mail stand-in's lookups | | |
| 429 answers | 0 (there is no rate limit yet; S5-A adds it) | | |

The sign-in limit of 3 s is mine: the ticket asks for p95 under 1 s and zero 5xx errors. Sign-in cannot meet 1 s here
because the stand-in mail provider takes 800 ms by design, so sign-in is measured on its own and everything else
against 1 s.

In runs 1 and 2 one tag covered both sign-in steps, the password (about 870 ms, it waits for the mail) and the code (a
few ms), so its p95 mixed two very different requests (median 438 ms is between the two). Run 3 tags them apart and also
measures the whole sign-in per user (`sign_in_duration`); see the run 3 table.

## Results, run 2 (the school day)

Monday 23 November 2026, clock started 07:35 Asia/Beirut, fresh stack (`down -v`, `up`, seed), same script and
command as run 1. I ran it twice on fresh stacks that morning; both passed with nearly the same numbers (steady p95
7.5 ms and 9.2 ms, sign-in p95 873 ms and 877 ms, zero 5xx, zero failed sign-ins). The table is the second, which also
wrote k6's raw per-request output, the source of the per-endpoint table below.

| Measure | Result | Limit | |
|---|---|---|---|
| p95, all requests except sign-in | **9.2 ms** (avg 58 ms, max 6.15 s, see below) | under 1 s | pass |
| p95, sign-in (password and code under one tag) | **877 ms** (avg 438 ms, max 885 ms) | under 3 s | pass |
| 5xx answers | **0** (every answer was 200 or 204) | 0 | pass |
| Failed sign-ins | **0** of 100 in the burst (and 300 of 300 before it) | 0 | pass |
| Checks | 33,489 of 33,489 passed | | |
| Requests | 37,189 in all, 55 a second with sign-in and the mail stand-in's lookups | | |
| 429 answers | 0 (no rate limit yet) | | |

**Runs and positions were really exercised.** During the first attempt, checked in the database, all 40 morning runs were `IN_PROGRESS` and all 40 drivers
had location sharing on, with the newest position 5 s old. A parent account the test does not use, signed in by hand,
got `"status":"LIVE"`, a position 2 s old, `stopsLeft` 9, the planned time and an estimate. Each driver sent 60
positions (2,400 in all), every one answered 204.

Per endpoint (run 2, from the raw output):

| Endpoint | Requests | Median | p95 | p99 | Max |
|---|---|---|---|---|---|
| Parent: bus location (`GET .../bus-location`) | 25,819 | 3.5 ms | 7.5 ms | 1.89 s | 4.99 s |
| Parent: unread count | 5,030 | 1.0 ms | 1.6 ms | 2.2 ms | 26 ms |
| Parent: children | 1,490 | 2.8 ms | 2.46 s | 3.23 s | 3.73 s |
| Parent: inbox | 1,130 | 0.9 ms | 1.4 ms | 1.8 ms | 8 ms |
| Driver: position (`PUT .../location`) | 2,400 | 6.4 ms | 29 ms | 392 ms | 788 ms |
| Driver: today's runs (once each, at the start) | 40 | 5.85 s | 6.15 s | | 6.16 s |
| Driver: start run (once each) | 40 | 1.10 s | 1.90 s | | 1.99 s |
| Driver: location sharing on (once each) | 40 | 709 ms | 992 ms | | 995 ms |
| Sign-in burst: password | 100 | 874 ms | 878 ms | 885 ms | 885 ms |
| Sign-in burst: code | 100 | 3.1 ms | 4.0 ms | 4.3 ms | 4.3 ms |

The p95 of "children" is high because a fifth of its calls are each parent's first one, made in the first seconds.

**Every request over 1 s (726 of 37,189) was in the first 15 seconds** of the clock, when 260 parents and 40 drivers
all start in the same second on a backend that had just started. In those seconds the 40 drivers' first
`runs/today` creates the day's 80 runs, then they start their runs, while every parent reads its children and its
first bus position; backend CPU reached 98% of its one CPU. **After the first 30 seconds: p95 6.8 ms, max 63 ms**
over 34,217 requests. A real morning does not start all 300 users in one second, and the JVM is not just started, so
this is mostly the test's own start; but see the finding below.

Use during run 2: backend CPU **16% on average, 98% at most** (at the start; 12% average and 36% at most after the
first minute), memory 500 MiB at most of 1 GB; PostgreSQL 5% average, 42% at most, 73 MiB.

## Results, run 3 (the school day, stricter pass rules)

Hashem's review of this PR found that the thresholds of runs 1 and 2 only failed a run on slow requests, 5xx answers
and failed sign-ins: a fast 401, 403, 404 or 409 (for example on a driver's run start) would still have passed. Run 3
adds two thresholds, **every check passed** (`checks` rate 1) and **under 0.1% failed requests** (`http_req_failed`,
any 4xx or 5xx), checks on the run start, location sharing and first children read, and tags the two sign-in steps
apart. Monday 23 November 2026, clock started 08:05 Asia/Beirut, fresh stack (`down -v`, `up`, seed), otherwise the
same command as runs 1 and 2. k6 exited 0.

| Measure | Result | Limit | |
|---|---|---|---|
| p95, all requests except the password step | **8.8 ms** (avg 52 ms, max 6.43 s, start of the clock only) | under 1 s | pass |
| p95, sign-in password step (waits for the mail) | **876 ms** (avg 872 ms, max 884 ms) | under 3 s | pass |
| p95, sign-in code step | **3.6 ms** (avg 2.8 ms, max 4.1 ms) | under 1 s | pass |
| p95, whole sign-in (password + code) | **879 ms** (avg 875 ms, max 887 ms) | under 3 s | pass |
| 5xx answers | **0** | 0 | pass |
| Failed requests (4xx or 5xx) | **0** of 37,240 | under 0.1% | pass |
| Checks | **33,856 of 33,856** passed, including 40 run starts and 40 location sharing | all | pass |
| Failed sign-ins | **0** of 100 in the burst (and 300 of 300 before it) | 0 | pass |
| Requests | 37,240 in all, 55 a second over the whole run with setup; about 60 a second in the 10 minutes | | |

Afterwards, in the database: all 40 morning runs `IN_PROGRESS`, each with a stored position.

Per endpoint (run 3, from the raw output):

| Endpoint | Requests | Median | p95 | p99 | Max |
|---|---|---|---|---|---|
| Parent: bus location | 25,833 | 3.1 ms | 6.1 ms | 1.51 s | 4.61 s |
| Parent: unread count | 5,041 | 0.9 ms | 1.5 ms | 1.9 ms | 14 ms |
| Parent: children | 1,502 | 2.6 ms | 2.39 s | 3.38 s | 3.99 s |
| Parent: inbox | 1,141 | 0.8 ms | 1.4 ms | 1.9 ms | 9 ms |
| Driver: position | 2,400 | 7.8 ms | 15 ms | 201 ms | 594 ms |
| Driver: today's runs (once each) | 40 | 5.65 s | 6.27 s | | 6.43 s |
| Driver: start run (once each) | 40 | 1.30 s | 2.20 s | | 2.30 s |
| Driver: location sharing on (once each) | 40 | 606 ms | 892 ms | | 893 ms |
| Sign-in burst: password | 101 | 872 ms | 876 ms | 880 ms | 884 ms |
| Sign-in burst: code | 101 | 2.7 ms | 3.6 ms | 3.9 ms | 4.1 ms |

Same picture as run 2: every request over 1 s (648 of 36,239 in the 10 minutes, sign-in password step aside) was in
the first 13 seconds of the clock. **After the first 30 seconds: p95 6.6 ms, max 45 ms** over 34,322 requests. Backend
CPU 12% on average and 99% at most (at the start; 10% average and 25% at most after the first minute), memory 505 MiB
at most of 1 GB; PostgreSQL 5% average, 13% at most, 71 MiB.

## Runs side by side

| | Run 1 (Sunday, holiday) | Run 2 (Monday, school day) | Run 3 (Monday, stricter rules) |
|---|---|---|---|
| Steady p95 | 5.0 ms | 9.2 ms (7.5 ms in the first attempt) | 8.8 ms |
| Steady max | 1.18 s | 6.15 s (start of the clock only) | 6.43 s (start of the clock only) |
| Sign-in p95 | 887 ms (both steps, one tag) | 877 ms (both steps, one tag) | 876 ms password, 3.6 ms code, 879 ms whole |
| 5xx / failed sign-ins | 0 / 0 | 0 / 0 | 0 / 0 |
| Failed requests (4xx or 5xx) | not a threshold | not a threshold (every answer 200 or 204) | 0, threshold |
| Requests | 37,766 | 37,189 | 37,240 |
| Backend CPU avg / max | 17% / 61% | 16% / 98% | 12% / 99% |
| Drivers | only re-read their run list | start the morning run, send a position every 10 s | same as run 2, run start and sharing checked |
| Parents' bus location | `UNAVAILABLE` at once | `LIVE`, with stops left and an estimate | same as run 2 |

The school day costs about 4 ms more at p95 and a slower start; the steady part is still far under 1 s.

## Host limits (what the numbers hold for)

- Backend container: **1 CPU, 1 GB**, JVM heap 70% of that, 10 database connections (the production default).
  PostgreSQL 16 container: 1 CPU, 1 GB. One backend instance.
- Use during run 1: backend CPU **17% on average, 61% at most** of its one CPU, memory 506 MiB at most of 1 GB;
  PostgreSQL 6% and 22% CPU, 71 MiB. So there was room to spare on this host.
- The machine that ran it also ran k6, in the same Docker network, so no internet latency is included. Run 1:
  Windows 11, 16 GB, Docker Desktop with 12 CPUs and 8 GB. Run 2: Linux (Arch-based), 12 CPUs, 16 GB, Docker running
  natively. The container limits were the same, so the two runs compare.
- A real host is smaller or slower than this in unknown ways. These numbers say the app is not the bottleneck at this
  size on this hardware; they are not a promise for Railway's plan.

## Why run 1 was not the final word

Saturday and Sunday are holidays for the backend (the school day is decided by the `Asia/Beirut` clock, which a test
cannot move). On a holiday the drivers have no run, so they sent no positions, and a parent's `bus-location` answers
`UNAVAILABLE` straight away. Run 2, on a Monday, covered that. There is no time-of-day rule: a driver can start the
morning run at any hour of a school day, so any weekday time before midnight in Beirut works.

## Finding: the first seconds of a school day are slow when every driver opens the app at once

In run 2 the 40 drivers' first `GET /api/driver/runs/today` took 5.8 s (median) and starting a run 1.1 s, because
all 40 came in the same second on a just-started backend, and the first read of the day creates the day's runs. Parents'
first reads waited behind them (bus location p99 1.9 s, all in the first 15 s). Nothing failed and it cleared in
seconds. In a real morning drivers open the app minutes apart, so this is unlikely to matter, but a deploy just before
the morning run, or many drivers at once, would show a few seconds' wait. Not a blocker; worth one look if drivers
report a slow first screen.

## Finding for S5-H: a sign-in stampede exhausts the database pool

Before I changed the script to sign the 300 users in first, an early smoke run had all of them sign in in the same
second. Result (90 s run, then stopped): sign-in p95 **52 s**, other requests p95 12 s, **8 answers of 500**. The
backend log shows why: `Connection is not available, request timed out after 30000ms (total=10, active=10, idle=0,
waiting=183)`, then `CannotCreateTransactionException`. Before SCRUM-289, the sign-in sent its email inside the database transaction
(5 s timeout), so each login holds one of the 10 connections for as long as the mail provider takes to answer.

The modelled burst (100 sign-ins in a minute, under 2 a second) does **not** do this: sign-in stayed at about 0.9 s.
So the ticket's burst already passes today. What S5-H (SCRUM-289) still protects against is a crowd that signs in all
at once, for example everybody after a deploy, or every parent whose hour-long session ends together. The stand-in
mail delay is a parameter (`MAIL_DELAY_MS`); a slower provider lowers the number of sign-ins a second the app can take.
After S5-H, repeat the early scenario (it is `PARENT_VUS=260 DRIVER_VUS=40` with the setup step taken out) and compare.

## What this test does not cover

- The afternoon run, and parents and heads of transportation using other screens.
- Rate limiting (S5-A): nothing returned 429 because nothing limits yet.
- More than one backend instance, a real mail provider, real road times, or the live database.
- A longer run than 10 minutes, or growth over a school year.

## Problems found and fixed in the script while preparing

- k6 empties a user's cookies at the start of each iteration; a signed-in user would be signed out after one poll.
  Fixed with `noCookiesReset`.
- The first version used the wrong field for the child's id and signed everyone in at second zero (the finding above).
- Running `docker compose run k6` without `--no-deps` once recreated the database container and lost the seed. The
  README and compose file now say `--no-deps`.
- After review: the thresholds did not fail a run on fast 4xx answers, the sign-in tag mixed the password and code
  steps, the backend port was published on every interface (now `127.0.0.1` only), and the summaries kept the test
  accounts' session tokens (now taken out). All fixed; run 3 is the run with these fixes.
- On Linux (run 2), k6 could not write `results/summary.json` (permission denied): the k6 image runs as user 12345 and
  `results/` belongs to the user who cloned the repo. The test itself was unaffected; `chmod 777 loadtest/results`
  before the run fixes it, and the README now says so. Docker Desktop on Windows and Mac does not have this problem.
