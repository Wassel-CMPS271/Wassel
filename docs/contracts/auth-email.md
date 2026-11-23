# Auth email contract (SCRUM-289)

How the email behind sign-in, resend, forgot-password and invites is sent, what a failed or refused send leaves behind, and the daily cap on it. Build against this page, not against each other's code. One school.

Owner: Hashem (SCRUM-289). Consumers: the sign-in, code and forgot-password screens (`LoginForm.tsx`, `TwoFactorForm.tsx`, `ForgotPasswordForm.tsx`: no change needed), the per-address rate limit (SCRUM-288, Moustafa, who owns 429 on these routes), the independent attack tests (SCRUM-294, Mohamad), the release checklist (SCRUM-286) and the end-to-end run (SCRUM-284). Samples are in [`samples/auth-email/`](samples/auth-email).

## What changes for a caller

Only the cells marked **new** or **changed** differ from before this ticket.

| Endpoint | Success | Cooldown | Daily cap | Send failed |
|---|---|---|---|---|
| `POST /api/auth/login` | 204 + `wassel_2fa` cookie | 429 (unchanged) | **new: 503 + `Retry-After`** | 500 (unchanged). No code is left, and signing in again at once works |
| `POST /api/auth/2fa/resend` | 204 | 429 (unchanged) | **new: 503 + `Retry-After`** | 500 (unchanged). **New:** the code the user last received is put back (it works if it has not expired by then), and resend is allowed at once |
| `POST /api/auth/forgot-password` | 204 | 204 (unchanged) | **new: 204, nothing sent** | **changed: 204 (was 500)**. No link is left, and asking again at once works |
| Admin and head invites (create parent, head of transport or driver, resend invite) | unchanged | n/a | **never refused**, counted once the invite is kept | unchanged: 500, and the account is not created |

A capped login or resend answers `503` with `Retry-After` (whole seconds to the next midnight in `Asia/Beirut`, at least 1) and a `ProblemDetail` with no `type`, as in [`login-daily-cap.json`](samples/auth-email/login-daily-cap.json) and [`resend-daily-cap.json`](samples/auth-email/resend-daily-cap.json). The answer is the same whichever limit was hit. It reveals nothing, because login and resend are reached only after a correct password or a valid pending token. And nobody who merely knows an address can cause it for that account: reset links and invites never count against an account's sign-in limit (see below), and the reset share leaves room for sign-in. 429 stays the cooldown (and, later, the per-address limit); a screen must not show its "too many attempts" text for 503. Today every screen shows its generic "Something went wrong" for 503.

Forgot-password is 204 for every outcome (unknown or disabled email, cooldown, cap, failed send), with an empty body. A refusal sends nothing and writes no token.

## Where the send happens

The write (code or token, and the cap's row) is one short transaction. The mail is sent after it has committed, on the request thread, so no database connection is held while the provider is called. A send that fails is undone in a second short transaction, and the first error is still what the caller gets:

- **Login:** the new code row is deleted, but only if it is still the one this request made (a login that raced it keeps its own).
- **Resend:** the code row goes back to what it was before the resend (its code, expiry, send time and attempts), so the code the user last received works and resend is allowed at once. Wrong guesses made at either code still count.
- **Forgot-password:** the new token is deleted, if still unused. The user's older links are voided only after the send succeeded, so a failed send leaves the link they already had.

Admin and head invites keep sending inside the transaction that creates the account.

A failed login or resend answers a generic 500 as before. The exception that carries it holds the kind, the user's id and the provider failure's class, not the provider's message, which can contain the address. The same goes for a failed invite.

## The daily cap

Table `auth_emails`, one row per send attempt: user id, kind (`LOGIN_CODE`, `RESEND_CODE`, `RESET_LINK`, `INVITE_LINK`) and time. It holds no email address. Counted from midnight in `Asia/Beirut`, across the deployment. A failed login, resend or reset still counts: the provider was asked, as in [`notification-delivery.md`](notification-delivery.md). An invite counts only once it is kept: it is sent inside the transaction that creates the account, so a failed send rolls its row back with the account (counting it anyway would need a second connection while the first is held, which can deadlock the pool).

A login, resend or reset is refused when any one of these holds:

| Setting | Variable | Default | Refuses when |
|---|---|---|---|
| `wassel.auth.email.daily-cap` | `AUTH_EMAIL_DAILY_CAP` | 120 | today's rows of every kind reach it |
| `wassel.auth.email.reset-daily-cap` | `AUTH_EMAIL_RESET_DAILY_CAP` | 30 | today's `RESET_LINK` rows reach it, so a forgot-password flood cannot starve sign-in |
| `wassel.auth.email.per-account-daily-cap` | `AUTH_EMAIL_PER_ACCOUNT_DAILY_CAP` | 10 | this account's own kind of rows today reach it: sign-in codes and resends together for a login or resend, reset links alone for a reset. Invites count towards neither, and the two never use each other up, so a flood of resets for an address cannot stop its owner signing in |

Each must be at least 1 and the reset cap at most the daily cap, or the app does not start. A refused request writes nothing: a refused login leaves the user's previous code, and a refused resend leaves the old code working. The check and the claim of a slot are one step across instances (an advisory lock, released before the send), so two requests cannot both take the last slot. Forgot-password takes the same lock before it reads its 60-second cooldown, so parallel requests for one address send one link, not one each. The log has one WARN with the user id, the kind and the limit that refused for each refusal, and one WARN each time the count first passes 80 % and 100 % of the daily cap, whether a sign-in or an invite moved it. Logs never hold an address or a code.

### Sharing the provider's quota

The notification cap ([`notification-delivery.md`](notification-delivery.md)) and this cap are separate counts. The rule is `NOTIFICATION_EMAIL_DAILY_CAP + AUTH_EMAIL_DAILY_CAP <= the provider's daily limit - a margin`. Defaults: 150 + 120 = 270 against a limit assumed, not confirmed, to be 300 (Brevo free plan: someone with the account login must read the real figure). The margin covers invites, which are never refused. Each cap has its own lock key (`283_001` in `inbox`, `289_001` in `auth`).

## Known limits

- A provider that accepts the mail and then times out makes us delete or restore a code the user did receive. They ask again, and that is allowed at once.
- A crash between the commit and the send leaves a code nobody received: for resend until it expires (5 minutes), and for login it blocks a new login for 60 seconds.
- An undo that itself fails (no connection in a storm) leaves the same, and is logged at ERROR.
- A failing provider uses up the cap faster than the number of emails delivered suggests.
- If voiding the older links fails after a reset link was sent, they keep working until they expire (logged at ERROR).
- A sustained mail outage is invisible to forgot-password users, who always get 204. The only signal is one ERROR line per failed send; there is no counter yet (S5-D).
- Someone who knows an address can use up its reset limit (10 a day, one a minute) and, with many addresses, the reset share (30 a day). That stops password resets for the day, never sign-ins.
- Forgot-password takes longer for a registered email, because the send is still on the request thread. The status no longer leaks, the timing does.
- Admin invites can push the day over the cap.
- The cap is per deployment, not per school.
- Sessions last 1 hour and 2FA has no off switch, so a day with many returning parents can reach 120. Raise the cap together with the provider's plan.

## Changing this contract

Change it in a PR that tags Hashem, Moustafa and Mohamad.
