# Notification delivery contract (SCRUM-283)

How an inbox entry ([`inbox.md`](inbox.md)) also reaches the parent by email, and how an administrator checks that it did. Build against this page, not against each other's code. One school.

Owner: Hashem (SCRUM-283). Consumers: the administrator's operations check (API only, no screen), the release checklist (SCRUM-286), the end-to-end run (SCRUM-284), Moustafa's independent tests and, by email, parents. Email is the only channel: no web push and no SMS.

## Conventions

- Cookie session, `credentials: "include"`. The one endpoint is for the signed-in **administrator**; the school comes from the session, never from the request.
- `date` is `"YYYY-MM-DD"`, the day in `Asia/Beirut`. Moments are ISO-8601 in UTC with a `Z`. Field names are camelCase.
- Errors are the usual `ProblemDetail` (see [Errors](#errors)).
- Samples are in [`samples/notification-delivery/`](samples/notification-delivery).

## Shapes

### DeliverySummary

| Field | Type | Notes |
|---|---|---|
| `date` | date | the day counted |
| `emailEnabled` | boolean | whether the sender runs in this deployment |
| `dailyCap` | integer | the cap in force, see [The daily cap](#the-daily-cap) |
| `counts` | object | integer fields `pending`, `sending`, `sent`, `failed`, `skipped`: the deliveries **created** that day by their current status. All five keys are always present |
| `reasons` | object | integer fields `PREFERENCE_OFF`, `NO_RECIPIENT`, `DAILY_CAP`, `PROVIDER_ERROR`, `EXPIRED`, `INTERRUPTED`: why `failed` and `skipped` deliveries ended. All six keys are always present |
| `retried` | integer | deliveries of that day that needed more than one attempt, whatever their status |
| `oldestPendingAt` | moment or null | when the oldest `pending` delivery of that day was created; null when none |

A delivery goes `PENDING`, then `SENDING` for the length of one attempt, then `SENT`; or back to `PENDING` while attempts remain; or `FAILED`. `SKIPPED` is final. The summary has no recipients, names, entry types or text, only counts.

## Endpoints

| Method | Path | Role | Success |
|---|---|---|---|
| GET | `/api/admin/notification-deliveries/summary?date=` | ADMIN | 200 `DeliverySummary` |

`date` is optional and defaults to today in `Asia/Beirut`. Only the administrator's own school is counted.

## Rules

### What is emailed, and when

- Every inbox entry ([`inbox.md`](inbox.md)): `PICKED_UP`, `DROPPED_OFF`, `NOT_PRESENT` and `LATE`. "Absence" here means `NOT_PRESENT`: an absence the parent reports makes no entry, so it makes no email.
- Delivery is a separate step after the entry exists. A background job (every 30 seconds) finds entries made in the last 60 minutes, then sends. The driver's confirmation never waits on it and is never affected by it. An email can arrive a little after the entry, and up to about 21 minutes later when the provider is failing; the text says when it happened.
- Switched off by default. `NOTIFICATION_EMAIL_ENABLED=true` turns the sender on; while it is off nothing is discovered, so turning it on later emails only the last 60 minutes of entries.

### At most once

- One entry has one delivery (a unique key), and one caller wins each attempt, so a replayed confirmation, a repeated run of the job, or two instances at once never send the same attempt twice. The attempt is counted when it starts, so a **crash** during a send loses that email and never repeats it; the inbox keeps the entry.
- That holds against a crash, not against a provider error. If the provider accepts an email and the answer then times out, the sender sees a failed attempt and retries it (see below), so that one email can arrive twice. Telling a timeout from a rejection is a follow-up in the mail provider class.
- A delivery stuck in `SENDING` for more than 5 minutes becomes `FAILED` with reason `INTERRUPTED` and is never sent. A delivery whose attempt hits an unexpected error before anything is sent (for example the entry carries data the sender cannot read) is also logged as an error with the exception's class, left as it is and ended as `INTERRUPTED` the same way; it is never retried.

### Skips

A delivery is `SKIPPED`, with no email, when:

- `NO_RECIPIENT`: the parent has no account in the school, the account is disabled (revoked), the address is blank, or the child (or the entry) can no longer be found in the school, so there is no name to put in the email, or the child is **no longer linked to the parent the entry was made for** (the head moved them to another parent or removed the link after the tap). The entry stays in the inbox of the parent it was made for; only the new email is withheld, because it would name the child to someone no longer linked to them.
- `PREFERENCE_OFF`: the parent turned that type off **after** the entry was made and before the email went out. The email re-checks the choice when it is sent. The entry stays in the inbox.
- `DAILY_CAP`: the day's cap is used up, see below. The cap is checked first, so once it is used up a delivery that would have been skipped for another reason also reads `DAILY_CAP`.

### Retry, bound and expiry

- At most 4 attempts. A failed attempt is retried after 1 minute, then 5, then 15. Any error from the mail provider counts as a failed attempt (the reason is `PROVIDER_ERROR`); a delivery out of attempts is `FAILED`. A delivery that is finally sent no longer carries a reason.
- Within one run of the sender, the oldest entries go first.
- A delivery not sent within 60 minutes of its entry is `FAILED` with reason `EXPIRED`.

### The daily cap

At most `dailyCap` send attempts (`NOTIFICATION_EMAIL_DAILY_CAP`, 150 by default) are made from midnight in `Asia/Beirut`, counted from the stored deliveries across the whole deployment. Every attempt counts, a retry and a failed attempt included, because each one asks the provider; skipped deliveries do not. The same mail account sends sign-in codes, so the cap keeps them from running out. A delivery that comes due after the cap is `SKIPPED` with reason `DAILY_CAP`. The check and the claim of an attempt are one step even across instances, so two instances cannot both take the last attempt.

### What the email says

- Subject, always: `Wassel: an update about your child`. It has no name, because subjects show on lock screens.
- Body: the child's current first name, what happened, the time, and a link to the inbox, `<frontend base URL>/parent`. See `samples/notification-delivery/email-picked-up.txt`. The wordings of the four types are:
  - `<Name> was picked up this morning at 07:12.` (or `this afternoon`)
  - `<Name> was dropped off this afternoon at 14:35.` (or `this morning`)
  - `<Name> was not at the stop this morning at 07:05.` (or `this afternoon`)
  - `<Name> is running late for this morning's pickup (07:20).` Late alerts are for the morning only; the time is when the alert was made.
- Times are `HH:mm` in `Asia/Beirut`, the time of the entry. Nothing else about the child or the run: no surname, address, stop, position, estimate, route, vehicle or driver.

### Privacy and monitoring

- Logs and the summary hold ids, counts, attempt numbers and the name of the error class. Never an email address, a name, the text of the email, or the provider's error message.
- The provider's secrets (`BREVO_API_KEY`, `MAIL_*`) come from the deployment's variables and are not touched by this feature. This contract adds no secret.

## Errors

| Case | Status | Body |
|---|---|---|
| No session | 401 | empty |
| Signed in with another role | 403 | `detail` |
| A `date` that does not parse | 400 | `detail: "Invalid request parameter"` |

## Known limits

- **At most once means against a crash.** A crash in the middle of a send loses that email, and a provider timeout after the provider accepted the email can send it twice.
- **A rejected address is retried** up to 3 more times; classifying permanent errors and timeouts is a follow-up.
- **Entries made while delivery was off**, or more than 60 minutes before the job saw them, are never emailed.
- **The cap is per deployment** and counts attempts, so a failing provider uses it up faster than the number of emails suggests.
- **English plain text only,** with no unsubscribe link: the preferences are how to stop.
- **`LoggingMailer` prints the email** in the `local` and `test` profiles only, by design.
- **No metrics endpoint and no screen.** The summary is the only monitoring.

## Changing this contract

Change it by pull request to this file and the samples together, and tag Hashem, Moustafa (the inbox) and the owner of the notification preferences screen (S4-20).
