# Release: Sprint 2 + Sprint 3 (`develop` → `main`)

`main` last moved at the Sprint 1 release (PR #39, 2026-10-12). Sprint 2 was never released on its own, so this release brings `main` up to `develop` at `983603e` and covers both sprints.

- **Sprint 2** (about 2026-10-10 to 2026-10-20): the first working draft of the whole app, deployed. Real-API screens, hosting, and the route planning feature.
- **Sprint 3** (2026-10-20 to 2026-11-03): daily runs. Drivers run their routes, parents report absences and follow the bus, the head of transportation watches the day, and the security and test tooling grows.

The stories below are split by their Jira sprint label. This document describes what is **merged** on `develop`. Where Jira status and the merged code disagree, the code wins and the difference is noted at the end.

Size of the release: 354 commits, 414 files, about +56,000 / −1,100 lines, 9 database migrations (V1 to V9).

---

## Sprint 2

### 1. Screens connected to the real API
The Sprint 1 screens used sample data. Each now talks to the backend, so what a user adds is saved.

| Story | What changed | PR |
|---|---|---|
| SCRUM-191 | Vehicles screen uses the real API | #38 |
| SCRUM-192 | Drivers screen uses the real API; invited drivers get their email | #35 |
| SCRUM-193 | Students screen: add, edit and find real students | #36 |
| SCRUM-194 | School times page saves arrival and dismissal times | #49 (branch `SCRUM-178`) |
| SCRUM-195 | School calendar saves holidays and half-days | #50 (branch `SCRUM-179`) |
| SCRUM-214 | An admin can delete a holiday added by mistake | #62 |
| SCRUM-227 | Student address field when adding or editing, with validation and a "missing pin" indicator | #37, #42 |
| SCRUM-213 | The API accepts a student's address when the student is created | #64 |
| SCRUM-190, 231 | Head of transportation invites a parent by email and picks a student's parent on the edit form | #70 |

### 2. Deploy and infrastructure
| Story | What changed | PR |
|---|---|---|
| SCRUM-196 | Frontend deployed to Vercel on every merge (documented) | #75 |
| SCRUM-197 | Backend and PostgreSQL hosted on Railway; sign-in email can go through Brevo (`MAIL_PROVIDER=brevo`) | #74, #82 |
| SCRUM-198 | App and API served from one origin, so the secure sign-in cookie works when deployed (the app proxies `/api/*` to `BACKEND_URL`) | #59 |
| SCRUM-199 | Flyway migrations with a baseline schema; Hibernate `ddl-auto` is now `validate` | #51 |
| SCRUM-200 | Opt-in seeded demo school (`DEMO_DATA_ENABLED`) with vehicles, drivers and students | #57 |
| SCRUM-225 (the PR is titled SCRUM-148) | Vitest + Testing Library frontend test runner in CI | #41 |

### 3. Route planning (backend)
| Story | What changed | PR |
|---|---|---|
| SCRUM-201 | Routing contract (`docs/contracts/routing.md`), optimizer and travel-time interfaces, sample data | #40 |
| SCRUM-208 | Route API: create, list, edit, delete, with a vehicle and driver per route | #48 |
| SCRUM-209 | Add and remove students on a route, with a seat check so a vehicle is never overfull | #54 |
| SCRUM-210 | Set and reorder a route's stops by hand | #55 |
| SCRUM-211 | A student's address is turned into a map pin through Nominatim | #58 |
| SCRUM-202 | OR-Tools single-route solver behind `RouteOptimizer`, plus the shared arrival-time rule | #47 |
| SCRUM-203 | Propose, apply and discard an optimized stop order (route versions) | #66 |
| SCRUM-204 | Road travel times from OpenRouteService, cached, with a straight-line fallback | #67 |
| SCRUM-212 | Estimated arrival time at each stop | #60 |
| SCRUM-206 | Fleet planner splits all of a school's students across its vehicles | #73 |
| SCRUM-207 | Generate, review and apply all of a school's routes at once (`/routes/generation`, fleet proposals) | #78 |

### 4. Route planning (screens)
| Story | What changed | PR |
|---|---|---|
| SCRUM-218 | Routes screen to list, create and edit routes | #46 |
| SCRUM-219 | Assign students to a route by click or drag, with a live seats counter and warning | #53 |
| SCRUM-220 | Route map with numbered stops and the drawn path | #63 (stacked on #61, reached `develop` through it) |
| SCRUM-222 | Place or correct a student's pickup pin on the map | #52 |
| SCRUM-221 | Preview a proposed stop order with arrival times, then apply or discard | #68 |
| SCRUM-224 | "Generate all routes" screen | #80 |
| (chore) | Route screens switched to the real API | #61 |

### 5. Independent tests
The author writes their own tests; a second person writes a challenging set and reviews.

| Story | Covers | PR |
|---|---|---|
| SCRUM-205 | Routes, stops, arrival times: 22 contract tests, plus four bugs found by trying to break the code (a student re-add, a rename after deactivation, a PostgreSQL race that answered 500 instead of 409, a malformed id that answered 500). Three fixed in #72; the malformed-id one was fixed in #71 | #72, #71 |
| SCRUM-215 | OpenRouteService client | #69 |
| SCRUM-216 | Generate-all routes | #79 |
| SCRUM-226 | Address geocoding | #65 |
| SCRUM-228 | Optimizer and optimize endpoints, including "capacity is never exceeded" | #43, #81 |
| SCRUM-223 | Connected vehicle, driver, student and admin screens | #76 |
| SCRUM-229 | Route screens, map and pin placement | #83 |
| SCRUM-230 | End-to-end Playwright test: create a route, assign students, optimize, view on the map (merged during Sprint 3) | #85 |
| SCRUM-217 | Smoke test of the deployed app, signing in as each role (merged during Sprint 3) | #112 |

### 6. Merged in the same window, not labelled `sprint-2` in Jira
- SCRUM-185: branded parent sidebar and navigation tests (#44)
- SCRUM-26: forgot-password flow (#45)
- SCRUM-66: filter the students screen by route (#77)
- Fix: students list failed on PostgreSQL when no search text was given (#56)

---

## Sprint 3

### 1. Daily runs (driver side)
The contract came first (SCRUM-232, `docs/contracts/runs.md`), then the chain 233 → 234 → 235.

| Story | What changed | PR |
|---|---|---|
| SCRUM-232 | Contract for runs, confirmations, absences and the parent view | #84, fixed in #115 |
| SCRUM-233 | Today's morning and afternoon runs are created from the driver's route (Beirut time, created on the first request of the day) | #90 |
| SCRUM-234 | A driver starts and ends a run; a started run locks its route's driver and vehicle until it ends | #94 (stacked on #90) |
| SCRUM-235 | The driver marks each student picked up, dropped off or not present (`run_confirmations`) | #101 (stacked on #94) |
| SCRUM-239 | Absent students are marked on the driver's run (#98); the head of transportation's list of who is absent on a date comes from the absences module (#97) | #98 (stacked on #90), #97 |

The runs chain (#90, #94, #98, #101, #104) was built as stacked PRs and reached `develop` together through the merge of #104.

### 2. Absences and parents
| Story | What changed | PR |
|---|---|---|
| SCRUM-238 | A parent reports a child absent for a day or a range, and cancels it | #97 |
| SCRUM-240 | A parent sees their children, route, driver and expected pickup time | #100 |
| SCRUM-237 | A parent sees whether the run has started and how many stops are left before their child | #104 (stacked on #101) |
| SCRUM-248 | Parent Home screen with real child transport details | #119 |
| SCRUM-251 | Parent Home shows run status and remaining stops. This was an optional pull-in: Jira still says To Do and #123 said it needed team approval, but the code is in `develop`, stacked into #119 | #119, #123 |

### 3. Screens for drivers and the head of transportation
| Story | What changed | PR |
|---|---|---|
| SCRUM-243 | Driver Today screen: today's run, stops in order, students per stop, next stop highlighted | #89 |
| SCRUM-244 | Driver can start a run, confirm each student and end it, from a phone | #93 |
| SCRUM-245 | Open a stop in the maps app; call a student's parent | #103 |
| SCRUM-255 | Head of transportation Today screen: every run's status and who is absent | #96 |

### 4. Accounts and access
| Story | What changed | PR |
|---|---|---|
| SCRUM-97 | Admin invites a head of transportation by email | #87 |
| SCRUM-98 | Revoke and restore a user's access | #95 |
| SCRUM-171 | Account locks after repeated wrong passwords (`LOCKOUT_MAX_FAILURES`, default 5; `LOCKOUT_DURATION`, default 15m) | #111 |
| SCRUM-177 | Real sign-in and 2FA end-to-end tests for all four roles | #122 |

### 5. Rules and bugs fixed
| Story | What changed | PR |
|---|---|---|
| SCRUM-241 | The API refuses to lower a vehicle's seats below the students already on its route | #107 |
| SCRUM-259 | A seat change racing an added student can no longer overfill a route | #110 |
| SCRUM-258 | Two simultaneous absence reports for one child no longer answer HTTP 500 | #109 |
| SCRUM-260 | The head of transportation's runs now count real absences (was always 0) | #118 |

### 6. Security and CI
| Story | What changed | PR |
|---|---|---|
| SCRUM-252 | Backend tests run on PostgreSQL (Testcontainers) with the real migrations | #86 |
| SCRUM-254 | Automated test of every endpoint against every role | #88 |
| SCRUM-253 | Dependency scanning on pull requests, current findings fixed, weekly Dependabot (`.github/dependabot.yml`) | #92 |
| SCRUM-151 | Code coverage reports for backend and frontend in CI | #91 |
| SCRUM-257 | ZAP scan of the deployed app, security headers, POST sign-in forms | #105 |

### 7. Independent tests
| Story | Covers | PR |
|---|---|---|
| SCRUM-236 | Absences, the parent API, the capacity rule, account lockout. The tests found the bugs fixed in SCRUM-258 and SCRUM-259; #117 fixes a time-zone flaw in one absence test | #108, #117 |
| SCRUM-242 | Daily runs, start/end, confirmations, the parent's run status | #114, #121 |
| SCRUM-247 | Head of transportation Today screen | #113 |
| SCRUM-256 | Invite-head-of-transportation screen | #99 |
| (fix) | Flaky frontend tests (timeouts, drag-handle description) | #106 |
| (docs) | Stale CSV import note in `backend/CLAUDE.md` | #116 |

---

## What deploying this needs

### Database
Nine Flyway migrations, applied in order on first start. None exist on `main` today.

| Migration | Sprint | Adds |
|---|---|---|
| V1 | 2 | Baseline schema |
| V2 | 2 | Students: route assignment |
| V3 | 2 | Students: manual pin |
| V4 | 2 | Route proposals and versions |
| V5 | 2 | Fleet proposals |
| V6 | 3 | Absences |
| V7 | 3 | Runs |
| V8 | 3 | Run confirmations |
| V9 | 3 | Sign-in lockout columns on users |

### Environment variables new since Sprint 1
| Variable | Needed? | Notes |
|---|---|---|
| `SCHOOL_LATITUDE`, `SCHOOL_LONGITUDE` | **Required** | The backend refuses to start without them (every route ends at the school) |
| `ORS_API_KEY` | Required for compose/staging | Without it route times are straight-line estimates; staging compose refuses to start without it |
| `MAIL_PROVIDER` (`smtp` or `brevo`), `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Optional | Only when sending through Brevo |
| `NOMINATIM_BASE_URL`, `NOMINATIM_COUNTRY_CODES`, `NOMINATIM_TIMEOUT`, `NOMINATIM_USER_AGENT` | Optional | Defaults are set (Lebanon only) |
| `LOCKOUT_MAX_FAILURES`, `LOCKOUT_DURATION` | Optional | Defaults 5 and 15m |
| `DEMO_DATA_ENABLED`, `DEMO_DATA_FORCE`, `DEMO_PASSWORD`, `DEMO_EMAIL_BASE` | Optional | Demo school seeding; off by default |
| `BACKEND_URL` (frontend) | Deploy | Where the app proxies `/api/*`; `NEXT_PUBLIC_API_BASE_URL` is now empty by default |

### Hosted backend (Railway)
Railway currently builds from `develop` (README, "Hosted backend (Railway)"), so the hosted database already has migrations V1 to V9 applied. After this merge, switch the service's "Branch connected to production" to `main`. Since `main` will equal `develop`, the schema and the code match and nothing needs resetting. `SCHOOL_LATITUDE`, `SCHOOL_LONGITUDE` and `ORS_API_KEY` should already be set there; check the Variables tab.

### New API areas
- `/api/head-of-transport/routes` and `/routes/generation` (route CRUD, stops, optimize, generate all)
- `/api/head-of-transport/runs` and `/api/head-of-transport/absences`
- `/api/driver/runs`
- `/api/parent/children` and `/api/parent/children/{studentId}/absences`

### CI
`ci.yml` goes from two jobs to four: `backend-build` and `frontend-build` (now with coverage reports, `npm audit` and backend tests on PostgreSQL), plus new `auth-e2e` and `routing-e2e` Playwright jobs. `main` requires `backend-build` and `frontend-build`. The ZAP scan (SCRUM-257) is run by hand, not in CI.

---

## Not in this release
- SCRUM-246 (independent tests for the parent screens), SCRUM-249 (parent absence screen), SCRUM-250 (independent tests for the driver screens): not merged.
- SCRUM-59 (import students from a file, stretch): not started.
- The README rewrite and demo-video brief (branch `docs/readme-and-video-brief`): deliberately left for a later PR.

## Jira status differs from the code
SCRUM-236, 243, 244, 245, 247 and 248 show "In Review" in Jira, and SCRUM-251 shows "To Do", but all of them are merged here.
