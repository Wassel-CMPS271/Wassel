# SCRUM-289 (S5-H): send the sign-in email without holding the database, report

Contract: [`docs/contracts/auth-email.md`](../../contracts/auth-email.md). Measured 2026-11-23, in JUnit on Testcontainers
PostgreSQL 16 (the pool-exhaustion measurement) and on a throwaway stack on ports 5440 / 8090 (the end-to-end check).

## Result in one line

At the ticket's own scenario (100 sign-ins in one minute) the pool of 10 is **not** exhausted while the provider answers in
0.8 s or 3 s, **is full (10 of 10 connections in use at the peak)** when the provider takes its 5 s timeout, and a crowd
of 100 at once takes 3 of 100 sign-ins to a 500 after a 30 s wait. After the change **no sign-in holds a connection
during the send** (1 connection at most, for the short write), at every delay, and the crowd gets 100 of 100 answers in
6.5 s at most. So criterion 2 applies and the send moved out of the transaction.

## The real values (not the ticket's)

- Hikari pool: **10** connections (Spring Boot's default, set nowhere), wait for a connection **30 s** (default).
  The test profile only lowers `minimum-idle` to 1.
- **No transaction timeout exists.** The ticket's "5 s" is the mail client's timeouts: SMTP connect, read and write 5 s
  each (per network step), Brevo connect 5 s + read 5 s. One send can hold a connection for about 10 s on Brevo.
- `spring.jpa.open-in-view` is `false`, which is why the connection goes back to the pool when the write's transaction
  ends (a test proves it: `AuthEmailConnectionTests`).

## Method

`AuthEmailPoolMeasurementTests` (gated, about 4 to 5 minutes): the app on a real port, real HTTP, real PostgreSQL, Hikari at
its defaults, 100 new parent accounts per scenario (the cooldown is per account), and a mail stand-in that sleeps. During
each scenario a probe sends a signed-in `GET /api/auth/me` every 500 ms (it reads the user from the database) and a sampler
reads the pool every 50 ms. The stand-in is `RecordingMailer` with `whileSending`; Mohamad's SCRUM-293 stub can replace it.

```
sh ./mvnw test -Dtest=AuthEmailPoolMeasurementTests -Dmeasure.SCRUM-289=true     (from backend/)
```

## Before (develop at fa7fc3a, send inside the transaction)

| Scenario | Max connections in use | Max waiting for one | Login answers | Login ms p50 / p95 / max | Probe ms p50 / p95 / max (non-200) |
|---|---|---|---|---|---|
| 100 over 60 s, provider 0.8 s | 3 | 0 | 204 x 100 | 887 / 895 / 910 | 10 / 16 / 31 (0) |
| 100 over 60 s, provider 3 s | 6 | 1 | 204 x 100 | 3083 / 3090 / 3094 | 9 / 11 / 28 (0) |
| 100 over 60 s, provider 5 s | **10** | 1 | 204 x 100 | 5085 / 5091 / 5099 | 9 / 11 / 33 (0) |
| 100 at once, provider 5 s | **10** | **91** | 204 x 97, **500 x 3** | 30098 / 50035 / 50321 | 8 / **24689** / 24689 (0) |

## After (send after the commit)

| Scenario | Max connections in use | Max waiting for one | Login answers | Login ms p50 / p95 / max | Probe ms p50 / p95 / max (non-200) |
|---|---|---|---|---|---|
| 100 over 60 s, provider 0.8 s | **1** | 0 | 204 x 100 | 889 / 898 / 920 | 11 / 16 / 20 (0) |
| 100 over 60 s, provider 3 s | **1** | 0 | 204 x 100 | 3085 / 3091 / 3106 | 10 / 12 / 17 (0) |
| 100 over 60 s, provider 5 s | **1** | 0 | 204 x 100 | 5083 / 5091 / 5093 | 6 / 9 / 28 (0) |
| 100 at once, provider 5 s | 10 | 47 | **204 x 100** | 6283 / 6475 / 6541 | 8 / 270 / 270 (0) |

How to read them:
- The login itself takes as long as the provider, before and after: the user still waits for their own email, on a
  request thread. What changed is that the wait no longer takes a database connection, so other people's requests are not
  held up by it.
- In the crowd the pool still reaches 10 for an instant (100 BCrypt checks and short statements at the same moment), but
  nothing waits 30 s: the slowest sign-in is the 5 s send plus 1.5 s of queueing, there are no 500s, and the probe, which
  reads the database, answers in 270 ms at worst instead of 24.7 s. The probe takes few readings during a crowd (it waits on
  each answer), so its p95 is close to its maximum.
- The Little's-law estimate (an estimate, not a measurement): 100 a minute is 1.67 sign-ins a second, so the connections
  held on average are rate x time per send: about 1.3 at 0.8 s, 5 at 3 s and 8.3 at 5 s. The measured peaks (3, 6, 10)
  sit above those averages, as a peak should.

For context, SCRUM-293's k6 run (Brevo stand-in at 0.8 s, 300 users, 100 sign-ins in a minute) had zero 5xx; its early
smoke run of 300 sign-ins in the same second had sign-in p95 52 s and 8 answers of 500, with the log line
`Connection is not available, request timed out after 30000ms (total=10, active=10, idle=0, waiting=183)`. Both agree with
the table above: no problem at the nominal point, a pool outage at a degraded provider or a crowd.

## End to end on the real stack (PostgreSQL 16 on 5440, the jar on 8090, Mohamad's `loadtest/mail-stub.mjs` on 9000)

`MAIL_PROVIDER=brevo` with `WASSEL_MAIL_BREVO_BASE_URL` on the stub; 40 parent accounts. Everything started was removed
afterwards (8090, 5440 and 9000 are free again).

| Check | Result |
|---|---|
| 30 sign-ins at once (`xargs -P 30`), stub answering after 4 s, with `/actuator/health` and a signed-in `/api/auth/me` probed 40 times each | 30 x 204 in 4.25 to 4.63 s; all 64 probe requests that finished while it ran were 200, slowest 54 ms; no pool timeout in the log |
| `AUTH_EMAIL_DAILY_CAP=3` (reset cap 3), four sign-ins | 204, 204, 204, then **503** with `Retry-After: 15097` and the body of `samples/auth-email/login-daily-cap.json` |
| Stub stopped: sign-in; stub started: sign-in at once | 500 in 0.29 s and **0** `login_codes` rows for that user; then 204 in 0.94 s and the code arrived at the stub |
| Stub answering after 5 s (the Brevo read timeout is also 5 s) | the first sign-in was a 500 (the stub had the mail, the reply timed out: the contract's accept-then-timeout limit), and the next sign-in was 204 at once |

(An early run also showed that the stub must answer in under the 5 s read timeout for a send to count as delivered.)

## Red to green

| Task | Test | Red (before the change) | Green |
|---|---|---|---|
| 2 | `AuthEmailConnectionTests` login, resend, forgot-password | 3 failures, `expected: <0> but was: <1>` (one connection held during the send, in each flow) | 0 in each; a slow send for one user does not stall another user's login |
| 3 | `AuthEmailBudgetTests` (21 after review), `AuthEmailPropertiesTests` (3) | written with the budget: first run did not compile without it | the cap, its two sub-limits, midnight, parallel claims, no claim outside a transaction, logs |
| 4 | `TwoFactorEmailAfterCommitTests` (12 after review) | the undo queries did not exist | failed login leaves no row and retry is at once; failed resend keeps the old code and allows resend at once; guesses at both codes count; an undo that matches nothing or fails is logged and the 500 stands |
| 5 | `ForgotPasswordEmailTests` (6 after review), `AdminInviteEmailTests` (6 after review) | a failed forgot-password send was a 500 | 204 for every outcome; admin invites sent and counted over the cap; a failed invite is a 500 with no account |
| 6 | `AuthEmailCapContractTests` (7 after review) | no 503 handler | 503 + `Retry-After` and the sample's title, status, detail and instance |

Two things the tests found while they were written, both fixed before the numbers above: a refusal inside forgot-password
marked its transaction rollback-only (a 500 instead of 204; `claim` now has `noRollbackFor`), and a log assertion that
matched the `@timestamp` key of the JSON log.

## After review (step 5)

The review found one Critical problem, which the numbers above could not show: anyone who knew an address could lock its
owner out of sign-in until midnight. 25 parallel `POST /api/auth/forgot-password` for one account had mailed 10 links (the
60-second cooldown was read before the cap's lock, so every request passed it) and used up the account's 10 sends, and the
owner's login with the right password then answered `503`. Fixed two ways: the per-account limit counts an account's own kind
only (reset links never count against a sign-in), and forgot-password takes the cap's lock before it reads the cooldown.

| Check (PostgreSQL 16 on 5440, jar on 8090, stub on 9000, torn down afterwards) | Before | After |
|---|---|---|
| 25 parallel forgot-password for one account | 25 x 204, **10** mails, 10 tokens | 25 x 204, **1** mail, 1 token |
| The owner then signs in with the right password | **503**, `Retry-After: 14295` | 204 |
| 12 forgot-password calls one a minute (cooldown aged by SQL), then sign-in | the account's sends run out, sign-in refused | 10 `RESET_LINK` rows, the 11th and 12th refused with 204 and no mail, sign-in 204 |

Regression tests: `ForgotPasswordFloodTests` (the 25-parallel case, an exhausted reset limit that leaves sign-in and resend
working, a 40-address flood that stops at the reset share), `AuthEmailBudgetTests` (kinds, parallel per-account and
reset-share claims). Removing the `budget.lock()` call from forgot-password makes the 25-parallel test fail with
`expected: <1> but was: <6>`.

Also added: the undo and restore race tests (`TwoFactorEmailAfterCommitTests`), a parallel-login test that proves a request
that loses the race takes no slot, Beirut midnight at exactly 22:00:00Z and the March clock change, the failed-send count for
resend and reset, driver invites, and whole-log leak checks (no address, code or token). The 500 for a failed send no longer
carries the provider's message, which can hold the address (`AuthEmailSendException`).

Full suite: `sh ./mvnw clean verify`, 1,915 tests, 0 failures, 5 skipped (one is the gated measurement), the JaCoCo floor met.

## Behaviours that are not this ticket's

Parallel sign-ins for one account with the right password get 401s for the ones in flight past the lockout limit: SCRUM-171
counts the attempt before it checks the password. The count returns to 0 and the account is not locked. It is not S5-H, and
SCRUM-294 should not report it against it.
