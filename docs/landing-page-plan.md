# Wassel Landing Page Plan (SCRUM-183)

Status: plan only. Nothing has been generated on Higgsfield, committed, or changed in code.
Owner: Majd Al Halabi (frontend). Branch: `feat/SCRUM-183-landing-page`.

SCRUM-183 has no acceptance criteria, so the scope below is the agreed scope.

## 1. Decisions

| # | Decision |
|---|----------|
| 1 | Login moves from `/` to `/login`. The landing page lives at `/` under a `(public)` route group. |
| 2 | Sections: hero, today vs. Wassel comparison, three value pillars, role strip, closing sign-in CTA. |
| 3 | No demo CTA. Every CTA is "Sign in" and links to `/login`. |
| 4 | Fix app metadata (real title and description) in `src/app/layout.tsx`. |
| 5 | Login page behavior is otherwise unchanged. Only its route moves. |
| 6 | The middleware matcher is not fixed here. It is listed under follow-ups. |

## 2. Concept: "One School Morning"

One Beirut school morning, told through three people and moving from navy night to amber sunrise. The page scrolls through the same morning the product manages.

| Beat | Time | Person | What we see | Palette |
|------|------|--------|-------------|---------|
| 1 | Before dawn | Head of transport | A dark ops room with one screen glowing. Routes are already rebuilt for who is riding today. | Navy night (`#0b0d14` to `#05060a`) with primary-blue glow (`#1a56ff`) |
| 2 | First light | Driver | The driver's view from the cab of a yellow school bus, rolling toward a stone-built Beirut street. Balconies, shutters, the first amber on the facades. | Navy fading to violet (`#6440ff`) haze, first amber |
| 3 | Sunrise | Parent | **The hero.** A yellow school bus stands at a residential curb with its door open. Children in uniform board, seen from behind. A parent waves from a balcony. The doors close and the bus pulls away: the pickup is confirmed. | Amber (`#fcd34d`, `#fbbf24`) light on the buildings, sky still navy at the top |

The hero is beat 3, the payoff of the morning, because it is the clearest picture of the value (a pickup the parent can see and trust). The role clips are the earlier beats, so the same yellow school bus, the same kind of limestone street and the same navy-to-amber grade run through every asset.

**Core value in one line:** a service the school is blamed for but cannot see becomes one it can prove.

**Rules that keep it on-system**
- The page is dark. Amber appears only as the sunrise: eyebrows, one hover color, and the final light in the hero. It is never a large fill, body text or status color.
- Colors come only from `src/styles/tokens.ts`. The video is graded in the generation prompt. Any CSS overlay uses `darkTheme` and `colors` values only.
- Typography is Times New Roman only. No text, logos or UI are baked into the footage, because generated text is unreliable and would break the font rule.
- People are shown from behind, in silhouette or at a distance. Children appear only from behind or far away, with no recognizable faces. No real school, bus company or brand is shown, and the bus body is plain with no text or logos.
- Vehicle: one yellow school bus throughout (not a van).
- Copy stays at the vision level. Many features are not built yet, so nothing claims a capability by name.

## 3. Sections and copy

All copy is draft and vision-level. Eyebrows use the standard style: `text-xs font-medium uppercase tracking-wider` in `colors.accent[300]`.

### 3.1 Hero
- Eyebrow: `School transport, made visible`
- H1: **Every morning, proven.**
- Sub: Wassel gives schools, drivers and parents one shared view of the school run, so a ride the school is blamed for becomes one it can prove.
- Primary CTA: **Sign in** (links to `/login`, `Button` variant primary)
- Background: hero video (shot H1) with the hero poster as the static fallback and the reduced-motion state.
- Overlay: a vertical gradient built from `darkTheme.background.top` and `base` so text meets 4.5:1 contrast over any frame.

### 3.2 Today vs. Wassel
- Eyebrow: `The difference`
- H2: **From guesswork to a record.**
- Two cards (`Card`, `radius.lg`), side by side on desktop and stacked on mobile.

| Today | With Wassel |
|-------|-------------|
| Routes are drawn by hand and go stale. | Routes are optimized automatically and rebuilt daily around who is riding. |
| Parents call to ask where the bus is. | Every pickup and dropoff is timestamped and confirmed. |
| The school hears about problems after the fact. | The entire morning is visible on a single screen. |
| When something goes wrong, it is one person's word against another's. | There is a record everyone can see. |

### 3.3 Three value pillars
- Eyebrow: `What Wassel does`
- H2: **One morning, three kinds of confidence.**

| Pillar | Title | Line |
|--------|-------|------|
| Routes | Routes that keep up | Optimized automatically and rebuilt every day around who is riding. |
| Parents | Confirmed, not assumed | Every pickup and dropoff is timestamped and confirmed. |
| School | The whole morning at a glance | The entire morning is visible on a single screen. |

Icons come from `components/ui/icons.tsx` (`VehicleIcon`, `StudentIcon`, `ClockIcon`), `aria-hidden`.

### 3.4 Role strip
- Eyebrow: `Built for everyone on the run`
- H2: **One platform. Four seats.**
- Four compact cards. Each pairs a role with its poster still and one line.

| Role | Line |
|------|------|
| Parent | Know your child is picked up and dropped off, with the time to prove it. |
| Driver | A clear route for today, rebuilt around the students actually riding. |
| Head of Transportation | The whole morning, vehicles, drivers and students, on one screen. |
| Admin | Keep the school's accounts and access in order. |

Cards are not links. Role areas are behind sign-in, and not-yet-built destinations follow the repo rule: non-interactive text with `aria-disabled` and a "Soon" pill, never a dead link.

### 3.5 Closing CTA
- H2: **Start tomorrow's morning on Wassel.**
- Sub: Sign in to see your school's mornings.
- CTA: **Sign in** (links to `/login`)
- Background: sunrise poster (shot P4) under the same overlay.

## 4. Higgsfield shot list

### 4.1 Budget and cost caveat

- Account: Plus plan, 1,000 credits, one private workspace. No unlimited-generation allowance is available right now.
- **The model catalog (`models_explore`) returns no credit prices.** Every cost below is an estimate built from assumed per-unit rates:
  - Seedance 2.5, 480p draft, silent: about 3 credits/second.
  - Seedance 2.5, 720p, silent: about 7 credits/second.
  - Seedance 2.5, 1080p, silent: about 12 credits/second.
  - Stills at 2k: about 4 credits each (1k about 2).
- **Before generating anything, get a real quote** (a job quote or the `balance` tool for the first shot). If real rates are more than about 1.5 times these, cut scope using section 4.5 rather than spending the reserve.
- Planned total is **about 510 credits, under the 600 cap**. At least 490 credits stay in reserve.

**Actuals (final).** Real quotes replaced the assumptions above. Total spent **317 credits**, balance **683 of 1,000**, against the 600 cap.

| Item | Credits |
|---|---|
| Hero poster v1 (superseded) | 2 |
| Hero draft v1, 10s 480p (superseded) | 30 |
| Hero poster v2 (approved) | 2 |
| Hero draft v2, 10s 480p (bus reversed, rejected) | 30 |
| Hero draft v3, 10s 480p (approved) | 30 |
| Hero final, 10s 1080p | 120 |
| V2 head of transport draft, 6s 480p | 18 |
| V2 head of transport final, 6s 1080p | 72 |
| Driver and parent stills, 1k, no reference (superseded) | 3 |
| Five 2k stills with hero reference (driver, parent, head of transport, closing sunrise, OG source) | 10 |
| **Total** | **317** |

Real rates: 2k still 2 credits (1k 1.5); 480p draft 3 credits/s; 1080p final 12 credits/s (6s = 72, 10s = 120).

**Decisions made during generation:**
- V3 (driver) and V4 (parent) video clips were skipped by the user. Those two roles use stills instead. V2 shipped as a clip.
- The hero video was regenerated once because the bus reversed. The approved v3 prompt forces a front-first drive toward the camera, with negative prompts. The bus exits the frame at the end, so the clip does not loop cleanly on its own. The page needs a cross-fade from the last frames to the poster (see section 6).
- All 2k stills use `hero-poster-v2.png` as `image_references` so the street, bus and light match.
- Role stills are 16:9 (2752x1536) instead of the 4:3 in the table, per the user. P4 stays 21:9 (3168x1344).
- v1 files and the rejected v2 hero draft are kept as backups.

**Final file list** in `frontend/public/landing/originals/` (gitignored):

| File | Role | Size | Resolution |
|---|---|---|---|
| `hero-poster-v2.png` | Hero poster (P0a), approved | 6.84 MB | 2752x1536 |
| `hero-final-1080p.mp4` | Hero video (H1), 10s, silent | 8.70 MB | 1920x1080 |
| `v2-head-of-transport-final-1080p.mp4` | Head of transport clip (V2), 6s, silent | 7.32 MB | 1920x1080 |
| `still-head-of-transport.png` | P1 | 5.75 MB | 2752x1536 |
| `still-driver.png` | P2 | 5.28 MB | 2752x1536 |
| `still-parent.png` | P3 | 5.45 MB | 2752x1536 |
| `still-closing-sunrise.png` | P4 | 5.39 MB | 3168x1344 |
| `og-image-source.png` | P5 source, crop to 1200x630 in code | 5.41 MB | 2752x1536 |
| `hero-poster.png`, `hero-draft-480p.mp4` | v1 backups | 6.49 / 3.62 MB | 2752x1536 / 480p |
| `hero-draft-v2-480p.mp4` | Rejected reversed-bus draft | 4.08 MB | 480p |
| `hero-draft-v3-480p.mp4` | Approved hero draft | 2.44 MB | 480p |
| `v2-head-of-transport-draft-480p.mp4` | V2 draft | 2.61 MB | 480p |
| `still-driver-1k-v1.png`, `still-parent-1k-v1.png` | Superseded 1k stills | 1.39 / 1.62 MB | 1376x768 |

Job IDs: hero poster v2 `8946bc48-7bf4-4b9e-9cd6-b875aa2e2712`, hero final `7184ffbc-6113-4b94-a99a-53e05141df7d`, V2 final `8f1e9ab6-b9bf-49ca-b204-f47bb6edbca7`.

### 4.2 Technique (applies to every video)

- **Model:** `seedance_2_5`, silent (`generate_audio: false`), because the page plays muted.
- **Draft first:** generate at 480p with `draft: true`, review, then finalize the best draft with `draft_job_id`. Drafts can be finalized within 7 days. Never regenerate from scratch to go up in resolution.
- **Start frame from a still:** make the poster first (cheap), then use it as `start_image` in `omni_reference` mode. The video then opens on the exact poster, so there is no visual jump on load.
- **Stills model:** `nano_banana_2` at 2k, 16:9, with up to two attempts per still.
- **Shared style line**, appended to every prompt so the set matches: `Cinematic, shallow depth of field, soft film grain, restrained color. Deep navy night shifting to warm amber sunrise. No text, no logos, no readable signs, no identifiable faces. Beirut, Lebanon: sand-colored limestone buildings, balconies, shutters, Mediterranean haze.`

### 4.3 Prioritized shots

Priority order matters if we have to stop early. P0 is the hero and must ship. P1 makes the role strip move. P2 are stills only.

| ID | Priority | Asset | Model, spec | Attempts | Est. credits |
|----|----------|-------|-------------|----------|--------------|
| P0a | P0 | Hero poster (still), v2 "golden-hour pickup" | `nano_banana_2`, 2k, 16:9 | 2 | 4 |
| H1 | P0 | **Hero video**, 10s loop: doors close, bus pulls away | `seedance_2_5`, 16:9, 480p draft then **1080p** final, silent | 3 drafts + 1 final | 90 + 120 = 210 |
| V2 | P1 | Head of transport clip, 6s | `seedance_2_5`, 16:9, 480p draft then 720p, silent | 1 draft + 1 final | 18 + 42 = 60 |
| V3 | P1 | Driver clip, 6s | same as V2 | 1 + 1 | 60 |
| V4 | P1 | Parent clip, 6s | same as V2 | 1 + 1 | 60 |
| P1 | P2 | Head of transport poster | `nano_banana_2`, 2k, 4:3 | 2 | 8 |
| P2 | P2 | Driver poster | `nano_banana_2`, 2k, 4:3 | 2 | 8 |
| P3 | P2 | Parent poster | `nano_banana_2`, 2k, 4:3 | 2 | 8 |
| P4 | P2 | Closing sunrise poster | `nano_banana_2`, 2k, 21:9 | 2 | 8 |
| P5 | P2 | Open Graph image 1200x630 | `nano_banana_2`, 2k, 16:9, crop in code | 2 | 8 |
|  |  | **Subtotal** |  | | **438** |
|  |  | Contingency (about 15% on video retries) |  | | 72 |
|  |  | **Planned total** |  | | **about 510** |

### 4.4 Prompts

Each prompt ends with the shared style line from 4.2.

**P0a, Hero poster (still).**
Used for the approved v2 poster. Early Beirut morning at golden-hour sunrise, wide shot of a quiet residential street with limestone apartment buildings, balconies and shutters. A yellow school bus is stopped at the curb with its door open, plain unmarked body, no text, no logos, no readable signs. A few schoolchildren in dark uniforms with backpacks wait and board, seen only from behind or at a distance, no recognizable faces. A parent stands on a balcony above, waving, seen from a distance. Warm amber sunlight rakes across the facades while the sky at the top of the frame is still deep navy. The upper-left third is calm, dark navy sky and shadowed wall, left clear for a headline.

**H1, Hero video (10s, seamless loop).**
Start from the hero poster. The last child steps aboard and the bus door closes. After a beat the bus slowly pulls away from the curb and drives down the street, away from the camera, as the amber light on the facades warms and widens. The parent on the balcony keeps waving, then lowers a hand. Soft camera drift only, no cuts, no fast motion. The final frame returns close to the first frame (the street with the light slightly warmer and a bus-shaped gap at the curb, then easing back to the opening light) so the loop is not jarring. Keep the upper-left third dark and low-detail. No text, no logos, no identifiable faces.

**V2, Head of transport (6s).**
Dark operations room before dawn, seen from behind a seated figure in silhouette. A single wide monitor glows primary blue and shows an abstract map of lines and soft dots, with no readable text. A cup of tea steams. Slow dolly forward. Faint amber light starts to creep in through a window on the right.

**V3, Driver (6s).**
Interior of a yellow school bus at first light, seen over the driver's shoulder. Hands on the big steering wheel, a residential Beirut street ahead with limestone buildings and first amber light on the facades, sky still navy above. Gentle forward motion, subtle handheld feel. No face visible.

**V4, Parent (6s).**
The same street as the hero, a moment before the bus arrives. A parent on a balcony in warm side light, seen from behind or at a distance, a coffee cup in hand, glancing down the street. Below, the yellow school bus rolls into view and slows to the curb. Amber light on the facades, navy sky above. Slow, calm, no cuts. This is the lead-in to the hero pickup.

**P1, Head of transport poster.** Close, shadowed view of a glowing blue screen in a dark room, silhouette of a person from behind, abstract map lines, a thin amber edge of dawn at a window.

**P2, Driver poster.** Over-the-shoulder view from a yellow school bus cab at first light, hands on the wheel, a limestone Beirut street ahead, amber on the facades, navy sky above.

**P3, Parent poster.** Parent at a distance on a balcony at sunrise, warm amber side light, a yellow school bus waiting at the curb below, shutters and laundry lines, calm morning. Same street as the hero, from a different angle.

**P4, Closing sunrise poster.** Ultra-wide Beirut skyline at sunrise from a rooftop, limestone buildings, sea haze, sun just above the horizon. The top two thirds are dark navy fading to amber, with a clear dark area in the center for the CTA.

**P5, Open Graph image.** Simplified version of the hero poster with the yellow bus and the amber-lit facades centered, large dark margins left and right so a 1200x630 crop works. No text baked in. The title is added by the page metadata, not the image.

### 4.5 If real prices come in higher

Cut in this order, stopping as soon as the plan fits under 600:
1. Drop P5 and reuse the hero poster for Open Graph.
2. Drop V2 to V4 and use the three role posters as still images in the role strip.
3. Cut the hero from 10s to 8s, or finalize at 720p instead of 1080p.
4. Drop attempts on P1 to P4 to one each.

The hero video (P0a and H1) is never cut.

## 5. Asset delivery and performance

- Export H1 as MP4 (H.264) and WebM (VP9). Target under about 2.5 MB each for the hero and under about 1 MB for each secondary clip.
- Hero video markup: `muted`, `playsInline`, `loop`, `preload="metadata"`, `poster` set to P0a, `aria-hidden="true"` (decorative).
- Respect reduced motion: if `prefers-reduced-motion` is on, do not play the video and show the poster only. Use `useReducedMotion()` to decide.
- Role-strip clips play on hover or focus, and only when in view. They are never autoplay on mobile.
- Store assets under `frontend/public/landing/` with descriptive names (`hero.mp4`, `hero.webm`, `hero-poster.jpg`, and so on).
- Hero poster is the LCP element. Serve it through `next/image` with `priority`.
- Verify contrast of headline and sub over the poster and over the last frame of the video, at 4.5:1 for body and 3:1 for large text.

## 6. Implementation notes (for the next step)

1. Create `src/app/(public)/layout.tsx`. It applies `darkPageBackground` once and wraps content in `<MotionConfig reducedMotion="user">`. Pages inside must not set their own background.
2. Create `src/app/(public)/page.tsx` as the landing page at `/`. One `<main>`. A labelled `<nav>` if a header is added. Native `<a>` and `<button>`, visible `focus-visible` outlines.
3. Move the current login page from `src/app/page.tsx` to `src/app/(public)/login/page.tsx`. `LoginForm` is unchanged. Delete the old `src/app/page.tsx`.
4. Update `src/app/layout.tsx` metadata. Title and description should be Wassel's, for example "Wassel - School transport, made visible" and a one-line description. Add Open Graph title, description and image.
5. Build with `Button`, `Card` and the icons already in `components/ui`. Any new value (for example a hero overlay) gets added to `tokens.ts` as a documented token first, with no ad hoc colors, fonts or shadows.
6. Use inline styles with token values for color, spacing and radius. Tailwind is for layout only. For hover states, use the CSS-variable pattern from the head-of-transport layout.
7. Motion: 0.2 to 0.35s, easeOut, about 80ms stagger, and nothing continuous without a `useReducedMotion()` check.
8. Check at 375px, 768px and desktop, and run `npm run lint` and a production build before handing over.

## 7. Follow-ups (not part of SCRUM-183)

1. **Middleware matcher is likely broken.** `src/middleware.ts` uses `"/((?!_next/static|_next/image|favicon.ico|.*\..*).*)"`. In a plain string `\.` collapses to `.`, so the file-extension exclusion matches almost any path, and the middleware probably runs only on `/`. Role-area protection may not be enforced. Not fixed here, as instructed.
2. **Middleware redirect from `/` will now skip the landing page for signed-in users.** After the move, a user with a `role` cookie opening `/` goes straight to their role home. That is probably right, but confirm it is the intended behavior.
3. **Should a signed-in user opening `/login` be redirected to their role home?** Currently undecided. Not in scope, and login behavior is staying unchanged.
4. **Fonts and metadata leftovers in `src/app/layout.tsx`.** The Geist and Geist Mono font variables conflict with the Times-New-Roman-only rule, and the metadata still says "Create Next App". Metadata is fixed in this work. Removing the Geist fonts is a separate cleanup.
5. **Login submit is a `console.log`.** It stays a placeholder until SCRUM-173 and SCRUM-176 connect real auth.
6. **Copy review.** The vision-level copy should be checked with the team before launch, especially claims like "timestamped and confirmed", which depend on features still in the backlog.
7. **Real credit prices.** Record the actual quoted prices after the first generation and update section 4.
