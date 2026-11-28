# SCRUM-294 (S5-X1): independent attack tests of rate limiting and the sign-in mail, report

How to run it again: the header of [`scripts/attack-test.sh`](../../../scripts/attack-test.sh) (the k6 part is
[`scripts/attack-test.k6.js`](../../../scripts/attack-test.k6.js)) and [the commands below](#how-to-run-it-again).
Raw output of the final run is in [`raw-final/`](raw-final/) (rate limit on) and
[`raw-final-limit-off/`](raw-final-limit-off/) (the flood once more with the limit off): every verdict
(`verdicts.txt`), the console (`console.txt`), each run's k6 summary (`*.summary.json`), row and
mail counts before and after (`*.before`, `*.after`), one summary line of each run's health probes (`*.health`), and
per-case lines for the oversized, mail and endpoint runs (`*.cases`, `*.steps`).

## Result in one line

**Final run on `develop` after SCRUM-288 (PR #186) and SCRUM-289 (PR #188) were merged, 25 November 2026, backend
identical to `develop` at `f8d4269`, rate limit on: 87 checks PASS, 0 FAIL.** 20,000 flood requests stored nothing and
sent no email; one address gets exactly the limit through on each of the six sign-in endpoints, then 429 with
`Retry-After`, and a forged `X-Forwarded-For` does not get around it; all 15 oversized fields answer 400; a real
account's reset links and sign-in codes are held by their 60 s cooldowns, and reset links for 40 accounts stop at the
reset share (30 a day); every email sent has its `auth_emails` row; no 5xx, no request without an answer, health UP
throughout. With the limit off, the flood of 10,000 fake emails also stored nothing and sent nothing (20,000 requests in 648 s, forgot-password 204 × 10,000, login 401 × 10,000, health p95 0.136 s).

## What was run

| | |
|---|---|
| Code | branch `chore/SCRUM-294-attack-tests-review-fixes`; `backend/` identical to `develop` at `f8d4269` (SCRUM-288, -289 and -290 merged) |
| Stack | the throwaway stack in `loadtest/` (SCRUM-293): its own backend (1 CPU, 1 GB), PostgreSQL 16 (1 CPU, 1 GB) and mail stand-in (`mail-stub.mjs`, answers 201 after 800 ms, sends nothing), backend on `127.0.0.1:18080` only. Never the live school, never `wassel-postgres` on 5432. Started from nothing (`docker compose down -v`) for each pass and torn down afterwards |
| Settings | the defaults on `develop`: `RATE_LIMIT_ENABLED=true` (off by default, so set for this run), 30 logins, 10 forgot-password, 30 set-password, 60 2FA verify, 20 2FA resend and 60 logout per address per 1-minute window, `trusted-proxy-hops` 0; auth email caps 120 a day, 30 reset links a day, 10 sign-in emails per account a day |
| Data | `loadtest/seed.sql`: 841 accounts (800 parents, 40 drivers, 1 head of transportation), all with the stack's known throwaway password |
| Host | 12th Gen Intel Core i5-12450H (12 threads), 15 GB, Linux, Docker 29.9.2 |
| Attacker | k6 1.0.0 in the stack's `k6` container, **all from one address**: 20 requests at once in the flood and hammer runs, one at a time in the others |
| Rows | counted with `psql` before and after each run: `users`, `password_tokens`, `login_codes`, accounts locked now, sum of `failed_sign_ins`, `auth_emails` rows, today's `RESET_LINK` rows |
| Mail | the stand-in's own count of messages received (`GET /stats`), before and after each run, and after each step of the mail run |
| Statuses | every answer bucketed as 204, 400, 401, 413, 429, 5xx (500 to 599), 0 (no answer) or other; any 5xx, 0 or other fails the run, and a 429 without `Retry-After` is counted apart |
| Health | `GET /actuator/health` every 0.25 s for the whole run. Gate: every probe 200 and UP, and p95 under 10 x the idle p95 measured first (floor 0.25 s). Idle: 40 probes, p95 **0.005 s**, so the gate was **0.25 s**. A run with fewer than 40 probes (under 10 s) gets no health verdict, only its numbers |

## Results, rate limit on

| Run | What was sent | Answers | Rows and mail | Health (probes, p95, slowest) |
|---|---|---|---|---|
| 1, flood | 10,000 fake emails (`ghost-…@attack.invalid`), each to forgot-password and to login: **20,000 requests** in 12.5 s | forgot-password **204 × 10, 429 × 9,990**; login **401 × 30, 429 × 9,970**; every 429 with `Retry-After` | users / tokens / codes 841 / 0 / 0 → **841 / 0 / 0**; mail 0 → **0**; `auth_emails` 0 → **0** | 44, **0.141 s**, 0.147 s, all UP: **PASS** |
| 2a, one account | 200 wrong passwords on `parent1` in 2.2 s | **401 × 30, 429 × 170**, first 429 at request 31, all with `Retry-After` | unchanged, mail **0**; `parent1` locked (after its 5th wrong password) | 9 probes, all UP, slowest 0.143 s (too short to judge) |
| 2b, many accounts | one wrong password on each of 500 accounts (`parent2`…) in 2.4 s | **401 × 30, 429 × 470**, first 429 at request 31, all with `Retry-After` | unchanged, mail **0**; `failed_sign_ins` +30 (one on each of the 30 accounts that got through), none locked | 11 probes, all UP, slowest 0.095 s (too short) |
| 3, oversized | 15 oversized fields, once each | **400 × 15** | unchanged, mail **0** | 5 probes, all UP (too short) |
| 4, mail | real accounts, one request at a time, 275.8 s (table below) | forgot-password **204 × 50**; login **204 × 1, 429 × 20** (cooldown); resend **429 × 15** (cooldown) | tokens **+30**, codes **+1**, mail **+31**, `auth_emails` **+31**, today's reset links **30 of 30** | 1,071, **0.003 s**, 0.045 s, all UP: **PASS** |
| 5, endpoints | each limited endpoint, its limit + 5, one at a time: 240 requests in 2.1 s (table below) | exactly the limit passed on all six, then **429 × 5** each, all with `Retry-After` | unchanged, mail **0** | 11 probes, all UP (too short) |
| 6, forged address | 60 logins, a different `X-Forwarded-For`, `X-Real-IP` and `Forwarded` address on each (`203.0.0.x`) | **401 × 30, 429 × 30**, first 429 at request 31 | unchanged, mail **0** | 10 probes, all UP (too short) |

**All runs:** 21,113 requests; **0 × 5xx, 0 without an answer, 0 in an unexpected status**; 0 `ERROR` lines in the
backend log.

### Run 4, the mail run, step by step

| Step | Sent | Answers | Mail count moved by |
|---|---|---|---|
| Control: one forgot-password for a real account (`parent700`) | 1 | 204 | **1** (the control: the count can move) |
| 9 more for the same account, inside its 60 s cooldown | 9 | 204 × 9 | **0** |
| Control: one sign-in with the right password (`parent701`) | 1 | 204 | **1** |
| 20 more right-password sign-ins, inside the code's 60 s cooldown | 20 | 429 × 20 (the cooldown's 429, which has no `Retry-After` by contract) | **0** |
| 15 resends with that sign-in's pending cookie, inside the cooldown | 15 | 429 × 15 (cooldown) | **0** |
| Forgot-password for 40 other real accounts (`parent702`…`parent741`), in batches of 10 a minute so the per-address limit never answered | 40 | 204 × 40 | **29**, then nothing: the 30th reset link of the day (with the control's) reached the reset share and the last 11 were refused silently |

The database agrees: 30 password tokens and 1 login code were added, `auth_emails` gained 31 rows for 31 emails, and
today's `RESET_LINK` rows stopped at exactly 30, the reset share.

### Run 5, each limited endpoint

| Endpoint | Limit a minute | Passed | First 429 at | 429 without `Retry-After` |
|---|---|---|---|---|
| `POST /api/auth/login` | 30 | 30 (401) | request 31 | 0 |
| `POST /api/auth/forgot-password` | 10 | 10 (204) | request 11 | 0 |
| `POST /api/auth/password` | 30 | 30 (400) | request 31 | 0 |
| `POST /api/auth/2fa/verify` | 60 | 60 (401) | request 61 | 0 |
| `POST /api/auth/2fa/resend` | 20 | 20 (401) | request 21 | 0 |
| `POST /api/auth/logout` | 60 | 60 (204) | request 61 | 0 |

### Run 3, each oversized case

Every case answers **400** now (before SCRUM-288: 5 of 15). Login: email 256 characters, 64 KB and 1 MB; password 73
bytes on a real and on an unknown account, 64 KB on a real account, 1 MB on an unknown one. Forgot-password: email 256
characters, 64 KB and 1 MB. Set password: token 64 KB and 1 MB, password 73 bytes and 1 MB. 2FA verify: code 1 MB.
None reached the password check: `parent800`'s `failed_sign_ins` did not move.

## Results, rate limit off (run 1 only)

The same flood on a second fresh stack with `RATE_LIMIT_ENABLED=false`, to measure all 10,000 emails reaching the
code.

| Run | What was sent | Answers | Rows and mail | Health (probes, p95, slowest) |
|---|---|---|---|---|
| 1, flood, limit off | 10,000 fake emails, each to forgot-password and to login: **20,000 requests** in 648 s | forgot-password **204 × 10,000**; login **401 × 10,000**; no 429 | users / tokens / codes 841 / 0 / 0 → **841 / 0 / 0**; mail 0 → **0**; `auth_emails` 0 → **0** | 2,126, **0.136 s**, 0.243 s, all UP: **PASS** |

10 checks PASS, 0 FAIL; 0 × 5xx, 0 `ERROR` lines. Sign-in under this flood had p95 1.70 s (avg 0.65 s, max 2.9 s), the
same as the baseline: without the limit, 20 parallel logins still keep the one CPU busy hashing.

## Acceptance criteria

| Line | Result |
|---|---|
| Run 1: 10,000 fake emails to forgot-password and login; nothing stored, no email sent | **PASS**, limit on: 0 rows, 0 emails, 0 `auth_emails` rows, 204/401 + 429 = all 20,000. **PASS**, limit off: 0 rows, 0 emails, 204 × 10,000 and 401 × 10,000 |
| Run 2: password hammering on one account and on many accounts from one address; 429 after the limit | **PASS**: exactly 30 passed in each, then 429 with `Retry-After` (first at request 31); the other five endpoints and a forged `X-Forwarded-For` checked too (runs 5 and 6) |
| Run 2: `/actuator/health` stays UP | **PASS**: UP on every probe of every run (1,161 probes). The hammer runs now end in about 2 s, too short to judge their latency; the long runs (flood, mail) had p95 0.141 s and 0.003 s against a 0.25 s gate |
| Run 3: oversized fields answer 400 | **PASS**: 15 of 15 |
| Final run after SCRUM-288 and SCRUM-289 are merged; user, token and code row counts unchanged | **PASS**: unchanged in every run but the mail run, which added exactly what it should (30 reset tokens, 1 sign-in code, one `auth_emails` row per email) |
| Sign-in mail can be counted (control) and stays within SCRUM-289's caps | **PASS**: one request moves the count by exactly 1; the cooldowns send nothing; the reset share stops at 30 |
| Script in `scripts/`, report here, local throwaway stack only | **PASS** |

## Findings

1. **SCRUM-288's limit and SCRUM-289's caps do what their contracts say**, and the claims the baseline could not test
   now are: the exact threshold on all six endpoints, `Retry-After` on every limiter 429, and that `X-Forwarded-For` is
   ignored at 0 proxy hops (`ClientAddressResolver`).
2. **Password spraying is slowed, not stopped.** One address now gets 30 guesses a minute (1,800 an hour), each on a
   different account if it likes, and lockout only starts after 5 on one account. Run 2b's 30 guesses landed on 30
   accounts. That is the design (a per-address limit), and the right next step on a host is confirming its proxy hop
   count (the limit is off until then; see the backend README, "Rate limit").
3. **Someone who knows addresses can use up the day's reset links** (the contract's own known limit): run 4 spent
   the reset share of 30 with 50 forgot-password requests over about 5 minutes from one address. Sign-in was not affected (its share is
   separate), which is what the contract promises.
4. **One address can still slow sign-in for a moment.** The 30 logins that pass at the start of each window run their
   BCrypt check at once: the hammer runs' requests had p95 1.0 to 1.2 s, and health p95 during the flood was
   0.141 s (idle 0.005 s). Much better than the baseline (sign-in p95 about 2 s for the whole attack), and it is over in
   seconds.

## Not attacked here (follow-ups)

- **The per-account sign-in cap (10 a day) and the total daily cap (120 a day).** A sign-in code is held by a 60 s
  cooldown, so reaching 10 on one account takes 10 minutes or more of waiting; it is covered by SCRUM-289's own tests,
  not by this run. Lower `AUTH_EMAIL_PER_ACCOUNT_DAILY_CAP` on the stack to attack it quickly.
- **The window's reset**: that the 429s stop once the minute ends. Every run here waits 65 s before the next and starts
  with an empty bucket, which shows it indirectly, but no run asserts it.
- **More than one backend instance**: the limit is in memory per instance by design.

## Baseline before SCRUM-288 and SCRUM-289 (24 November 2026, `develop` at `7a938f5`)

Numbers only; the raw files were replaced by the final run's. Same stack and data, no rate limit or email cap in the
code.

| Run | Answers | Rows and mail | Health (probes, p95, slowest) |
|---|---|---|---|
| 1, flood: 20,000 requests in 655 s | forgot-password 204 × 10,000; login 401 × 10,000 | unchanged, mail 0 | 2,136, 0.139 s, 0.615 s |
| 2a, 200 wrong passwords on one account | 401 × 200, no 429 | unchanged, mail 0; `parent1` locked | 47, 0.047 s, 0.141 s |
| 2b, one wrong password on each of 500 accounts | 401 × 500, no 429 | unchanged, mail 0; 500 failed sign-ins, none locked | 112, 0.046 s, 0.143 s |
| 3, 15 oversized fields | 400 × 5, 401 × 7, 204 × 3 | unchanged, mail 0 | all UP |

Sign-in under the flood had p95 1.71 s and 2.0 s in run 2. The baseline's mail check only used unknown emails, which
send nothing by design, so it could not show the defence working (Hashem's review on #189); run 4 above replaces it.

## How to run it again

Run it from this branch (the script is not in any other), on a fresh stack each time: a used stack is refused, because
lockouts, failed sign-ins and the email cap's rows persist.

```bash
cd loadtest && docker compose down -v
RATE_LIMIT_ENABLED=true docker compose up -d --build postgres mail-stub backend
docker compose exec -T postgres psql -U loadtest -d wassel -v ON_ERROR_STOP=1 -f /seed/seed.sql
cd .. && OUT=docs/testing/SCRUM-294/raw-final scripts/attack-test.sh all
cd loadtest && docker compose down -v
```

The limit-off pass is the same with `RATE_LIMIT_ENABLED=false` and `scripts/attack-test.sh flood`
(`OUT=docs/testing/SCRUM-294/raw-final-limit-off`). The whole limit-on run takes about 15 minutes, most of it the
65 s waits between runs and the paced mail run.
