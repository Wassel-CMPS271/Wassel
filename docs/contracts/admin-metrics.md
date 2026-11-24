# Platform health numbers for the admin (SCRUM-290)

One read-only endpoint that answers "is the platform healthy?" before users report a problem. Build against this page.

Owner: Moustafa (SCRUM-290). Consumer: the admin (an admin page is a stretch of the same ticket and is not built).

| Method | Path | Who | Answer |
|---|---|---|---|
| GET | `/api/admin/metrics` | ADMIN | 200 `Metrics` ([sample](samples/admin-metrics/metrics.json)) |

Any other role is 403, no session is 401. It is **not** an actuator endpoint: `/actuator/health` stays the only open one (SCRUM-285), and no other actuator path is exposed. The numbers belong to the backend, not to one school; the MVP serves one school.

## Metrics

| Field | Meaning |
|---|---|
| `since` | When the backend started. Every number counts from here. |
| `resetsOnRestart` | Always `true`: the numbers are kept in memory, so a restart or redeploy sets them to zero, and each instance counts only its own requests. |
| `requests.total` | Requests answered since `since`, not counting `/actuator/*` and this endpoint (so reading the numbers does not change them). |
| `requests.serverErrors` | Of those, the ones answered with a 5xx status, including a request that ended in an exception. |
| `requests.errorRate` | `serverErrors / total`, or `null` while `total` is 0. Client errors (4xx) are not failures. |
| `requests.tooManyRequests` | Answers with 429: the per-address limit on the sign-in endpoints (SCRUM-288) and the one-code-a-minute rule. |
| `requests.p95Millis` | The 95th percentile (nearest rank) of the time the latest `latencySample` requests took, in whole milliseconds rounded up, or `null` with no requests. |
| `requests.latencySample` | How many requests the p95 is worked out from: the latest 2,000 at most. |
| `signIns.failed` | Sign-ins that did not get through: a 401 from `POST /api/auth/login` (wrong or unknown password, disabled or locked account: one answer by design) and every wrong or expired code at `POST /api/auth/2fa/verify`, including the fifth, which ends the login. A malformed code (not six digits) is rejected before the check and is not counted. |
| `signIns.lockouts` | Accounts locked after too many wrong passwords (SCRUM-171). |
| `notifications.sent` | Notification emails that went out. |
| `notifications.failed` | Deliveries that ended `FAILED`: gave up after the last attempt, expired unsent, or interrupted (SCRUM-283). A retry that later succeeds is not a failure. |
| `notifications.successRate` | `sent / (sent + failed)`, or `null` while both are 0. |

## Known limits

- In memory: nothing survives a restart, and two backend instances would each show their own numbers.
- p95 looks at the latest 2,000 requests, not at everything since `since`, so a slow burst fades out once 2,000 faster requests have followed.
- Time is measured inside the backend (from the first filter to the last), so it leaves out the network and the host's proxy.
- A failed sign-in is counted from the answer, so a rejected-by-limit request (429) is a `tooManyRequests`, not a failed sign-in.
