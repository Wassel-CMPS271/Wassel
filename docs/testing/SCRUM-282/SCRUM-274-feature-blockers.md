# SCRUM-274 acceptance blockers for the feature owner

Verified 28 November 2026 against accepted `develop` `f29b72e` and the corresponding operations source on PR #151. This records missing product scope; it does not implement a substitute contract or change Jira status.

Owner: **Majd Al Halabi** (SCRUM-274 assignee), with the backend/product owners needed for the Head lateness contract or an explicitly approved scope split.

## Missing Head late / not-started runs

[SCRUM-274](https://majdhalabi.atlassian.net/browse/SCRUM-274) requires authorized active/late runs. Majd's [26 November changes-requested review on PR #151](https://github.com/Wassel-CMPS271/Wassel/pull/151#pullrequestreview-6080834753) confirms this criterion remains incomplete after #168 merged.

- `frontend/src/app/(head-of-transport)/head-of-transport/live/liveRuns.ts` filters every run other than `IN_PROGRESS`; an unstarted run cannot appear in the live control list.
- Its `ActiveRunView.serverLateFlag` is always `null`, explicitly awaiting a Head endpoint. No agreed Head lateness response exists in the inspected contract.
- `docs/contracts/runs.md`, "Live ETA and stop progress", forbids deriving lateness by subtracting planned and live estimates. GPS `STALE` describes freshness, not lateness. Parent `LATE` Inbox events do not supply the Head API.

Required next action: agree and implement a school-scoped, authorized Head lateness contract and render its late/not-started runs, or have the product owner explicitly approve and record a scope split in Jira. Add independent late/not-started acceptance tests when the intended contract is defined. Do not invent DTO fields, replace server lateness with a clock heuristic, or count the current passing active-run slice as completion of this criterion.

## Reassigning a driver before the run starts

The backend's reassignment contract accepts `NOT_STARTED` and `IN_PROGRESS`. The current live UI exposes reassignment only through in-progress rows. Therefore a replacement cannot be initiated here for an absent driver whose run has not started.

Required next action: the feature owner must make the supported `NOT_STARTED` reassignment accessible while retaining the seen-driver guard, authorization, audit history, and confirmation counts. Verify it with a real backend and independent UI/browser tests. PR #151 now asserts the actual client receipt rather than comparing two fixture objects.

## Remaining independent verification

The existing address/replay browser scenarios cover those flows at 360px; they are not live-control coverage. Head live control still needs its own 360px layout and real-stack run/reassignment verification, including wrong-role/school boundaries, concurrent changes and preserved history/confirmations. Existing unit tests cover available views, status propagation and the reassignment trigger only.

SCRUM-274 currently reads **Done** in Jira, but no recorded approval of the missing scope was found. This report does not change that status. PR #151 remains **Draft** until the acceptance gaps are resolved or formally scoped, current checks pass, and the test revisions receive re-review.
