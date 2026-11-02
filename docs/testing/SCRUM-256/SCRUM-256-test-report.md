# SCRUM-256: independent tests of the invite-head-of-transportation screen

## What was added

One frontend test file, `frontend/src/app/(admin)/admin/head-of-transport/invite.independent.test.tsx`, with 27 tests. The screen is Majd's (SCRUM-97); the tests were written separately by Mohamad, from the five acceptance criteria of SCRUM-97 and from what the backend really answers (`HeadOfTransportController`, `CreateAccountRequest`, `GlobalExceptionHandler`), not from the components.

Only `fetch` is faked, so the page, `headOfTransport.ts` and `request()` all run for real. The access tests run the real `RoleGuard` and the real admin layout, with `/api/auth/me` (`me`) faked and `next/navigation` replaced by a spy on `router.replace`. Majd's own tests (`page.test.tsx`, `headOfTransport.test.ts`) were left alone.

`npm test` is `vitest run`, so CI's `frontend-build` job runs the file with every other test.

## Acceptance criteria of SCRUM-97

| Criterion | Tests | Result |
|---|---|---|
| The admin area has an invite screen with name and email fields that calls the existing endpoint | Titled screen with an email field and a Send invite button; POSTs `{ email }` to `/api/admin/head-of-transport` with the session cookie; one request when the button is pressed twice, and the button is disabled while sending | Met for the email. **There is no name field**, see finding 1 |
| Success is confirmed on screen, and the form clears | A "Invite sent." message in a `role="status"` region, an empty email field, no error left behind; a second invite right after the first | Met |
| An invalid email, or one already in use, gets a clear message | Empty, five malformed emails (no `@`, no domain, no dot, two `@`, a space) each with "Enter a valid email address" and no request sent; the backend's 409 message next to the field with the typed email kept; a backend 400 message next to the field; the old message goes once the email is corrected | Met |
| Only admins can reach the screen | An admin sees it. A head of transportation, a driver and a parent are sent to their own area and never see it. Someone signed out goes to `/login`. Nothing shows while `/me` is still answering | Met on the screen. The backend is the real protection and is covered by `RoleAccessMatrixTests` (`POST /api/admin/head-of-transport` is admin only) |
| Reachable from a card on the admin home | The Head of transportation card links to `/admin/head-of-transport`, the other cards are still there, and the admin navigation has a link too | Met |

The ticket also asks for a server error: a 500 and a dropped network both show "Couldn't send the invite. Please try again.", keep the typed email, don't claim success, and the user can send again (3 tests).

## Do the tests fail when the screen breaks?

Each line was broken on its own, the file's tests run, then the line put back (`git status` clean afterwards).

| Production line broken | Tests that went red |
|---|---|
| Form: the email field is not cleared after success | 2 (confirmation and clearing; a second invite straight after) |
| Form: the email is sent without trimming | **none**, see finding 2 |
| Form: a blank email is not rejected | 1 |
| Form: a malformed email is not rejected | 5 (one per bad email) |
| Form: the backend's field error is not shown | 3 (409, 400, correcting the email) |
| Form: a server error shows no message | 3 |
| Form: the button is not disabled while sending | 1 |
| Page: no confirmation after success | 3 |
| API module: wrong path | 1 |
| API module: the email is not in the body | 3 |
| Admin layout: the area is open to a head of transportation, not admins | 3 |
| Admin home: the card links to the wrong page | 1 |
| Admin navigation: the link is missing | 1 |

12 of 13 broken lines were caught, each by the tests meant for it. The thirteenth cannot be caught from the screen (finding 2).

## Findings

No test failed, so nothing was raised on Majd's PR (#87, already merged).

### 1. The ticket asks for a name field; the screen has only an email

SCRUM-97's first criterion says "name and email fields". The screen has only an email, and so does the backend: `CreateAccountRequest` takes `email` alone, and `headOfTransport.ts` says so ("There is no name field"). The ticket text is out of date, not the screen: a name field would be thrown away by the backend. If the team wants names, it is a backend change (a `name` on `User` and on the DTO) before it is a screen change. Suggest amending the criterion in Jira.

### 2. The email is trimmed in code, but the input never gives it a space to trim

`HeadOfTransportForm` calls `onInvite(email.trim())`, and the test "sends the email without the spaces around it" passes, but it also passes with `.trim()` removed. The field is `type="email"`, and the browser (and jsdom) strip the spaces around an email before the form reads it. The line is harmless and can stay as a second guard; it just cannot be tested through the screen.

### 3. Small observations, no action needed

- The confirmation is "Invite sent." and doesn't say to whom. With one field that is clear enough.
- The screen shows no list of heads of transportation already invited, because the backend has no endpoint to list them. Not in the criteria.
