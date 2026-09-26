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
