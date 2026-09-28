# Wassel

Wassel is a web-based school transport management platform for private schools, covering Driver, Parent, Head of Transportation, and Admin roles. The platform enables efficient coordination of student transportation with real-time tracking and communication features.

## Project Structure

- `/backend` - Java/Maven Spring Boot service
- `/frontend` - Node/Next.js web application

## Getting Started

### Prerequisites

- Java 21
- Node.js 20+ (with npm)
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
   `JWT_SECRET` — don't reuse the local-dev defaults.

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
