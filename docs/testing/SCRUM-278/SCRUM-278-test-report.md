# SCRUM-278: independent tests of the parent live map (SCRUM-279, PR #149) and the parent inbox/notification preferences (SCRUM-280, PR #150), test report

Written by Majd, the independent tester of Wassim's SCRUM-279 and SCRUM-280. Dated 16 November 2026.

## What was added

Four frontend test files and one shared harness, no production file and no existing test file touched:

- `frontend/src/app/(parent)/parent/tracking.independent.test.tsx` — SCRUM-279, 43 tests.
- `frontend/src/app/(parent)/parent/authorization.independent.test.tsx` — SCRUM-280's own authorization/cross-parent criterion, 8 tests.
- `frontend/src/app/(parent)/parent/inbox.independent.test.tsx` — SCRUM-280, 16 tests.
- `frontend/src/app/(parent)/parent/preferences.independent.test.tsx` — SCRUM-280, 13 tests.
- `frontend/src/test-support/parentAcceptance.ts` — the shared harness: a stateful fake server behind a stubbed `fetch`, the contract samples, and a `FakeMapView` stand-in. It imports no production oracle (not `parentTracking.ts`, not `parentNavigation.ts`): expected values are `docs/contracts/samples/**` JSON, used raw, plus numbers worked out by hand in its comments.

No `.skip`, `xit`, `xdescribe` or `test.todo` appears in any of the four files; every one of the 80 tests below actually ran.

## Commits tested

| What | Ref |
|---|---|
| PR #149 (SCRUM-279) head | `24701a1092f3c1589fade5216a2abd55281cb5e2` |
| PR #150 (SCRUM-280) head | `e1bc4c71a626c7167ca324eccfc0f5bdd58cf522` |
| `develop` | `1dd8830856031ab29fd860cc3cb64ba1de50ee2e` |
| This branch (`test/SCRUM-278-parent-ui-tests`), HEAD | `0941bdb7f5b3be6d1b779c12cedde0bf2a705213` |

`e1bc4c7` is the newest commit under `frontend/src/app/(parent)/parent/`; #149 and #150 are both already merged into `develop` and into this branch, so the code under test here is the merged result, not a candidate checkout.

## Scope and method

- Every test renders the real `ParentLayout` and `ParentPage`, so the real `RoleGuard`, the real `request()` client (`frontend/src/lib/api/client.ts`) and the real screens run end to end. Only three things are replaced: global `fetch` (`vi.stubGlobal`, per `frontend/CLAUDE.md`), `next/navigation`'s router, and `MapView` (a `FakeMapView` that renders each marker's label and exact coordinates as text, so a test can prove a marker is or is not on screen without a real Leaflet/tile stack).
- No sample or fixture client is swapped in: `page.tsx` already wires `parentInboxApi`, `notificationPreferencesApi` and `getBusLocation` for real, so the fake server is the only thing standing in for the backend.
- Expected values come from `docs/contracts/samples/runs/*.json` and `docs/contracts/samples/inbox/*.json`, used as-is, plus the hand-computed countdown/arrival numbers documented in `parentAcceptance.ts` (e.g. `secondsAway 350 = 5m 50s`, `arrivesAt` UTC + 3 h = Asia/Beirut school time). No test imports a helper from the code under test to compute its own expectation.
- No production code was touched to make a test pass or fail. No test assertion was loosened, skipped or marked expected-failure to get a clean run; the 9 failures below are reported as found.

## How to run

```
cd frontend
npx vitest run "src/app/(parent)/parent/tracking.independent.test.tsx" "src/app/(parent)/parent/authorization.independent.test.tsx" "src/app/(parent)/parent/inbox.independent.test.tsx" "src/app/(parent)/parent/preferences.independent.test.tsx"
```

or `npm test` (`vitest run`) to run them inside the whole frontend suite, as CI's `frontend-build` job does.

Full frontend regression with these four files added: **1021 tests, 1005 passed, 9 failed, 1 pre-existing expected failure, 6 pre-existing skips (74 files)**. The 9 failures are exactly the 6 (SCRUM-279) + 3 (SCRUM-280) below; no other test in the suite was broken by adding these files.

## SCRUM-279 — results: 43 tests, 37 pass, 6 fail

| Jira criterion | Tests | Result |
|---|---|---|
| AC1 — a parent sees only their own linked child's bus, and only after Bus tracking is opened | `requests nothing about a bus before Bus tracking is opened, then only the selected linked child's bus-location, with the session cookie and no identity parameter`; `offers only the children from /children and never requests an id outside that list`; `makes no bus-location request and draws no marker for a child the backend says is not waiting (sample Tarek, stopsLeft null)` | 3/3 pass |
| AC2 — wrong role, signed out, or a poll losing ownership (401/403/404), without leaking the reason | `redirects a ADMIN/DRIVER/HEAD_OF_TRANSPORT session … with zero /api/parent requests` (×3); `sends a signed-out visitor (401 on /me) to /login with zero /api/parent requests`; `removes the map, the coordinates and the countdown when a poll answers 403/404, without showing the server's reason` (×2); `tells a parent the same thing for 403 and 404, so the reason (another parent's child or unknown) is not revealed`; `removes earlier coordinates and offers Sign in (to /login) when a poll answers 401` | 8/8 pass |
| AC3 — the live estimate is shown apart from the planned time | `shows the planned time (07:18, not a live estimate) and the live countdown (5m 50s, arriving 07:21) as separate elements`; `counts down from the server's secondsAway with monotonic time, and a device clock change does not move it`; `treats secondsAway 0 as 'due', never as 'arrived'`; `shows no countdown when the server sends no estimate, even with a planned time` | 4/4 pass |
| AC4 — stale/missing GPS is labelled and never shown as live | `labels a STALE fix as last seen 140 s ago, marks it 'last known', and shows no countdown and no 'late' wording`; `says the location is unavailable, draws no map and no countdown, and keeps the stops remaining`; `ages a LIVE fix on the client: stale after 60 s with the countdown gone, no marker after 300 s, while the next poll hangs`; `never shows a countdown or a 'live' label for a response that breaks the freshness contract` (×2, STALE-with-estimate and LIVE-at-200s); `draws no marker for a LIVE response without a position` | 6/6 pass |
| AC5 — multiple children and switching between them | `switches to the second child's own URL and drops the first child's map at once`; `never shows a late reply for the first child under the second, and stops polling the first` | 2/2 pass |
| AC6 — no active run, loading, errors and Retry | `says so for %s, with no request, no map and no countdown` (×3: no run, not started, finished); `polls the bus location every 15 seconds while the run is live`; `shows a loading state with no map and no countdown while the first answer is pending`; `shows a generic error after %s, then Retry recovers to the live bus` (×2: 500, network) — 7 pass. `picks up a run that starts while the tracking screen is open (NOT_STARTED, then IN_PROGRESS on the server) within two minutes` — **fails, D1**. `stops polling after a %s (sign-in expired or access revoked)` (×3: 401, 403, 404) — **all three fail, D2** | 7/11 pass, 4 fail |
| AC7 — an afternoon run never shows morning wording | `shows the afternoon countdown (7m 50s, arriving 14:38) and no morning wording or time`; `shows no morning wording or time when the afternoon GPS is unavailable` — 2 pass. `shows no morning wording or time while the afternoon location is loading`; `shows no morning wording or time after an afternoon load error` — **both fail, D3** | 2/4 pass, 2 fail |
| AC8 — navigation is preserved | `goes to Inbox and back without re-authenticating, stops polling while away and resumes on return`; `goes from tracking to My children and to Absences, stopping the tracking poll`; `after a reload (remount) against the same server, the started run is shown live (positive control for the in-screen case)` | 3/3 pass |
| AC9 — a 360px-appropriate structure (as far as jsdom can check) | `gives every control on the tracking screen a 44px tap target, in the unavailable and the signed-out states`; `sets no fixed width wider than 360px anywhere on the live tracking screen, and the child selector fills the width` | 2/2 pass |

## SCRUM-280 — results: 37 tests, 34 pass, 3 fail

| Jira criterion | Tests | Result |
|---|---|---|
| Criterion 1 — real event statuses and an accurate unread count | `shows the three sample events plus a LATE event with their own wording and read status, and a count read from /unread-count rather than the list length`; `marks one event read, refetching the list and count from the server, and the result survives a reload`; `marks all read via a 204 with no body, dropping the count to 0 and disabling Mark all, and this persists after a reload`; `sends ?unread=true when Unread only is checked`; `shows no unread badge anywhere, and makes no unread-count request, before the Inbox is opened` — 5 pass. `uses singular wording for exactly one unread update` — **fails, D6** | 5/6 pass, 1 fail |
| Criterion 2 — wrong roles, signed-out, 401 mid-session, and no cross-parent leakage | `redirects a ADMIN/DRIVER/HEAD_OF_TRANSPORT session to … without any inbox or preferences request` (×3); `sends a signed-out visitor (401 on /me) to /login without any inbox or preferences request`; `returns 404 when marking read an id no longer this parent's own … with no fake receipt and no server detail shown`; `shows a generic message for a 403/404 on the inbox list load, never the server's detail` (×2); `401 mid-session (sign-in expires while the inbox is already open) clears the data and offers Sign in` | 8/8 pass |
| Criterion 3 — preferences are read and saved through the agreed API | `loads the five fields from the server`; `saves all five fields at once (JSON.parse(init.body)), including a false value, and shows the saved result`; `shows the saved values after a reload`; `401 shows Sign in and hides the choices, and also hides the inbox above it`; `403 shows 'no access' and hides the choices`; `blocks 4/61 minutes on the client, sending no PUT` (×2); `ignores a double submit while the first save is in flight`; `recovers after a failed save: the alert shows, the entered values stay, and resubmitting succeeds`; `never claims to mute, suppress or create a notification itself` — 10 pass. `shows a 400's field errors on the right field and leaves the form usable` — **fails, D5** | 10/11 pass, 1 fail |
| Criterion 4 — loading, empty, error-and-retry, and the Inbox button when only children fails | `shows 'Loading inbox…' while the list and count are pending`; `shows 'No transport updates yet.' and disables Mark all when the inbox is empty`; `shows a generic alert after a 500/network failure on the list, then Refresh inbox recovers` (×2) — 4 pass. `keeps the Inbox button usable when only the children list fails` — **fails, D4** | 4/5 pass, 1 fail |
| Criterion 5 — pickup, drop-off, not-at-the-stop and late wording; no absence event is invented | `shows its own wording for each of the four entry types`; `reads 'Afternoon run' (not 'Morning run') for an afternoon drop-off`; `shows NOT_PRESENT as 'Not at the stop', the only absence-shaped entry the contract defines` | 3/3 pass |
| Criterion 6 — a 360px-appropriate inbox and preferences form, as far as jsdom can check | `gives every control in the inbox/preferences a 44px tap target` (×2); `sets no fixed width wider than 360px anywhere on the inbox screen / in the preferences form` (×2) | 4/4 pass |

## Verified failures — do not suppress

### D1 — a run starting while the tracking screen stays open is never picked up

- **PR**: #149 (SCRUM-279). **File**: `frontend/src/app/(parent)/parent/TrackingPanel.tsx:25`.
- **Failing test**: `picks up a run that starts while the tracking screen is open (NOT_STARTED, then IN_PROGRESS on the server) within two minutes` (`tracking.independent.test.tsx`).
- **User-visible effect**: a parent who opens Bus tracking before the driver starts the run sees "Run not started." and it never changes, even two minutes after the run goes `IN_PROGRESS` on the server. The screen only shows the live bus after the parent leaves and comes back (a remount — covered separately by the passing positive control, `after a reload (remount) against the same server, the started run is shown live`).
- **Why**: `const waiting = child.todayRun?.state === "IN_PROGRESS" && …` (line 25) is computed once from the `child` prop on every render, but nothing ever re-fetches that child's `todayRun` while the panel is mounted — there is no polling of `/api/parent/children`, only of the bus-location endpoint, and that polling effect does not start until `waiting` is already true. A `NOT_STARTED`/`FINISHED` run is never rechecked.
- **Expected behaviour**: SCRUM-279's acceptance criteria (AC6, "no active run, loading, errors and Retry") and the contract's live-tracking intent both assume the screen reflects the server while it is open, not only across a reload.
- **Suggested fix**: have `TrackingPanel` (or its caller) periodically re-read `child.todayRun.state` — e.g. a coarser poll of `/api/parent/children` while a child is selected but not yet `waiting` — so a `NOT_STARTED` run transitioning to `IN_PROGRESS` starts the live-tracking effect without the parent needing to navigate away and back.

### D2 — polling continues after a 401, 403 or 404

- **PR**: #149 (SCRUM-279). **File**: `frontend/src/app/(parent)/parent/TrackingPanel.tsx:38`.
- **Failing tests**: `stops polling after a 401 (sign-in expired or access revoked)`, `stops polling after a 403 (sign-in expired or access revoked)`, `stops polling after a 404 (sign-in expired or access revoked)` (`tracking.independent.test.tsx`).
- **User-visible effect**: after the bus-location poll answers 401, 403 or 404 — the parent's session expired, or the child is no longer theirs to see — the screen correctly shows the error, but the panel keeps polling every 15 seconds anyway. In the test, two more polls landed in the following 60 seconds.
- **Why**: `finally { if (active) timer = setTimeout(() => void load(), 15_000); }` reschedules unconditionally, regardless of the `catch` branch's `error` status. There is no distinction between a retryable failure (network blip, 500) and a permanent one (expired session, lost or revoked access to that child).
- **Expected behaviour**: once ownership or authorization is gone, nothing about that child should be requested again until the parent acts (Retry, sign-in, or picking a different child) — the same way AC2's 401/403/404 cases already stop the *displayed* data from reappearing, this should also stop the *requests*.
- **Suggested fix**: in the `catch`/`finally` of `load()`, skip rescheduling (or clear the interval) when `error` is 401, 403 or 404; keep the 15 s retry only for the other cases (network failure, 5xx, timeout).

### D3 — an afternoon run can show "Planned morning pickup" while loading or after an error

- **PR**: #149 (SCRUM-279). **File**: `frontend/src/app/(parent)/parent/TrackingPanel.tsx:60`.
- **Failing tests**: `shows no morning wording or time while the afternoon location is loading`, `shows no morning wording or time after an afternoon load error` (`tracking.independent.test.tsx`).
- **User-visible effect**: for a child on an afternoon run, while the first bus-location answer is still pending, or after it fails, the panel shows "Planned morning pickup: 07:21. This is not a live estimate." — the morning pickup time, labelled as a morning pickup, even though the run is a drop-off.
- **Why**: `{!progress && <p …>Planned morning pickup: {child.expectedPickupTime ?? "Not available"}…}` (line 60) hardcodes "morning" and always reads `expectedPickupTime` (the morning value) whenever `progress` is not yet available — which is exactly the loading and error states, since `progress` only exists once a successful response has arrived. The already-correct direction-aware wording a few lines down (line 63, `{child.todayRun?.direction === "AFTERNOON" ? "drop-off" : "pickup"}`) is not reused here.
- **Expected behaviour**: SCRUM-279 AC7 ("an afternoon run never shows morning wording") applies in every state, not only once the live answer has arrived — the passing case for the resolved afternoon view (`shows the afternoon countdown … and no morning wording or time`) shows the intended behaviour is already right once `progress` exists.
- **Suggested fix**: pick the fallback label and the time field from `child.todayRun?.direction` the same way the resolved view already does (e.g. share one `pickupOrDropoff`/`plannedFallbackTime` computation), instead of hardcoding "morning"/`expectedPickupTime` for the not-yet-loaded and error states.

### D4 — the Inbox button is disabled when only the children list fails

- **PR**: #150 (SCRUM-280). **File**: `frontend/src/app/(parent)/parent/ParentHome.tsx:104`.
- **Failing test**: `keeps the Inbox button usable when only the children list fails` (`inbox.independent.test.tsx`).
- **User-visible effect**: when `GET /api/parent/children` fails (500 or network failure) but the inbox backend is fine, the whole Home screen shows its failed-to-load alert, and Inbox — which needs no child list — is also disabled, so the parent cannot reach their transport updates at all until the children list recovers.
- **Why**: `disabled={state.kind !== "loaded"}` (line 104) ties the Inbox nav button to the same `state` that only tracks the children fetch. Bus tracking is correctly gated on `!children.length` (it needs a child to track), but Inbox has no such dependency — `ParentInboxHome`/`page.tsx` wire it from the session alone.
- **Expected behaviour**: SCRUM-280's own criterion 4 ("loading, empty, error-and-retry, and the Inbox button when only children fails") expects Inbox to stay reachable when it is specifically the children list that is down.
- **Suggested fix**: drop the `state.kind !== "loaded"` condition from the Inbox button (or replace it with a check that is actually about Inbox's own readiness, e.g. whether the session is known), so a children-list failure no longer blocks an unrelated destination.

### D5 — a 400 on preferences shows only the lateAfterMinutes error; the other field errors go into one generic alert

- **PR**: #150 (SCRUM-280). **File**: `frontend/src/app/(parent)/parent/NotificationPreferencesPanel.tsx:38`.
- **Failing test**: `shows a 400's field errors on the right field and leaves the form usable` (`preferences.independent.test.tsx`).
- **User-visible effect**: when the backend's 400 names more than one invalid field (e.g. a boolean field sent as something else, alongside an out-of-range `lateAfterMinutes`), only the minutes field gets its own inline error; every other field's message (e.g. the "Picked up" checkbox's error) is joined into a single unrelated `role="alert"` banner above the form, not next to the checkbox it is actually about.
- **Why**: `fail()` (line 38) special-cases `lateAfterMinutes` (`setFieldError(cause.errors.lateAfterMinutes)`) and dumps everything else in `cause.errors` into one joined string via `setError(...)`, with no per-field slot for the four boolean choices.
- **Expected behaviour**: `frontend/CLAUDE.md`'s API-calls rule for `ApiValidationError` is explicit: "show each message next to its field." The contract's preferences PUT can return an `errors` map with any of the five fields, not only `lateAfterMinutes`.
- **Suggested fix**: give each boolean choice (and `lateAfterMinutes`) its own error state (or a small `Record<string, string>` keyed by field) from `cause.errors`, and render each message next to its own checkbox/input instead of folding the non-minutes errors into the generic `error` alert.

### D6 — "1 unread updates" is always plural

- **PR**: #150 (SCRUM-280). **File**: `frontend/src/app/(parent)/parent/InboxPanel.tsx:71`.
- **Failing test**: `uses singular wording for exactly one unread update` (`inbox.independent.test.tsx`).
- **User-visible effect**: with exactly one unread entry, the inbox reads "1 unread updates" instead of "1 unread update".
- **Why**: `<p role="status">{visible.count} unread updates</p>` (line 71) has no singular/plural branch.
- **Expected behaviour**: ordinary English pluralization for a user-facing count; the same pattern is already used correctly elsewhere on the Home screen (`ParentHome.tsx`'s `{state.children.length === 1 ? "child" : "children"}`).
- **Suggested fix**: `{visible.count} unread update{visible.count === 1 ? "" : "s"}`.

## Limits and not-defects

- **jsdom cannot measure a real 360px layout.** AC9/criterion 6 only check what jsdom can actually see: every interactive control's inline `minHeight`/`style.minHeight` is `44px`, and no element sets an inline `width`/`minWidth`/`flexBasis` over 360px. Neither check is a real-viewport render; wrapping, overlap and genuine overflow at 360px are not covered.
- **Muting by preference and LATE-alert generation are backend behaviour**, not tested here. These test files only exercise the frontend's reading, saving and rendering of whatever the fake server returns; whether a muted preference actually suppresses a future `LATE`/confirmation event, and whether the once-a-minute scheduler correctly generates one, are server-side and out of scope for this frontend-only pass (see `docs/contracts/inbox.md`'s `LATE` generation rule and `notification-delivery.md`).
- **Contract/Jira wording gap on absences, not re-litigated here**: `docs/contracts/inbox.md:65` says plainly "An absence the parent reports is not an entry," and `NOT_PRESENT` is the driver's own not-at-the-stop confirmation (tested and passing: `shows NOT_PRESENT as 'Not at the stop', the only absence-shaped entry the contract defines`). SCRUM-280's Jira wording instead talks about "absence updates" appearing in the inbox. Wassim's own SCRUM-280 report already flags this exact gap; this report does not re-decide it, and no test asserts a parent-reported absence should or should not create an inbox entry.
- **No unread badge exists anywhere before the Inbox is opened.** `shows no unread badge anywhere, and makes no unread-count request, before the Inbox is opened` passes — there genuinely is no such badge on `ParentHome`'s nav or elsewhere. Whether SCRUM-280's acceptance criteria require one is ambiguous from the ticket text available; this is noted as a gap, not asserted as a defect.
- **Tests fixed during this run**: none. All four files and the shared harness were run cold, without modification, and the 9 failures above reproduced on the first run with the exact counts reported (43/37 and 37/34); no assertion was loosened, retried, or adjusted to make a test pass.

## Conclusion

As merged at `24701a1` (#149) and `e1bc4c7` (#150), SCRUM-279's AC1–AC5, AC8 and AC9 and SCRUM-280's criteria 1 (except singular wording), 2, 3 (except multi-field 400 display), 5 and 6 hold up against the real client and the contract samples: ownership/role checks leak nothing, the live estimate and planned time stay visibly separate, stale/missing GPS is never shown as live, multiple children are correctly isolated, navigation preserves and restores tracking, and the inbox/preferences read-and-save path, event wording and 44px/360px structure are all correct as far as these tests can see. Six distinct, reproducible defects remain open against the two PRs: a started run is never picked up while the tracking screen stays open and polling never stops after a permanent 401/403/404 (both SCRUM-279 AC6), afternoon runs can briefly show morning wording while loading or erroring (SCRUM-279 AC7), the Inbox button is wrongly gated on the unrelated children-list load (SCRUM-280 criterion 4), a multi-field 400 on preferences only surfaces one field's error (SCRUM-280 criterion 3), and the unread count is never singular (SCRUM-280 criterion 1). None of these were fixed here, per SCRUM-278's own rule of leaving that decision to Wassim and the PO.
