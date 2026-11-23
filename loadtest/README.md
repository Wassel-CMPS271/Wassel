# Load test for a normal school (SCRUM-293, S5-G)

A [k6](https://k6.io) script that models a normal school at the morning peak, run against a **throwaway** stack. It
must never be pointed at the live school: it signs in hundreds of accounts and sends location updates.

## What it models

| | Number | How |
|---|---|---|
| School | about 1,000 students, 40 buses, 800 parent accounts | `seed.sql` |
| Parents | 260 at once, each polling its child's bus every 5.5 to 6.5 s (about 43 requests a second); every 5th poll also reads the unread count, every 20th the inbox and children (about 56 requests a second from parents) | `parent()` in `load.js` |
| Drivers | 40 at once, each sending its position every 10 s (4 requests a second); on a school day each starts its morning run first | `driver()` |
| Concurrent users | 300 (260 parents + 40 drivers), about 60 requests a second in all, for 10 minutes | the two scenarios above |
| Sign-in burst | 100 more parents sign in during one minute, starting 5 minutes in | `burst()` |

Every sign-in is the real two steps: the password, then the code the mail stand-in received.

**Pass** (each is a k6 threshold):

- p95 under 1 s for all requests except the password step of sign-in, including the code step (`phase:signin-code`);
- the password step (`phase:signin-password`) and the whole sign-in (`sign_in_duration`, password plus code) p95
  under 3 s, because the stand-in mail provider answers after 800 ms by design;
- **zero 5xx answers** and no failed sign-in;
- **every check passed** (`checks` rate 1) and under 0.1% failed requests (`http_req_failed`, any 4xx or 5xx), so a
  fast 401, 403, 404 or 409, for example on a driver's run start or location sharing, fails the run.

The two sign-in steps are tagged apart because the password step waits for the mail (about 800 ms) and the code step
takes a few ms: one tag over both would halve the p95. The sign-in burst is
meant to pass after S5-H (SCRUM-289, sending the email without holding the database): run it before and after.

## Why it is safe

- **Own stack** (`docker-compose.yml`): its own backend, PostgreSQL and mail stand-in, with throwaway passwords.
- **Slow stand-in mail provider** (`mail-stub.mjs`): `BrevoMailer` posts to it instead of Brevo (`WASSEL_MAIL_BREVO_BASE_URL`). It answers
  after `MAIL_DELAY_MS` (default 800 ms) and no email is sent, so no mail quota is spent.
- **Stub for road routing:** `ORS_API_KEY` is empty, so the road client never calls out and every route time is a
  straight-line estimate. Addresses are seeded with pins, so the geocoder is never called either.
- **Container limits** (the host the report states): backend 1 CPU and 1 GB (JVM heap 70% of that, 10 database
  connections as in production), PostgreSQL 1 CPU and 1 GB, mail stand-in 0.25 CPU. k6 runs in Docker too and
  shares the machine's CPU, so the report also names the machine.

## How to run

Needs Docker (Docker Desktop on Windows or Mac). Run everything from this folder.

```bash
# 1. Build and start the stack (the first build downloads Maven dependencies and takes a few minutes).
docker compose up -d --build postgres mail-stub backend

# 2. Wait until the backend is up (prints {"status":"UP"}).
curl http://localhost:18080/actuator/health

# 3. Seed the school, once. It refuses a database that already has data.
docker compose exec postgres psql -U loadtest -d wassel -v ON_ERROR_STOP=1 -f /seed/seed.sql
# (Git Bash on Windows rewrites /seed/seed.sql: put MSYS_NO_PATHCONV=1 in front of the command.)

# 4. Run the test: 10 minutes by default.
docker compose run --rm --no-deps k6

# 5. Throw the stack away (the seed only works on an empty database).
docker compose down -v
```

A shorter smoke run: `DURATION=90s BURST_START=30s docker compose run --rm --no-deps k6`.

k6 prints the summary and writes it to `results/summary.json`. The exit code is 0 only when every threshold passed.
On Linux, run `chmod 777 results` first: the k6 image runs as user 12345 and cannot otherwise write the file (Docker
Desktop on Windows and Mac does not need this). Afterwards, copy what you need out of `results/`, delete the files k6
wrote and put the folder back with `chmod 755 results`.

**Run it on a weekday.** The backend treats Saturday and Sunday as holidays (a school day is decided by the
`Asia/Beirut` clock, which cannot be moved), so on a weekend there are no runs: the drivers only poll their list and
parents get no bus position. The run still exercises sign-in and the other endpoints, but it is not the real peak.

## Changing the limits

To test a different host, edit `cpus` and `mem_limit` in `docker-compose.yml`. To test a different school size, change
the numbers in `seed.sql` and `PARENT_VUS` / `DRIVER_VUS` / `BURST_SIGNINS` (environment variables of the k6 service).

## Report

Results of the real runs, with the host's limits and the findings, are in `docs/testing/SCRUM-293/report.md`.
