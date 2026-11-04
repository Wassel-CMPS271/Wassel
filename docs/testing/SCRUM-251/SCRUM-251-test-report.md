# SCRUM-251 optional Parent run status

Prepared at the user's explicit request on 3 November 2026. Optional; pending team Sprint 3 pull-in approval. Jira remains To Do and sprint scope is unchanged.

Stacked on PR #119 / feat/SCRUM-248-parent-home. Uses actual SCRUM-237 todayRun direction/state/stopsLeft from authenticated GET /api/parent/children. No invented fields or sample fallback. No-run adds no UI, zero means next, null never invents a count. Manual refresh preserves transport with a stale message on outage; 401/403 removes private cards.

Executed: full frontend 648 passed, 6 existing skips; 25 focused state/boundary/refresh tests passed again on final corrected source. Production build passed. Real PostgreSQL/Flyway browser passed: actual password/2FA; unassigned no-run; morning not started/on the way; confirmation-driven counts 2 -> 1 -> 0 -> null; afternoon selection, finished state; reload; ownership/role isolation; revoked refresh 401 and restored retry; 360px without overflow or browser errors. No intercepted production responses. Logs/screenshots remain ignored under tmp/stacked-verification.

Independent review/testing remains required, with Majd/SCRUM-246 if pulled into Sprint 3. Do not merge until team pull-in approval and base/review requirements are satisfied.
