# Wassel demo video: brief for the AI that makes it

This file is everything needed to make a demo video of Wassel without asking anyone anything. Read section 4 before writing a script: it says what the product can and cannot do today. Anything outside it must not appear on screen or in the voice-over.

Status of this brief: written 3 November 2026 from the `develop` branch. The product is still being built (Sprint 3). Re-check section 4 before the final render, because the driver and parent screens are expected to change.

## 1. The video in one paragraph

A 60 to 90 second product demo, 16:9, for a university course (CMPS 271, American University of Beirut) and for anyone who opens the GitHub page. It should make a viewer understand, without reading anything, that Wassel gives a school's transport office one reliable view of the school run: routes the system plans, drivers who are guided stop by stop, and a recorded time for every pickup and dropoff. It should feel calm, trustworthy and Lebanese. It is a demo of real software, so the screens in it must be real screens.

Also wanted: a 20 to 30 second cut for social, and a silent 10 second loop of the logo lockup.

## 2. The product

**Name.** Wassel. In Arabic, **واصل** (wāṣil, with an alif): "arriving", "connecting". The brand writes both together as "Wassel | واصل". Say it "WAH-sel".

**What it is.** A web-based school transport management platform for private schools that run their own buses.

**Vision statement (from the team's Product Vision, September 2026):**

| | |
|---|---|
| For | private schools that provide daily transport for their students |
| Who | manage routes, drivers and student assignments through phone calls, WhatsApp groups and paper lists, leaving the administration unable to answer a parent asking where their child is, and unable to see whether the service they are accountable for is running properly |
| The product | Wassel is a web-based school transport management platform |
| That | turns a service the school is blamed for but cannot see into one it can prove: every route optimized automatically, every pickup and dropoff timestamped and confirmed to parents, and the entire morning visible to the administration on a single screen |
| Unlike | transport as it runs today: a route drawn once in September, absences passed by phone, and a school office that learns about problems from parents |
| Our product | makes school transport intelligent for the first time, with routes that rebuild daily around who is actually riding, drivers guided stop by stop, arrivals parents can watch, and an operation the school can see, all on the phones drivers already carry |

**Who it serves.**

| Stakeholder | What Wassel gives them |
|---|---|
| School administration | The entire morning on a single screen, and an answer for any parent asking where their child is |
| Drivers | A route rebuilt each day, guided stop by stop, on the phone they already carry |
| Parents | A timestamped confirmation of every pickup and dropoff |

**Transport today vs. with Wassel.**

| | Today | With Wassel |
|---|---|---|
| Coordination | Phone calls, WhatsApp groups and paper lists | One web platform for routes, drivers and student assignments |
| Routes | Drawn once in September, absences passed by phone | Optimized automatically, rebuilt daily around who is riding |
| Parent visibility | The office cannot say where a child is | Every pickup and dropoff timestamped and confirmed |
| Oversight | The office learns about problems from parents | The entire morning visible on a single screen |

**The one-line promise** (current landing page headline): *Every school run, on the record.*

**Roles in the app:** head of transportation (the main user), driver, parent, admin.

## 3. Brand

### Identity

- **Logo (the mark).** A rounded amber square containing a navy front-facing school bus in front of a pale sunrise arc. The sunrise stands for the school morning. Source: `frontend/src/components/ui/BrandMark.tsx` and `frontend/src/app/icon.svg` (keep these two in sync).
- **Lockup.** Mark, then "Wassel" in bold serif white, a thin amber vertical bar, then "واصل" in bold amber Arabic. Finished artwork: `docs/assets/banner.png` (1600 x 560). Editable source: `docs/assets/banner.src.html`.
- **Tagline.** "Every school run, on the record." Sub-line: "School transport platform".
- **Website tone.** The landing page says: "Schools answer for rides they can't see." and "Wassel is being built around three commitments: routes that match the day, pickups confirmed not assumed, a record everyone can check." The tone is plain and factual, never hype.

### Colors (from `frontend/src/styles/tokens.ts`; do not invent others)

| Name | Hex | Use |
|---|---|---|
| Night | `#05060a` | Page background, deepest dark |
| Navy ink | `#061847` | The bus in the logo, text on amber |
| Brand amber | `#fbbf24` | The logo badge, the one signature accent |
| Amber text | `#fcd34d` | Small labels and highlights on dark |
| Sunrise cream | `#fef3c7` | The pale sun in the logo |
| Primary blue | `#1a56ff` | Buttons and links inside the app |
| Violet | `#6440ff` | Secondary glow, used sparingly |
| Success green | (live status dot only) | A run in progress |

The look is a dark "live fleet" interface with a soft blue and violet glow, and amber used sparingly like sunrise. A video grade that runs from deep navy night to warm amber sunrise matches the brand and the existing landing-page footage.

### Type

- **English:** Times New Roman (serif) everywhere, including the wordmark. Do not introduce a sans-serif.
- **Arabic:** a Naskh face (the banner uses Noto Naskh Arabic Bold). Arabic text must be set as real text in editing, never generated by a video model, because generated Arabic is unreliable.

### Rules for generated footage

These come from the landing-page plan and keep the video consistent with the website:

- No text, logos or readable signs inside generated footage. All words are added in editing.
- Show people from behind, in silhouette or at a distance. No identifiable faces. Children only from behind or far away.
- One plain yellow school bus throughout (a bus, not a van), unmarked body, no company branding.
- Setting: Beirut, Lebanon. Sand-colored limestone buildings, balconies, shutters, Mediterranean haze.
- Style line used for every earlier generation, append it to every prompt: `Cinematic, shallow depth of field, soft film grain, restrained color. Deep navy night shifting to warm amber sunrise. No text, no logos, no readable signs, no identifiable faces. Beirut, Lebanon: sand-colored limestone buildings, balconies, shutters, Mediterranean haze.`

## 4. What is real, what is sample, what does not exist

This is the section that protects the video from claiming something false.

### Real and live (safe to show and to describe)

- Sign-in with email and password, then a 6-digit code sent by email (two-factor on every sign-in). Account lockout after 5 wrong passwords.
- Head of transportation screens running on the real backend: Vehicles (with seat capacity), Drivers, Students (add, search, CSV import, address turned into a map pin), Parents (invite, revoke), Routes (list, create, edit, route detail with map).
- **Generate routes**: one click plans every route for the school from its active students and vehicles, using an optimizer. The head sees a proposal on a map first, with each stop's arrival time, and nothing changes until they apply it. Vehicle capacity is never exceeded.
- **Optimize** on a single route, with the same review step.
- Admin screens: school arrival and dismissal times, holiday calendar, half-days, inviting heads of transportation.
- Backend (no screen shows it yet): daily runs, start and end a run, pickup and dropoff confirmations stored with their time, absences reported by a parent, the parent's view of a child (route, driver, vehicle, expected pickup, today's run status).

### Built but running on sample data (the screen is real, the numbers are made up)

- **Head of transportation, Today screen.** Shows every run's state and progress and the absent students. Files `08-today-SAMPLE-DATA.png`.
- **Driver, Today screen** (phone layout): the day's run, stops in order, next stop highlighted, Start/End run, Picked up / Dropped off / Not present per stop, an "Open in maps" link and a "Call parent" link per stop. File `09-driver-today-phone-SAMPLE-DATA.png`.

These two screens show names and routes that differ from the demo school ("Hamra morning run", "Nadine Saab", a date of 22 October). If they appear in the video, do not let the voice-over or captions tie them to the routes shown in the Generate routes scenes. Better: re-capture them once they are connected to live data (see section 8).

### Does not exist yet (never show, never imply)

- **Any parent screen.** The parent area is an empty stub. Do not show a parent app, a parent notification, or a "your child was picked up" message on a phone. Represent the parent only with b-roll (a parent on a balcony, the bus at the curb) and no UI.
- Live bus tracking on a map, push notifications or SMS, "watch the bus arrive".
- Confirmations without an internet connection.
- Arabic or right-to-left screens. The app UI is English only. Arabic appears only in the brand lockup.
- A real, shipped customer. Wassel is a course project with one demo school.
- "Real-time", "AI-powered" or any claim about prediction. The optimizer is a route solver (Google OR-Tools). Say "optimized", not "AI".

### Safe claims

You may say: routes are optimized automatically; the head reviews a proposal on a map before anything changes; vehicle capacity is respected; arrival times are worked out backwards from the school bell; the driver is guided stop by stop on a phone; each pickup and dropoff is recorded with its time; the school can see its whole morning on one screen; absences are reported by parents. You may not say that parents are notified or can watch the bus.

## 5. Asset inventory

All screenshots are 1440 x 900 unless stated, taken from the local app with the built-in demo school, so every name is made up. They are in `docs/demo-video/screens/`.

| File | What it shows | Data | Suggested use |
|---|---|---|---|
| `00-login.png` | The sign-in page: a split screen with an AI-generated dusk photo of a Beirut street (the bus at the curb, a parent waving from a balcony) on the left, and the sign-in card with the amber "Sign in" button on the right | Real UI | Opening of the "sign in" beat. Also a good still for scene 7 |
| `01-head-overview.png` | Head of transportation home: cards for Today, Vehicles, Drivers, Students | Real | Establishing shot of the main user's workspace |
| `02-vehicles.png` | Fleet list: three buses with plates and seat capacity (14, 14, 20), Edit capacity and Deactivate | Real | "Set up the fleet" beat |
| `03-drivers.png` | Driver roster: Karim Haddad, Nadia Khoury, Rami Saade, each on a vehicle | Real | Same beat |
| `04-students.png` | Student roster with search and filters, guardian names and phone numbers, Import CSV | Real | "Add students" beat |
| `05-generate-proposal.png` | **Hero shot.** Two proposed routes on a map of Beirut, numbered stops, the school marker, a legend, then the planned stops with arrival times (07:40 to 07:58) | Real | The centerpiece. Hold on it, zoom slowly into the map |
| `06-routes.png` | Routes list after applying: two routes with vehicle, driver, seats left | Real | After "Apply all" |
| `07-route-detail.png` | One route (B 101101, Karim Haddad, 7 of 14 seats) with the Optimize button and a map of seven stops | Real | Close-up of a single route |
| `08-today-SAMPLE-DATA.png` | Today: a table of runs with states (Finished, In progress, Not started), progress bars, and a list of absent students | Sample | "Whole morning on one screen" beat; see the caveat in section 4 |
| `09-driver-today-phone-SAMPLE-DATA.png` | Driver's phone screen, 390 x 844 at 2x. **Shows an old blue-violet "W" badge instead of the bus logo**, because the driver area still has a placeholder mark | Sample | Avoid until the driver shell uses the real logo |
| `10-landing-hero.png` | The public landing page with its hero video poster and the headline "Every school run, on the record." | Real | Closing "Sign in" beat |

Other assets already in the repo:

- `docs/assets/banner.png`: the lockup on the navy-to-amber background. Use for the title card and end card.
- `frontend/public/landing/`: `hero.mp4`, `hero.webm`, `hero-poster.webp` (the yellow bus at a Beirut curb at sunrise, 10 seconds, silent), `head-of-transport.mp4` and `.webm` (6 seconds, a dark operations room before dawn), `role-driver.webp`, `role-parent.webp`, `role-head-of-transport.webp`, `closing-sunrise.webp`, `og-image.jpg`. These were generated with Seedance 2.5 and nano_banana_2 on Higgsfield, in the style above. Reuse them as b-roll so the video matches the website. The hero clip has the bus leave the frame at the end, so it does not loop cleanly; cross-fade out.
- `docs/landing-page-plan.md`: the full concept ("One School Morning", from navy night to amber sunrise, told through three people), shot list and prompts used for the site. Reuse its prompts for any new b-roll.
- Generation notes from that work: 2k still about 2 credits, 480p draft video about 3 credits per second, 1080p final about 12 credits per second. Draft at 480p first, then finalize the best draft. The balance after the landing page was 683 of 1,000 credits (may be out of date).

## 6. How to reproduce any screen

Use this to capture new or higher-quality footage, or to re-shoot a screen after a change.

**Start the app with the demo school** (from the repo root; the full steps are in the README):

```bash
cp .env.example .env && docker compose up -d
cd backend && DEMO_DATA_ENABLED=true ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
cd frontend && echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8080" > .env.local && npm install && npm run dev
```

If port 5432 or 8080 is already used by another project, use a throwaway Postgres on another port and `SERVER_PORT=8090`, and never seed demo data into a database that holds real data.

**Sign in.** Password for the demo accounts is `local-demo-password`. Accounts: `demo+head@wassel.local` (head of transportation), `demo+driver-karim@wassel.local`, `demo+driver-nadia@wassel.local`, `demo+driver-rami@wassel.local`, `demo+parent@wassel.local`, and `admin@wassel.local` with `local-admin-password`. After the password, the app asks for a 6-digit code. Locally it is not emailed: it is printed in the backend console on a line starting `Email to`.

**Get a usable route screen.** A fresh demo school has no routes. As the head, open Routes, then Generate routes, press **Generate routes**, wait for the proposal, press **Apply all**, then **Confirm apply** (there is a confirmation step). Do not leave the page before the confirmation finishes or the apply is lost. Without an OpenRouteService key the times are straight-line estimates; the screens look the same. A key (`ORS_API_KEY` in `.env`) gives real road times but the free plan allows only about 50 requests a day.

**Capture notes.**

- Viewport 1440 x 900 for desktop, `390x844` at 2x with mobile and touch emulation for the driver.
- In development mode a small "Next.js Dev Tools" badge appears bottom-left. Hide it before capturing (`nextjs-portal { display: none }`) or run a production build.
- Wait for the map tiles to load (a few seconds) before capturing a map; they come from OpenStreetMap and need internet.
- If the browser cannot reach the API port directly, serve the frontend with `NEXT_PUBLIC_API_BASE_URL=` (empty) and `BACKEND_URL=http://localhost:<api port>`. The frontend then proxies `/api/*` itself, which is how the deployed site works.

## 7. Suggested storyboard and voice-over

About 75 seconds. Every scene uses only claims from section 4. Voice-over is plain and unhurried. Captions are English, in Times New Roman. B-roll is generated or reused; screens are the real screenshots or, better, a short screen recording of the same flow.

| # | Time | Visual | On-screen text | Voice-over |
|---|---|---|---|---|
| 1 | 0:00 to 0:08 | Before-dawn b-roll: a dark room, one screen glowing blue (reuse `head-of-transport.mp4`). Fade to the lockup (`banner.png`) | Wassel · واصل | "Every school morning, someone is answerable for a bus they cannot see." |
| 2 | 0:08 to 0:16 | B-roll: hand-drawn route sheets, phone buzzing, a WhatsApp-style group of messages with no readable text. Keep it abstract | Routes drawn in September. Absences by phone. | "Routes drawn once. Absences passed by phone. Problems the school hears about from parents." |
| 3 | 0:16 to 0:24 | `01-head-overview.png`, then `02-vehicles.png` and `04-students.png` in quick succession | The head of transportation keeps the fleet, drivers and students | "Wassel starts with what the transport office already has: its buses, drivers and students." |
| 4 | 0:24 to 0:42 | **Hero.** Screen recording of Generate routes: press the button, the map fills with numbered stops, hold on `05-generate-proposal.png`, slow zoom into the arrival times | Routes planned automatically. Review on the map before anything changes. | "One click plans every route, within each bus's seats, and works backwards from the school bell. The head reviews the proposal on a map. Nothing changes until they apply it." |
| 5 | 0:42 to 0:52 | `07-route-detail.png`, then the driver phone (only if re-shot with the real logo and live data) | A route, stop by stop | "Each driver gets the day's stops in order, with the next one highlighted, on the phone they already carry." |
| 6 | 0:52 to 1:02 | `08-today-SAMPLE-DATA.png` (or a live re-shoot) with a slow push-in on the runs table | The whole morning on one screen | "Every pickup and dropoff is recorded with its time, and the school sees the whole morning in one place." |
| 7 | 1:02 to 1:10 | B-roll: the yellow bus at the curb at sunrise, a parent on a balcony far away (reuse `hero.mp4`), no UI | Every school run, on the record. | "So when a parent asks where their child is, the school has an answer." |
| 8 | 1:10 to 1:15 | End card: `banner.png`, then the repo address | Wassel · واصل · github.com/Wassel-CMPS271/Wassel | (music resolves) |

Audio: soft, warm instrumental that builds slowly through the morning; no lyrics. One calm voice, English. Add Arabic only as the printed lockup.

## 8. Before the final render, check these

1. **Driver screen on live data.** It runs on sample data and its shell still shows the old "W" badge, not the bus logo. Once it is connected (it imports sample calls in `frontend/src/app/(driver)/driver/page.tsx` and `RunAction.tsx`; `frontend/CLAUDE.md`, "API calls", describes the same switch for the Today screen) and the logo is fixed, re-shoot scene 5 and use the real pickup flow: Start run, Picked up, Dropped off.
2. **Today screen on live data.** Same one-import switch. Then the runs table will show the same routes and drivers as the Generate routes scenes, and scene 6 can be one continuous story.
3. **Parent screens.** Open pull request #119 (Parent Home) adds the first parent screen. If it merges and shows real child transport details, a short parent scene can replace the b-roll in scene 7. Not before.
4. **Landing copy.** The landing page headline was changed from "Every morning, proven." to "Every school run, on the record." Use the current one.
5. **Music, voice and tool choice.** Not decided. Decide the voice (AI narration or the team's own) and whether the video is rendered from screen recordings plus Higgsfield b-roll, as the site was.

## 9. Facts and numbers you can put on screen

- The demo school has 3 vehicles (plates B 101101, B 202202, B 303303; seats 14, 14, 20), 3 drivers (Karim Haddad, Nadia Khoury, Rami Saade) and 10 students with pins in Beirut. School arrival 08:00, dismissal 14:30. School marker near Verdun, Beirut.
- The generated proposal: 2 routes, 0 students unplaced; route B 101101 takes 7 students (7 of 14 seats), stops arrive 07:40, 07:43, 07:45, 07:48, 07:51, 07:53, 07:58; route B 303303 takes 3 students (3 of 20 seats).
- The project: 4 roles; 16 API controllers; 9 database migrations; 67 backend test classes on a real PostgreSQL in Testcontainers; 46 frontend test files; CI on every push; a security scan (OWASP ZAP) of the deployed app with no failures; deployed on Vercel and Railway.
- Team: Hashem Awad, Majd Al Halabi, Wassim Fawaz, Moustafa Hashem, Mohamad A. Al Hamwi. Group 1, CMPS 271 Software Engineering, American University of Beirut, Fall 2026.
- Hosted copy: https://wassel-sooty.vercel.app (sign-in emails a code to a real inbox, so it cannot be tried without an account).

## 10. Where things are

| What | Where |
|---|---|
| Project overview and how to run it | `README.md` |
| Operations: staging, email, deploy, smoke test, logs | `docs/operations.md` |
| Landing page concept, shot list and Higgsfield prompts | `docs/landing-page-plan.md` |
| API shapes and rules (routes, runs) | `docs/contracts/` |
| Design system: colors, type, motion, accessibility | `frontend/CLAUDE.md`, `frontend/src/styles/tokens.ts` |
| Backend rules and every module's behavior | `backend/CLAUDE.md` |
| Test plans and reports | `docs/testing/` |
| Product Vision (PDF, outside the repo) | `~/Downloads/Group1 Product Vision (1).pdf`; its text is copied into section 2 |
