# SCRUM-249 — Parent absences

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
