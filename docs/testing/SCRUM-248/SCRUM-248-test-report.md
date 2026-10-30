# SCRUM-248 — Parent Home implementation and verification

Date: 2026-10-30 (Asia/Beirut). Author: Wassim Fawaz.

## Status

**UI and contract-based tests implemented; real-backend acceptance blocked by SCRUM-240.** Jira SCRUM-248 is In Progress. No SCRUM-248 commit, push or PR has been created. Nothing was merged. SCRUM-250, its 65 tests, SCRUM-230 and all other ticket worktrees were left untouched.

Worktree: `C:\Users\User\.codex\worktrees\scrum-248-parent-home\Wassel`.
Branch: `feat/SCRUM-248-parent-home`.
Base/HEAD: latest fetched origin/develop, `8f052a72d5a829ca5260dcf5e6dfbf4c9a9f3b82`.

The root CLAUDE.md, frontend/CLAUDE.md, current Parent layout, RoleGuard, UserBlock, shared request() client, merged runs contract and parent-children.json were inspected. Previously supplied AGENTS.md instructions were revoked by the user. No source from another ticket was changed.

## Acceptance criteria and behavior

| Requirement | Implementation / verification |
|---|---|
| All linked children and their names | Child[] is fetched through the authenticated parent endpoint; one labeled card per child; list order retained |
| Route, driver name and phone, vehicle plate | All fields displayed from that child's response; shared LicensePlate, Card, icons and Wassel tokens |
| Expected pickup time | Exact HH:mm shown without device-timezone conversion; explicitly described as planned morning school time, not live ETA |
| Nullable pickup time | Clear unavailable-time message; route, driver, vehicle and calling remain available |
| Call driver | Native tel link; display formatting retained while spaces/parentheses/hyphens are removed from its destination; >=44px tap height; missing/unusable phones never produce a call link |
| No route | Child name plus explicit no-route message; no stale transport or call data |
| No children | Explicit no-children-linked state with a useful school-contact explanation |
| Loading/error | Accessible loading status; generic retryable network/server/contract errors; distinct expired-session sign-in link and forbidden message; Retry preserves keyboard focus |
| Mobile 360px | Real production Chromium: no horizontal overflow for standard or long unbroken names, routes, driver names and plates; call targets 44px tall and in viewport |
| Navigation, authorization, logout | Existing Parent layout and auth components unchanged; real RoleGuard/request()/UserBlock exercised with mocked HTTP, including all other roles, 401, outage and logout |
| Real endpoint at completion, preview removed | Client is ready and is the default path, but **actual backend verification is blocked**; temporary development adapter must be removed after SCRUM-240 verification |

No absences UI, run-state fields, stops-left calculation or unrelated navigation changes were added. Those belong to SCRUM-249/251 or other work.

## Files changed

| File | Purpose |
|---|---|
| frontend/src/app/(parent)/parent/page.tsx | Parent Home, load/error/empty states, development label and retry focus |
| frontend/src/app/(parent)/parent/ChildTransportCard.tsx | Accessible child transport details, nullable pickup, safe native call link |
| frontend/src/lib/api/myChildren.ts | Existing contract types plus real GET /api/parent/children through request(); response-shape validation |
| frontend/src/lib/api/parentChildrenSource.ts | Default real client plus explicit development-only preview selection |
| frontend/src/lib/api/myChildren.development.ts | Temporary, guarded adapter using a fresh copy of canonical SCRUM-232 sample JSON |
| frontend/src/app/(parent)/parent/page.test.tsx | 21 component/HTTP-boundary tests |
| frontend/src/app/(parent)/parent/authorization.test.tsx | 7 actual-layout/RoleGuard/account/logout integration tests with mocked HTTP |
| frontend/src/lib/api/myChildren.test.ts | 19 client/contract/error tests |
| frontend/src/lib/api/parentChildrenSource.test.ts | 6 environment-guard, isolation and no-fallback tests |
| docs/testing/SCRUM-248/SCRUM-248-test-report.md | This report and backend handoff |

No dependencies, lockfile, shared styles/components, Parent layout, backend files, contract samples or CI configuration were modified.

## Fixture isolation and production behavior

By default the screen calls the real authenticated endpoint. No parent ID, school ID or child selector is supplied by the browser: the backend must derive ownership from its session. Malformed response data becomes a load error rather than a misleading empty family or partial transport card. Future additional response fields remain compatible.

For local development only, explicitly opt in before starting the dev server:

```powershell
$env:NEXT_PUBLIC_PARENT_HOME_PREVIEW = 'true'
npm run dev
```

This requires NODE_ENV=development as well as the flag. It never replaces a failed HTTP call. The development view is visibly labeled **Development preview — sample children, not live school records**. Existing Parent authentication/RoleGuard remains required; the adapter does not bypass login or logout. Each load gets a fresh sample copy.

Production was deliberately built with NEXT_PUBLIC_PARENT_HOME_PREVIEW=true. Unit tests and actual production-browser checks confirmed the flag cannot activate samples outside development. The Parent route's production JS bundles contain no canonical sample child names/IDs. Both an empty real-shaped HTTP response and HTTP 404 retained honest empty/error states without sample fallback.

## Verification results

| Check | Result |
|---|---|
| Final targeted suites | **57 passed, 0 failed**: 53 new tests plus 4 unchanged existing Parent layout tests |
| Full frontend regression | **564 passed, 7 existing skipped, 0 failed**, 571 tests across 42 passing files |
| ESLint, including final changes | Passed |
| Production npm run build, preview flag deliberately true | Passed; /parent production route generated |
| git diff --check and new-file whitespace | Passed |
| Actual Chromium 360px and 1280px | Passed: linked/unassigned/null-time cards, native call href/size, long text, empty/error no-fallback and retry focus; no rendering errors |
| Standalone tsc --noEmit | **Fails at existing SCRUM-229 routing.independent.test.tsx:105, TS2322**; no SCRUM-248 file reported; baseline check excluding the four new test files records the same existing diagnostic |
| Real SCRUM-240 backend / backend ownership enforcement | **Not verified: implementation unavailable** |
| New GitHub Actions run | Not created: no partial PR or push while backend acceptance is blocked |

Tests use real components, RoleGuard, UserBlock, response parsing and request() with mocked fetch at the HTTP boundary. The browser checks explicitly intercept authentication and children API responses with contract fixtures; they are frontend verification, **not proof of real backend integration or real login**. No failing test was skipped or weakened. The seven regression skips already exist upstream.

Evidence is preserved in ignored `tmp/SCRUM-248/`: targeted/regression JSON and logs, lint/build/typecheck logs, browser metrics/script, `parent-home-360.png` and `parent-home-long-360.png`. Browser tooling is installed only in this worktree's ignored temporary directory, not a feature dependency or another ticket's worktree. The owned production check server was stopped after verification.

## SCRUM-240 blocker and precise next actions

[SCRUM-240](https://majdhalabi.atlassian.net/browse/SCRUM-240) was To Do at initial and final checks; no corresponding GitHub PR or remote branch was found. Latest develop has contract types but no parent children controller/service. Therefore the final SCRUM-248 criterion cannot be claimed complete, and Jira remains In Progress.

After SCRUM-240 becomes available:

1. Bring the completed backend implementation into an updated develop base without including other ticket work.
2. Verify real Parent login/session and GET /api/parent/children, including two linked children, unassigned child, null pickup, empty family and actual driver phone/plate/timing data. Verify another parent's data and non-PARENT roles are not exposed. Mocked frontend checks are not a substitute.
3. Delete myChildren.development.ts, the preview selector/import/banner/config path, and obsolete preview-only tests. Keep getMyChildren as the real client; update the page to use it directly.
4. Rerun component/client/auth tests, full frontend regression, lint/build/diff checks and real mobile/browser verification. The existing routing-test TypeScript issue must be addressed separately by its owner; it was not modified here.
5. Only once complete: review the SCRUM-248 diff, commit related files, push feat/SCRUM-248-parent-home, open a regular PR to develop, request Majd's independent review (SCRUM-246), verify its CI, and move SCRUM-248 to In Review. No merge without required approvals.
