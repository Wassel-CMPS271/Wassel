# Wassel frontend

Next.js 15 (App Router), React 19, Tailwind v4. The design system and the conventions for API calls and route protection are in [CLAUDE.md](./CLAUDE.md). The root [README](../README.md) covers running the whole stack, including staging.

## Scripts

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
```

CI runs `lint` and `build`. There is no test runner yet.

## Running against the real backend

1. Start PostgreSQL and the backend with the `local` profile, as in the root README.
2. `npm run dev`. The API base URL is `NEXT_PUBLIC_API_BASE_URL` and defaults to `http://localhost:8080`, so a `.env.local` is only needed to point somewhere else. It is baked in at build time.
3. Sign in at <http://localhost:3000/login> with the seeded admin (`ADMIN_EMAIL` and `ADMIN_PASSWORD`, defaults in `.env.example`). Signing in has two steps: the password, then a 6-digit code. Locally the code is not emailed. It is printed in the backend console, in the line starting `Email to`, which is also where invite and password-reset links appear.

The session cookies are `HttpOnly` and `SameSite=Strict`, so the frontend and the API must be served from the same site (`localhost` on different ports counts as one). A deployment gets there by proxying: build with `NEXT_PUBLIC_API_BASE_URL` empty and `BACKEND_URL` set to the backend's address, and the app forwards `/api/*` to it, so the browser only talks to one origin. See the root README, "One site for the app and its API".

Only the admin is seeded. To try the other roles, invite them: the admin invites a head of transport (`POST /api/admin/head-of-transport`), who invites parents and drivers. Each invite email contains a `/set-password?token=...` link, printed in the backend console.
# Authentication browser tests — SCRUM-177

From `frontend`, install with `npm ci` and `npm run test:e2e:install` (Linux CI adds `-- --with-deps`). Java 21, Maven, Node 24 and an **empty disposable loopback PostgreSQL database named `wassel_e2e`** are required. Set `E2E_DB_URL=jdbc:postgresql://127.0.0.1:5432/wassel_e2e`, `E2E_DB_USERNAME`, `E2E_DB_PASSWORD` and, if needed, `E2E_MAVEN_CMD=mvn` and `JAVA_HOME`. Never point this at application data. The launcher refuses non-loopback/differently named databases and existing user accounts.

Run the whole stack with **`npm run test:e2e`**. It compiles the backend test launcher, runs Flyway and production Admin/Demo seeders, builds/starts the production frontend, executes Chromium tests and stops its own processes. Four real roles authenticate with password and actual emailed 2FA codes read from the isolated local LoggingMailer. No mocked API responses, fixed codes or forged session tokens are used. The backend enum is `HEAD_OF_TRANSPORT` (the Head of Transportation role).

Windows alternative when Docker is unavailable: set `E2E_POSTGRES_BIN` to a trusted PostgreSQL `bin` directory containing `initdb.exe` and `postgres.exe`, instead of `E2E_DB_URL`. A fresh cluster/database is created under ignored `e2e-artifacts` on port 55439 (override with validated `E2E_POSTGRES_PORT`). Frontend/backend ports are 4180/18177; occupied ports fail rather than reuse other work. Keep generated evidence local: mail logs, database files and browser traces may contain disposable credentials. Each normal run rebuilds; `E2E_REUSE_BUILD=1` is only for an unchanged source/build configuration.

`auth.e2e.ts` covers four role homes, pending-cookie/session boundaries, logout, incorrect password/code with recovery, Parent/Admin authorization and the production five-failure account lockout. `auth-revocation.e2e.ts` now executes both real SCRUM-98 revoke/restore scenarios in every normal and CI run: revoked login and rejection of an already authenticated session. `npm run test:e2e -- --revocation` selects those two tests alone for diagnosis; the normal command must pass all ten cases without skips. No SQL enabled toggles or test-only revocation endpoint is used.

The `auth-e2e` GitHub job provisions PostgreSQL 16 and executes the core test without ignored failures. CI has not run until this work is pushed; do not claim it passed based on the workflow file. SCRUM-230 PR #85 is unmerged: this branch reuses/adapts its runner/config only, without copying routing implementation or changing its worktree. Reconcile shared runner/package/CI changes when both branches merge.
