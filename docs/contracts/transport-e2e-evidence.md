# Transport E2E evidence (SCRUM-284)

What the real-stack transport run (`Transport E2E`, job `transport-e2e`) leaves behind when it fails, and what it never leaves. No HTTP contract changes: this page covers the one file the run writes and who reads it. Samples are in [`samples/transport-e2e/`](samples/transport-e2e).

Owner: Hashem (SCRUM-284). Consumers: CI (the job summary and the check step), the release checklist (SCRUM-286: the release candidate commit must have a green `Transport E2E` run) and Moustafa's independent review.

## What the run proves

`node e2e/review-transport.mjs` from `frontend/`, on a real PostgreSQL with Flyway, the real Spring app and the real Next proxy. Four tests: the Head reassigns a live run in the UI and the old driver's every write is a 404 (including the replay of a key he used before) while the new driver continues; the reassignment failures 401, 403, 404 and a stale 409; offline taps that survive a reload and send once; the notification email text, the muted type and the admin's counts. GPS to the parent map and the inbox are covered by `parent-tracking-review`, `parent-driver-ui` and `parent-inbox`, which this run does not repeat. The launcher turns notification email on and points the address lookup at a closed port, so the backend makes no outside call (mail goes to its own log); the parent map in the browser still loads OpenStreetMap tiles.

## The summary file

`frontend/e2e-artifacts/transport-summary.json`, written by `e2e/transport-reporter.ts` and also rendered as Markdown to `$GITHUB_STEP_SUMMARY`. It is **never uploaded**: no traces, videos, screenshots, HTML report, `backend.log` or `credentials.json` leave the runner.

| Field | Type | Notes |
|---|---|---|
| `suite` | `"transport"` | |
| `status` | `"passed"` or `"failed"` | `failed` when any test did not pass, when no test ran, or when the backend logged an `ERROR` |
| `durationSeconds` | integer | the whole run |
| `tests[]` | `{ title, file, status, durationSeconds, failure? }` | `status` is Playwright's (`passed`, `failed`, `timedOut`, `skipped`, `interrupted`); `file` is the base name; `failure` only when the test did not pass. `title`, `file` and `failure.step` are the test author's words, copied as written: they may name the public seed's first names (Karim, Lea, Jad), never an address or a code |
| `failure.line` | integer or null | the line of the failing assertion |
| `failure.step` | string or null | the last top-level `test.step` that failed, the test author's own wording |
| `failure.lastApiCall` | `{ method, path, status }` | the last API call the test made before it failed; ids in `path` are `{id}` and there is no query string |
| `failure.assertion` | `{ matcher, expected, received }` | `expected` and `received` are kept only when a number, `true`/`false` or one of `PICKED_UP`, `NOT_PRESENT`, `DROPPED_OFF`, `LIVE`, `STALE`, `UNAVAILABLE`, `IN_PROGRESS`, `FINISHED`, `NOT_STARTED`; anything else is `"[omitted]"` |
| `serverErrors[]` | `{ logger, level, count }` | `ERROR` lines the backend logged during the run, counted by logger name; never the message |
| `leakCheck` | `"passed"` | set by the reporter after it checked the file against the patterns below and the run's own password |

It is built from an allowlist (`e2e/transport-evidence.ts`): Playwright's error message, response bodies, emails and codes are never read, so they cannot reach the file. The only free text is the three author-written fields above, and the leak check covers them too. If the leak check finds anything the file is not written and the run fails. The reporter also fails the run when the backend log has no readable events (its shape changed, so "no errors" would mean nothing).

When the tests begin the reporter writes a placeholder, `{ "suite": "transport", "status": "incomplete" }`, and replaces it with the summary at the end. The launcher deletes any file left by an earlier run first, so the file on disk is always this run's, or a placeholder that says it did not finish.

The log: on GitHub (`GITHUB_ACTIONS` set) only this reporter prints, so the public job log holds the same allowlisted text as the summary. Locally Playwright's list reporter prints too, with its full assertion text.

## The check step

`node e2e/check-transport-summary.mjs` runs after the tests, whatever their result. It fails when the file or its Markdown holds an email address, `token=`, a JWT, a `wassel_token` or `wassel_2fa` cookie name or the text of a verification email, when `leakCheck` is not `passed` (the placeholder, or a withheld summary), or when the file lists no tests. Only a summary that passes is written to `$GITHUB_STEP_SUMMARY`, by this step and not by the reporter. With no file (the stack never reached the tests, and the main step has already failed the job) it passes with a note.

## Known limits

- It is not a required status check, and no branch protection changes with it. The release checklist asks for a green run on the release commit instead.
- Offline testing stops at a network interruption: a cold page load with no network needs a service worker, which does not exist.
- Cross-school access cannot be shown with one school. The nearest check is a random run or student id, which answers 404.
- Physical GPS, payments and a deployed smoke run are not covered (SCRUM-286, SCRUM-296).
