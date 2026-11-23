# PR #169 independent-test wording conflict — original expectations preserved

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
