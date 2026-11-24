# PR #169 acceptance wording — preserved originals and branch-owned corrections

## 24 November 2026 — authorized corrections in PR #150's own copies

The current request explicitly authorizes corrected copies owned by this branch. Earlier decisions and 76/80 results below are retained as history. Neither PR #169 nor its branch is modified. Production still says exactly **1 unread update**; no production file is changed.

### Root cause and scope

The CI workflow fetched immutable snapshot `da61dfb6a7951221ceb38092a5c117eaa9216d6e`. Five literal matchers required the incorrect plural for count one; a sixth required a numeric count followed by the plural. Together they stopped four cases before their functional assertions could complete: foreign-entry 404/no fake receipt, mid-session 401 privacy, read/refetch/reload persistence, and recovery after HTTP 500.

On 24 November the revised runner reproduced **76 passed / 4 failed / 0 skipped**, exit 1, before applying corrections. This confirms the runner still propagates genuine test failures.

GitHub inspection also found that the independent owner has already corrected those six incidental matchers on PR #169 at `88f8db8c30c263424cc52a08c9ec1a0596f66e81`, accepting singular or plural. This branch uses strict singular matches instead: all six positions require exactly **1 unread update**, consistent with the existing dedicated singular-wording test. The HTTP-500 recovery fixture contains exactly one unread entry, so its former any-count matcher becomes more specific.

| Branch-owned file | Original line | Original expectation | Corrected expectation |
| --- | --- | --- | --- |
| authorization.acceptance.test.tsx | 71 | `1 unread updates` | `1 unread update` |
| authorization.acceptance.test.tsx | 84 | `1 unread updates` | `1 unread update` |
| authorization.acceptance.test.tsx | 100 | `1 unread updates` | `1 unread update` |
| inbox.acceptance.test.tsx | 72 | `1 unread updates` | `1 unread update` |
| inbox.acceptance.test.tsx | 83 | `1 unread updates` | `1 unread update` |
| inbox.acceptance.test.tsx | 157 | `/^\d+ unread updates$/` | `1 unread update` |

### Provenance and preservation

All copies originate from the immutable snapshot above. Distinct filenames avoid overwriting the original local overlays or colliding with future canonical files from PR #169:

| Original relative to frontend/src | Branch-owned relative to frontend/src |
| --- | --- |
| app/(parent)/parent/tracking.independent.test.tsx | app/(parent)/parent/tracking.acceptance.test.tsx |
| app/(parent)/parent/authorization.independent.test.tsx | app/(parent)/parent/authorization.acceptance.test.tsx |
| app/(parent)/parent/inbox.independent.test.tsx | app/(parent)/parent/inbox.acceptance.test.tsx |
| app/(parent)/parent/preferences.independent.test.tsx | app/(parent)/parent/preferences.acceptance.test.tsx |
| test-support/parentAcceptance.ts | test-support/parentAcceptance.owned.ts |

A byte-level source audit verifies that the only differences are the six matchers listed above and the mechanical helper-module rename in test imports, including the tracking MapView mock's dynamic import. The copied helper is byte-identical to its original. All test bodies, fixtures, 245 explicit expect calls, awaited queries, API request checks, authorization/privacy checks, receipt/refetch assertions, reload behavior and retry assertions remain. Tracking and preferences have no assertion edits. No case is removed, skipped, made optional or marked expected-failure. Inherited comments about previously suspected product bugs are original historical annotations; current outcomes are recorded below and in the test report.

The five original untracked overlays in the existing SCRUM-280 worktree remain byte-identical and are not staged. Validation runs in a clean continuation worktree from PR #150's current head `917be71c4671c4a7b9ceae57a4378932e51ea96d`, with all tracked frontend tests plus the 80 owned cases. This matches a clean CI checkout without mixing the preserved untracked raw overlays into the corrected suite.

### CI behavior

The existing `parent-independent-acceptance` job now runs checked-in copies through `frontend/e2e/review-parent-acceptance.mjs`. It no longer fetches or writes the contradictory snapshot at runtime. Missing suite files fail immediately; Vitest's nonzero exit remains a job failure. The full frontend regression step still runs with `if: !cancelled()`, even if focused acceptance fails. Triggers, job identity, timeout, normal test execution and failure propagation remain enabled. No runtime rewriting, production text substitution, relaxed matcher or continue-on-error is used.

Executed validation results are recorded in the newest section of SCRUM-280-test-report.md. Historical results and restrictions below describe previous requests, not the currently authorized owned copies.

---


No independent test has been changed. Raw test snapshot: `da61dfb6a7951221ceb38092a5c117eaa9216d6e`.

After the nine reported product failures were fixed, the unchanged suite reported **76 passed / 4 failed**. Tracking is **43/43**, preferences **13/13**. The four remaining failures are caused by expectations for the old plural at count one; the same suite separately requires singular wording and rejects that plural.

## Six proposed edits, requiring explicit approval

| File and line in the original snapshot | Current expectation | Proposed expectation |
|---|---|---|
| authorization.independent.test.tsx:71 | `1 unread updates` | `1 unread update` |
| authorization.independent.test.tsx:84 | `1 unread updates` | `1 unread update` |
| authorization.independent.test.tsx:100 | `1 unread updates` | `1 unread update` |
| inbox.independent.test.tsx:72 | `1 unread updates` | `1 unread update` |
| inbox.independent.test.tsx:83 | `1 unread updates` | `1 unread update` |
| inbox.independent.test.tsx:157 | any numeric count followed by plural `unread updates` | exact `1 unread update`, matching the single unread fixture |

All six edits would be confined to a documented local/CI validation copy. The original source and the teammate branch would remain unchanged. No test case, receipt/count assertion, ownership or access check, retry check, or persistence assertion would be removed or made optional. No hidden plural text would be added to production to satisfy contradictory checks.

The four affected cases check marking read and persistence, foreign/unknown-entry 404, expired-session privacy, and recovery after HTTP 500. Their other functional assertions must remain intact.

## Current restriction

Automatic approval review rejected applying the corrections because the user instructed that failing tests must not be weakened or altered. This document is a reviewable proposal only; no correction is applied without explicit approval. Raw 76/80 evidence remains in ignored `tmp/SCRUM-280-20261117/acceptance-after-review.log`.

## User decision

The user explicitly chose: **Preserve all original expectations and report 76/80**. No wording correction is authorized or applied. All 80 independent cases remain byte-for-byte identical to the snapshot. The four contradictory wording failures remain normal failures.

## Verification after PR #149 merged — 17 November 2026

PR #149 is merged in develop dec60bcb3f3de01a4e27c548f3e2f80bef3ca808. #150 merged that accepted base normally without conflicts. PR #169 still points to da61dfb6a7951221ceb38092a5c117eaa9216d6e; all four original test files and their shared harness remain byte-identical to it. The current independent run is **76 passed / 4 failed**. Correct singular production wording remains unchanged.

Added four separate owned full-page integration regressions in ParentInbox.recovery.integration.test.tsx, using real RoleGuard and request() with test-only HTTP fixtures. All **4/4 passed**: failed mark-read 404 retains unread state without fake receipt/private detail; mid-session 401 clears Inbox/preferences and offers Sign in; two-to-one count and sibling read state persist through a complete page remount; list-500 recovery yields one unread update without a stale alert. These supplement the original tests; they do not replace, normalize, skip or reclassify any #169 case. The original strict CI job remains failing.

**Remaining action:** #169's owner must align the six text matchers above with its own singular-wording criterion while retaining all receipt, authorization, ownership, count-refetch, reload and retry assertions. This branch does not edit that PR or introduce plural text into the UI. #149 and the real backend integrations are no longer dependencies blocking #150; acceptance remains blocked by these contradictory expectations.
