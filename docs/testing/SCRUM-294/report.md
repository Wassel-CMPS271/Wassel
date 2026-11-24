# SCRUM-294 (S5-X1): independent attack tests of rate limiting and the sign-in mail, report

How to run it again: the header of [`scripts/attack-test.sh`](../../../scripts/attack-test.sh) (the k6 part is
[`scripts/attack-test.k6.js`](../../../scripts/attack-test.k6.js)). Raw output of the runs below is in [`raw/`](raw/):
the console (`console.txt`), every verdict (`verdicts.txt`), the k6 summary of each run (`*.summary.json`), the status of
each oversized case (`run3-oversized.cases`) and every health probe (`*.health`: HTTP status, seconds, UP or not).

## Result in one line

**Baseline on today's `develop` (24 November 2026, commit `7a938f5`), before SCRUM-288 and SCRUM-289 are merged.**
The documented claim holds: **10,000 fake emails sent to forgot-password and to login stored nothing and sent no
email** (users, password tokens and login codes unchanged, mail stand-in received 0). The health check stayed UP and
answered in **0.62 s at worst** through every run, with **zero 5xx answers**. As expected before SCRUM-288, **there is
no 429 anywhere** (700 wrong passwords from one address, none limited) and **oversized emails and passwords on login and
forgot-password are accepted** (401/204, not 400). **The final run, after SCRUM-288 (PR #186) and SCRUM-289 (PR #188)
are merged, is still to do** (below).

## Where SCRUM-288 and SCRUM-289 stand

Both are **open, not merged** into `develop` on 24 November 2026: SCRUM-288 is PR #186 (`feat/SCRUM-288-sign-in-rate-limit`),
SCRUM-289 is PR #188 (`feat/SCRUM-289-auth-email-after-commit`). So every run here is the **pre-288/289 baseline**. The
"429 after the limit" and "oversized fields answer 400" lines are expected to fail on today's code, and they do.

## What was run

| | |
|---|---|
| Stack | the throwaway stack in `loadtest/` (SCRUM-293): its own backend (1 CPU, 1 GB), PostgreSQL 16 (1 CPU, 1 GB) and mail stand-in (`mail-stub.mjs`, answers 201 after 800 ms, sends nothing), backend on `127.0.0.1:18080` only. Never the live school, never `wassel-postgres` on 5432. Torn down with `docker compose down -v` afterwards |
| Data | `loadtest/seed.sql`: 841 accounts (800 parents, 40 drivers, 1 head of transportation), all with a known password |
| Host | 12th Gen Intel Core i5-12450H (12 threads), 15 GB, Linux, Docker 29.9.2 |
| Attacker | k6 1.0.0 in the stack's `k6` container, 20 requests at once, **all from one address** |
| Rows | counted with `psql` in the stack's database before and after each run: `users`, `password_tokens`, `login_codes`, accounts locked now, sum of `failed_sign_ins` |
| Mail | the stand-in's own count of messages received (`GET /stats`), before and after |
| Health | `GET /actuator/health` from the host every 0.25 s for the whole run, timed with curl; a probe passes if it is 200 with `"UP"` in under 1 s |
| Errors | `ERROR` lines in the backend log during each run |

## Results

| Run | What was sent | Answers | Rows (users / tokens / codes) | Mail | Health (probes, p95, slowest) | Backend ERRORs |
|---|---|---|---|---|---|---|
| 1, flood | 10,000 unique fake emails (`ghost-…@attack.invalid`), each to forgot-password and to login: **20,000 requests** in 655 s | forgot-password **204 × 10,000**; login **401 × 10,000** | 841 / 0 / 0 → **841 / 0 / 0** | 0 → **0** | 2,136 probes, 0.139 s, **0.615 s**, all UP | 0 |
| 2a, one account | 200 wrong passwords on `parent1@load.test` in 13 s | login **401 × 200**, **no 429** | 841 / 0 / 0 → **841 / 0 / 0** | 0 → **0** | 47 probes, 0.047 s, **0.141 s**, all UP | 0 |
| 2b, many accounts | one wrong password on each of 500 accounts (`parent2` to `parent501`) in 33 s | login **401 × 500**, **no 429** | 841 / 0 / 0 → **841 / 0 / 0** | 0 → **0** | 112 probes, 0.046 s, **0.143 s**, all UP | 0 |
| 3, oversized | 15 oversized fields, once each (table below) | 400 × 5, **401 × 7, 204 × 3** | 841 / 0 / 0 → **841 / 0 / 0** | 0 → **0** | all UP, 0.002 s | 0 |

**Status code distribution, all runs:** 20,715 requests: 401 × 10,707, 204 × 10,003, 400 × 5, **429 × 0, 5xx × 0**.

**Lockout (SCRUM-171) did its part:** after run 2a exactly one account was locked (`parent1`, after its 5th wrong
password; the other 195 were refused without checking the password). After 2b, `failed_sign_ins` summed to 500, one
for each account tried, and none was locked. Run 3's two oversized passwords on a real, untouched account
(`parent800`) added 2: they were checked and counted as wrong, not rejected as invalid input.

**Sign-in latency under attack (not an acceptance line):** run 1's requests had p95 1.71 s (avg 0.65 s, max 5.5 s);
run 2's logins p95 2.0 s. Each login, even for an unknown email, runs one BCrypt check (by design, so the timing reveals
nothing), and 20 at once keep the backend's single CPU at 100%. A real parent signing in during such an attack would
wait about that long. Health was not affected because it does not hash anything.

### Run 3, each oversized case

| Case | Today | Wanted |
|---|---|---|
| login: email 256 characters | 401 | 400 |
| login: email 64 KB | 401 | 400 |
| login: email 1 MB | 401 | 400 |
| login: password 73 bytes, real account | 401 | 400 |
| login: password 73 bytes, unknown email | 401 | 400 |
| login: password 64 KB, real account | 401 | 400 |
| login: password 1 MB, unknown email | 401 | 400 |
| forgot-password: email 256 characters | 204 | 400 |
| forgot-password: email 64 KB | 204 | 400 |
| forgot-password: email 1 MB | 204 | 400 |
| set password: token 64 KB | **400** | 400 |
| set password: token 1 MB | **400** | 400 |
| set password: password 73 bytes | **400** | 400 |
| set password: password 1 MB | **400** | 400 |
| 2FA verify: code 1 MB | **400** | 400 |

None of them caused a 500 or an error in the log: a 1 MB body is read, the email is looked up (no match) and the
password is checked or skipped like any other. SCRUM-288 adds `@Size(max = 255)` on both emails and `@MaxBytes(72)` on
the login password, which should turn the ten 401/204 answers into 400.

## Acceptance criteria

| Line | Result |
|---|---|
| Run 1: 10,000 fake emails to forgot-password and login; nothing stored, no email sent | **PASS** (baseline, today's code): 0 rows added, 0 emails, every answer 204 / 401 |
| Run 2: password hammering on one account and on many accounts from one address; 429 after the limit | **FAIL on today's code, as expected before SCRUM-288**: 700 wrong passwords, 0 × 429. **Pending** the final run |
| Run 2: `/actuator/health` stays UP and answers under 1 s | **PASS** (baseline): UP on all 2,301 probes, slowest 0.615 s |
| Run 3: oversized fields answer 400 | **FAIL on today's code, as expected before SCRUM-288**: 5 of 15 cases answer 400 (set-password and 2FA verify); login and forgot-password accept them. **Pending** the final run |
| Final run after SCRUM-288 and SCRUM-289 are merged; user, token and code row counts unchanged | **Pending**: both PRs are still open. Row counts were unchanged in every baseline run |
| Script in `scripts/`, report here, local throwaway stack only | **PASS** |

## Findings

1. **The "nothing stored, no email sent" claim holds** for unknown emails on both forgot-password and login, at 10,000
   emails: not one row or email. It was documented but never tested before.
2. **No limit on how many accounts one address can try** (pre-288, expected): 500 accounts, one guess each, went
   through in 33 s with nothing to stop them. Lockout only protects each account after 5 guesses, so a password-spraying
   attacker can make 4 guesses on every account without locking any of them. SCRUM-288's per-address limit is the fix.
3. **One address can slow sign-in for everyone** (pre-288): 20 parallel fake logins put the 1-CPU backend at 100% and
   sign-in p95 at about 2 s. The health check, which answers without hashing, stayed fast, so a host that watches only
   `/actuator/health` would not notice.
4. **Oversized emails and passwords are accepted on login and forgot-password** (pre-288, expected): no crash and no
   500, but a 1 MB email is read and looked up in the database for nothing.

## Still to do: the final run

When PRs #186 and #188 are merged into `develop`:

```bash
git checkout develop && git pull
cd loadtest && RATE_LIMIT_ENABLED=true docker compose up -d --build postgres mail-stub backend
docker compose exec -T postgres psql -U loadtest -d wassel -v ON_ERROR_STOP=1 -f /seed/seed.sql
cd .. && OUT=docs/testing/SCRUM-294/raw-final scripts/attack-test.sh all
cd loadtest && docker compose down -v
```

SCRUM-288's limit is **off by default** (`RATE_LIMIT_ENABLED=false`, also in its change to `loadtest/docker-compose.yml`),
so the stack has to be started with `RATE_LIMIT_ENABLED=true`. With its defaults (30 logins and 10 forgot-password a
minute per address) the final run should show a 429 from the 31st login of run 2a and 2b. Run 1 will then be mostly
429s too, which still proves nothing is stored; to also measure the full 10,000 un-limited, run `flood` once with the
limit off. If SCRUM-289 adds its own daily cap on authentication email (its PR does), check that the mail stand-in's
count still does not move.
