# Wassel

Wassel is a web-based school transport management platform for private schools, covering Driver, Parent, Head of Transportation, and Admin roles. The platform enables efficient coordination of student transportation with real-time tracking and communication features.

## Project Structure

- `/backend` - Java/Maven Spring Boot service
- `/frontend` - Node/Next.js web application

## Getting Started

### Prerequisites

- Java 21
- Node.js 24+ (with npm) — required by the frontend's test tooling (Vitest, jsdom)
- Docker (with Docker Compose v2)

### Run locally

1. **Configure environment.** From the repo root:

   ```bash
   cp .env.example .env
   ```

   The defaults work as-is for local development.

2. **Start PostgreSQL 16** (port `5432`, data persisted in the `wassel-pgdata` volume):

   ```bash
   docker compose up -d
   ```

   Wait until `docker compose ps` shows the container as `healthy`.

3. **Start the backend** (port `8080`) in a new terminal. Export the variables from `.env` first if you changed any defaults (the `local` profile falls back to the same defaults otherwise):

   ```bash
   cd backend
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
   ```

   On Windows use `mvnw.cmd` instead of `./mvnw`.

4. **Start the frontend** (port `3000`) in another terminal:

   ```bash
   cd frontend
   echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8080" > .env.local
   npm install
   npm run dev
   ```

5. **Open the app** at <http://localhost:3000>. The backend API is at <http://localhost:8080>.

| Service    | URL / Port              |
| ---------- | ----------------------- |
| PostgreSQL | `localhost:5432`        |
| Backend    | `http://localhost:8080` |
| Frontend   | `http://localhost:3000` |

Locally no email is sent. Login codes, invite emails and password-reset links are printed in the
backend console (look for `Email to`), so copy them from there. Staging sends real email; see
[Email on staging](#email-on-staging).

To stop the database: `docker compose down` (add `-v` to also delete its data).

## Staging Environment

Staging runs the built backend jar and built frontend server in containers — the same
artifacts a real deployment would run — instead of the dev servers used above. It's a
separate stack (own database, own containers) from local dev, used for Sprint Review
demos and pre-release verification.

1. **Configure environment.** From the repo root:

   ```bash
   cp .env.staging.example .env.staging
   ```

   Then edit `.env.staging` and set real, generated values for `DB_PASSWORD` and
   `JWT_SECRET` — don't reuse the local-dev defaults — and the mail account (see
   [Email on staging](#email-on-staging)). Compose will not start the backend without
   `MAIL_USERNAME` and `MAIL_PASSWORD`, nor without `ORS_API_KEY`, a free key from
   [openrouteservice.org](https://openrouteservice.org) that gives routes real road travel times.

2. **Build and start the full stack** (Postgres, backend, frontend):

   ```bash
   docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
   ```

   Wait until `docker compose -f docker-compose.staging.yml ps` shows `postgres` as
   `healthy`.

3. **Open the app** at <http://localhost:3000>. The backend API is at
   <http://localhost:8080>.

To stop the stack: `docker compose -f docker-compose.staging.yml down` (add `-v` to
also delete the staging database's data). Rebuild after code changes with the same
`up -d --build` command.

### Email on staging

Staging sends real email (login codes, set-password and reset links) through Gmail. Nothing is
printed in the logs.

- **Get an app password.** Use a Gmail account with 2-Step Verification turned on, then create an
  app password at <https://myaccount.google.com/apppasswords> (not the account's normal password).
  Put the address in `MAIL_USERNAME` and the password in `MAIL_PASSWORD` in `.env.staging`, as one
  run of 16 letters with no spaces. Keep values to letters and digits: a `$`, space or quote in a
  `.env.staging` value is misread. Never paste the password into chat or commit it; `.env.staging` is
  gitignored.
- **Every account you test with needs an inbox you can open,** because its login code goes there:
  the admin you seed (`ADMIN_EMAIL`), and every driver, parent and head of transportation you
  invite. Gmail ignores dots and `+tags`, so `you+driver@gmail.com` and `you+parent@gmail.com` all
  reach `you@gmail.com`.
- **If you only need codes while developing,** skip staging and run the `local` profile as above:
  no setup, and the codes are in the console.
- **A failed send** (wrong password, Gmail unreachable) answers a generic `500` and leaves nothing
  behind, so just try again. The cause is an `ERROR` line in the backend logs.
- **Limits.** Gmail allows about 500 emails a day, which is enough for this project and not for real
  users; moving to another provider only changes these settings. Each login takes a second or so
  longer than before because the email is sent during the request.

## One site for the app and its API

The sign-in cookies are `HttpOnly` and `SameSite=Strict`, so the browser only sends them when the app and
the API are on the same site. A frontend on one domain and a backend on another would silently fail to sign
anyone in. So a deployment serves one origin: the frontend proxies every `/api/*` request to the backend
(a Next.js rewrite in `frontend/next.config.ts`), and the browser never talks to the backend directly.

Settings, all on the frontend build unless noted (they are read when it is built, not when it runs):

| Setting | Value | Why |
| ------- | ----- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | empty | Switches the app to relative `/api/...` URLs. Not set means `http://localhost:8080`, which is what local development uses. |
| `BACKEND_URL` | the backend's address, for example `https://wassel-api.example.com` | Where the app forwards `/api/*`. The build fails if the line above is empty and this is not set. |
| `CORS_ALLOWED_ORIGINS` (backend) | the address people open the app at, for example `https://wassel.example.com` | The proxy passes the browser's `Origin` header on, so the backend still checks it: anything not listed gets a 403 on every POST, PUT and DELETE (sign-in included). |
| `FRONTEND_BASE_URL` (backend) | the same address | Invite and reset links point at it. |
| `JWT_COOKIE_SECURE` (backend) | `true` | The deployed site is HTTPS. |

On Vercel, set `NEXT_PUBLIC_API_BASE_URL` (empty) and `BACKEND_URL` as environment variables for the build. The staging
stack does the same through `docker-compose.staging.yml`: its default is empty with `BACKEND_URL=http://backend:8080`,
so staging behaves like a deployment. To call the backend directly instead, put its URL in
`NEXT_PUBLIC_API_BASE_URL` and rebuild the frontend.

Local development is unchanged: leave `NEXT_PUBLIC_API_BASE_URL` unset (or `http://localhost:8080`), and the backend's
default `CORS_ALLOWED_ORIGINS=http://localhost:3000` keeps working.

## Demo data

A new database only has the seeded admin. To show the app with believable data, turn the demo seeder
on: it fills the school with a head of transportation, a parent, 3 vehicles, 3 drivers (each on a
vehicle), 10 students with addresses and map pins around Beirut (two of them are the parent's
children), and school times of 08:00 arrival and 14:30 dismissal.

- **Turn it on** with `DEMO_DATA_ENABLED=true` (off by default) and start the backend. Locally:

  ```bash
  cd backend
  DEMO_DATA_ENABLED=true ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
  ```

  On staging, put `DEMO_DATA_ENABLED=true`, a `DEMO_PASSWORD` (10+ characters) and a `DEMO_EMAIL_BASE`
  in `.env.staging`, then restart the backend.
- **Safe to repeat.** Running it again adds nothing twice; anything missing is filled in, and school
  times you already set are kept.
- **Never on real data.** If the database has any account other than the demo ones and the seeded
  admin, it does nothing and logs a warning. Set `DEMO_DATA_FORCE=true` to seed anyway.
- **The accounts.** Every account signs in with the demo password: `DEMO_PASSWORD`, which is
  `local-demo-password` when you run the `local` profile. The emails are the base address with a tag
  before the `@`. With the default base `demo@wassel.local`:

  | Account | Email |
  | ------- | ----- |
  | Head of transportation | `demo+head@wassel.local` |
  | Parent (two children) | `demo+parent@wassel.local` |
  | Drivers | `demo+driver-karim@wassel.local`, `demo+driver-nadia@wassel.local`, `demo+driver-rami@wassel.local` |

  Sign-in emails a code. Locally it is printed in the backend console (look for `Email to`). On
  staging it is really emailed, so set `DEMO_EMAIL_BASE` to a mailbox you can open that supports `+tags`
  (Gmail does, for example `you@gmail.com` makes `you+head@gmail.com`), and every demo account's code
  arrives there. The admin account is the one from `ADMIN_EMAIL` as before.

## Logs

The staging stack collects every container's logs into one place (Loki), searchable in Grafana.

- **Grafana:** http://localhost:3001. Log in as `admin` with `GRAFANA_ADMIN_PASSWORD` from `.env.staging`. Open **Explore**, pick the **Loki** data source, and query.
- **Backend logs are JSON** (ECS), one object per line, with the severity in `log.level`.
- **Example queries:**
  - All backend logs: `{service="backend"}`
  - Errors only: `{service="backend"} | json | log_level="ERROR"`
  - Rejected requests: `{service="backend"} | json | log_level="WARN"`
- Logs are kept for 14 days. Config lives in `ops/` (`loki`, `promtail`, `grafana`).

Severity: **ERROR** is an unexpected failure, with a stack trace. **WARN** is a request the client got wrong (validation, conflicts, not found, forbidden), logged without a stack trace.

## Continuous Integration

`.github/workflows/ci.yml` runs on every push and on every pull request into `develop`
or `main`:

| Check            | What it runs                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| `backend-build`  | `mvn -B verify` in `/backend` (compile + tests + package)                         |
| `frontend-build` | `npm ci`, `npm run lint`, `npm test --if-present`, `npm run build` in `/frontend` |

The same checks can be run locally before pushing:

```bash
cd backend && ./mvnw verify
cd frontend && npm ci && npm run lint && npm run build
```

### Blocking merges on failure

A workflow can only report a result; blocking the merge is a repository setting. In
GitHub, go to **Settings → Branches → Add branch ruleset** (or a classic branch
protection rule) for `main` and `develop`, and enable:

- **Require a pull request before merging**
- **Require status checks to pass before merging**, adding both `backend-build` and
  `frontend-build` (they only appear in the search box after the workflow has run once)
- **Require branches to be up to date before merging** (recommended)

With that in place, a failing or still-running check disables the merge button.
