# SCRUM-249 — Parent absences

## Current-source verification — 9 November 2026

Resumed the existing branch and merged develop 8a249e8 without rewriting its history. Preserved original Parent Home snapshot 8167c2a, original absence commits, and all historical test evidence. PR #119 and SCRUM-238 are merged; the old base/backend blockers below are superseded. Parent Home refresh, run status, authorization and logout remain intact. Added explicit upcoming/ongoing labels and method=post to this ticket's form.

- Full frontend regression: **752 passed, 1 existing expected failure, 6 existing skipped (759 total, 54 files)**. The first run had one unchanged roster focus race (751 pass/1 failure); that suite passed on untouched develop and the unchanged full rerun passed. Both logs are retained; no assertion, timeout or failure gate was weakened.
- Focused current absence tests after the test-query type correction: **43 passed, 0 failed/skipped**. Removed unsupported exact options from role queries; string accessible-name matching remains exact by default.
- ESLint: **passed**. Next.js production build: **passed** through the actual E2E launcher with the same-origin backend proxy.
- Standalone tsc: **fails with the same 13 diagnostics as untouched develop**, byte-for-byte compared at the diagnostic-line level. These are existing Admin invite fixture schoolId, SCRUM-229 callback and Parent Home sample-enum typing errors. No new absence or E2E diagnostic remains. No global ignore/check setting was changed.
- Real browser E2E: **1 passed**, current frontend/backend source, real password/2FA, isolated native PostgreSQL and all real Flyway migrations. Single day/inclusive range, exact-repeat 200, overlap 409, Keep/confirmed cancellation, in-place updates, reload persistence, client/server past/inverted dates, foreign-child GET/POST/DELETE 404, sibling isolation, actual revocation 401/restored retry, cleanup and 360px overflow/crash checks passed. The 360px screenshot was visually inspected.
- Added reusable frontend/e2e/absences.e2e.ts using the merged auth helpers and an absences suite selector in the existing runner, with a separate PostgreSQL GitHub Actions job. No duplicate seed/backend implementation, intercepted response or fake production data was introduced. Authentication logs, credentials and traces are not uploaded by this job.

Evidence stays ignored under tmp/SCRUM-249-20261109 and frontend/e2e-artifacts; historical directories are retained. CI results will be verified on the pushed current commit. Only absence UI/client/tests/report plus its runner command and CI job are in the final PR diff (12 files). Backend source and migrations are unchanged.

Remaining delivery gates: inspect actual GitHub CI, request Majd's independent review, and integrate only after required approval. Jira remains unfinished until the code is merged; no automatic merge is authorized in this workflow. Historical no-push restrictions below describe earlier sessions and are superseded by the current explicit delivery authorization.

## Current verification — 3 November 2026

Integrated the finished SCRUM-248 implementation by merge while retaining the original snapshot 8167c2a8630dd5290ad35cd97076441058416b45 and existing absence commit 0f218224c9dddcb535f43be980c3bb4a1878026b. The real SCRUM-238 API is present. Parent Home's temporary sample adapter is deleted; absence requests already used the authenticated real endpoint and have no sample fallback. No absence screen was recreated.

Current complete frontend regression: **666 passed, 6 existing skipped**, 49 files; all 43 independent absence tests retained. ESLint, production build with the real same-origin API proxy and the absence-only PR diff check passed. An initial test invocation mistakenly inherited deployment-only NEXT_PUBLIC_API_BASE_URL="", causing 63 existing API URL expectations to fail; rerunning the unchanged suite in its normal default environment passed. No test/assertion was weakened.

**Real PostgreSQL/Flyway browser workflow passed without API interception:** actual Parent/Head password and emailed-code authentication; choosing an owned child with no route; single-day 201; exact-repeat 200 with no duplicate; inclusive-range 201; overlapping range 409 with visible field/plain-language errors; Keep versus confirmed DELETE 204; in-place updates; persistence after reload; client and server past-date rejection; server inverted-range 400; foreign-child GET/POST/DELETE 404; switching siblings without leaking records; actual session revocation returning 401 with a sign-in link, restore and successful retry; cleanup to an empty persisted list. 360px real browser geometry had no overflow or page crashes; the screenshot was visually inspected. Ongoing historical truncation remains component- and backend-test covered rather than fabricated through the public API.

Ignored evidence: tmp/SCRUM-249-final/{tests-default-env.log,tests.log,lint.log,build.log,real-browser.log,absence-real-360.png,absence-real.cjs,run-real.mjs}. The real harness reuses the existing SCRUM-177 isolated seed/launcher on separate ports 4189/18189/55441. Old fixture-only screenshots/results are retained separately as historical evidence, not used to claim backend integration. The historical focus bug was fixed in this ticket's own panel; no teammate product code was modified.

Remaining delivery gate: Parent Home PR #119 is not yet merged. Preserve this complete absence implementation locally and do not submit a develop PR containing duplicate Parent Home changes. Once the accepted base is merged, reconcile it without rewriting shared history, confirm only the eight absence files differ, refresh checks, push the branch, submit the complete absence PR, request Majd's independent review and verify CI before Jira In Review. The backend dependency itself is no longer blocked. Required cloud CI's unrelated test-clock issue was fixed upstream in PR #117; refresh the base before final submission.

## Historical verification and preservation

30 October 2026. Jira: In Progress. Local implementation; no push or PR.

Preservation update, 31 October 2026: the user authorized a local-only commit of this verified UI, tests and report. All eight files matched the saved verification manifest before this note was added. The commit directly follows SCRUM-248 snapshot `8167c2a8630dd5290ad35cd97076441058416b45`, preserving that dependency. No tests were rerun for preservation; real backend integration remains blocked as recorded below. Raw evidence stays local and ignored. No push or PR is authorized.

## Preserved base and scope

Worktree: `C:\Users\User\.codex\worktrees\scrum-249-absence-screens\Wassel`

Branch: `feat/SCRUM-249-absence-screens`, based on local SCRUM-248 snapshot `8167c2a8630dd5290ad35cd97076441058416b45`. The original SCRUM-248 branch/worktree is clean at that commit; it has not been pushed. Its ten files and existing evidence were verified before the snapshot. No SCRUM-230, SCRUM-250 or unrelated feature implementation was changed.

## Acceptance criteria implemented locally

- Choose a linked child from Parent Home, including an unassigned child; return to choose another.
- Report one day or an inclusive date range, covering morning and afternoon. Date minimum and submit validation use Asia/Beirut today; the backend remains authoritative.
- Load upcoming absences; display an explicit empty state and accessible loading/error/retry states.
- Confirm cancellation, keep or Escape to dismiss, restore keyboard focus; explain truncation of an ongoing absence without claiming past history was erased.
- Update the list only after successful API replies, without a full reload. Exact-repeat POST replies deduplicate by id. Failed creates/deletes preserve the current list and allow retry. Prevent duplicate mutation submissions and changing child during a mutation.
- Display server overlap/field errors, sign-in expiry, forbidden/not-found and network/server failures. Ignore stale child-list responses.
- Preserve Parent authorization/navigation/logout, styling tokens, shared controls and transport details. Verify at 360px.

The existing SCRUM-232 `Absence`/`AbsenceInput` types are retained and extended with authenticated GET/POST/DELETE calls. IDs are encoded and returned records validated against the selected child and date shape. Production always uses real endpoints. Sample records are limited to tests and the explicitly labelled inherited SCRUM-248 development preview; there is no absence data fallback or production fixture adapter.

## Changed files (8 relative to the preserved base)

- `frontend/src/lib/api/absences.ts` — existing contract types plus API calls/date helpers/response validation.
- `frontend/src/lib/api/absences.test.ts` — 23 API/date tests.
- `frontend/src/app/(parent)/parent/AbsencesPanel.tsx` — form, list, confirmation, request/error states.
- `frontend/src/app/(parent)/parent/AbsencesPanel.test.tsx` — 19 acceptance/edge-case tests.
- `frontend/src/app/(parent)/parent/absence-navigation.test.tsx` — child selection integration.
- `frontend/src/app/(parent)/parent/ChildTransportCard.tsx` — Manage absences action.
- `frontend/src/app/(parent)/parent/page.tsx` — selected-child panel integration.
- This report.

## Executed verification

| Check | Result |
|---|---|
| Full `npm test` | **607 passed, 7 existing skipped**, 45 test files; 43 new tests |
| `npm run lint` | **Passed**, final run has no warnings |
| `npm run build` | **Passed**, production Next.js build |
| `git diff --check` | **Passed** |
| Chromium production frontend, 360 × 800 | **Passed, UI-only HTTP fixtures**; range/create, cancellation/keep/focus/delete, list updates, child switch, no horizontal overflow or page errors |
| Real SCRUM-238/SCRUM-240 backend integration | **Blocked / not executed** |
| GitHub CI | **Not run** — branch remains local because dependencies are incomplete |

The initial focused run was 41 passed/1 failed: it exposed a focus-restoration bug after dismissing cancellation. The component was fixed and the full regression above passed; the failed log remains preserved. No product implementation was altered to satisfy a test.

Local ignored evidence under `tmp/SCRUM-249/`: `absence-tests.log` (initial failure), `regression-final.log`, `lint-final.log`, `build.log`, `mobile-check.cjs`, `mobile-check.log`, `absence-360px.png`. The browser check intercepts HTTP explicitly and is **not** authentication or absence backend E2E. The screenshot was inspected; controls and confirmation fit at 360px. Other mobile engines have not been tested.

## Dependencies and exact completion steps

SCRUM-238 and SCRUM-240 remain To Do; their parent endpoints are not available on the inspected develop base. SCRUM-248 is local and unmerged. Keep SCRUM-249 In Progress, with no partial PR.

1. Merge/verify SCRUM-240 and SCRUM-238 against the merged SCRUM-232 contract, and complete the SCRUM-248 base review/integration.
2. Reconcile this stacked local branch with the accepted Parent Home base without dropping either implementation.
3. Run real Parent login/2FA and absence GET/POST/DELETE in an isolated seeded backend: linked/unassigned/foreign children, single/range, past/inverted dates, exact-repeat 200, overlap 409, ongoing cancellation history, permissions and persistence after reload. Remove browser HTTP fixtures for this verification.
4. Repeat regression/lint/build/diff check, review the final diff, commit only related work, push, open a normal PR to develop, request independent review and verify CI. Move Jira to In Review only then. No merge without approval.
