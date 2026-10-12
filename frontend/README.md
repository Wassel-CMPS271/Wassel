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

The session cookies are `HttpOnly` and `SameSite=Strict`, so the frontend and the API must be served from the same site (`localhost` on different ports counts as one).

Only the admin is seeded. To try the other roles, invite them: the admin invites a head of transport (`POST /api/admin/head-of-transport`), who invites parents and drivers. Each invite email contains a `/set-password?token=...` link, printed in the backend console.
