# Absence test school-date CI correction

3 November 2026. Separate test-only fix on current develop 1785ad89aa9b1cbcdf22cbeb83fc76ace3c0fddd. No teammate production implementation or Jira status changed.

GitHub PR #85 run 41543276607 failed AbsenceControllerTests.cancellingAnInProgressAbsenceShortensItInsteadOfDeletingIt:421: expected 2026-11-01, actual 2026-11-02. The CI JVM was in UTC while the application correctly computes today using its injected Asia/Beirut Clock. The two dates differ between Beirut midnight and UTC midnight. The test incorrectly expected yesterday in the server's default zone.

Reproduced the same failure locally with fresh PostgreSQL/Flyway and Maven `-Duser.timezone=UTC -Dtest=AbsenceControllerTests test`: **18 tests, 17 passed, 1 failed, 0 errors/skips**. Changed all 18 LocalDate.now() reads in that class to LocalDate.now(clock), injecting the same existing school Clock used by AbsenceService. Retained every expected value and assertion, including the exact yesterday truncation and preservation of past absence days. No test is skipped or marked expected-failure; no timezone workaround is added to CI or production.

Repeated the same UTC/PostgreSQL command on another fresh database: **18 passed, 0 failures/errors/skips, BUILD SUCCESS**. The local harness uses datasource URL/driver overrides only because Docker is unavailable. Native logs/cluster data and helper scripts remain ignored in tmp/clock-fix. The helper's inherited generic completion message is not a claim that full verify was run; the Maven command and count above are the actual targeted verification. Full GitHub Maven verify must still pass before merging.

Changed files: one backend test class and this report. Request Moustafa's independent review. Merge this isolated fix before refreshing the feature branches' required CI; do not mix unrelated production changes into the routing, auth or Parent Home PRs.
