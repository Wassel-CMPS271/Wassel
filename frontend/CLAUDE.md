# Wassel frontend — design system

Every page and component in this app follows the system below. **Don't introduce new colors, font stacks, shadows, or one-off styles ad hoc.** If something you need is missing, add it as a token in `src/styles/tokens.ts` (with a comment saying what it's for) and use the token.

Stack: Next.js 15 App Router, React 19, Tailwind v4 (CSS-first config in `src/app/globals.css`, no `tailwind.config`), framer-motion.

## Source of truth

- `src/styles/tokens.ts` holds all design values as plain TS constants: `colors`, `spacing`, `radius`, `typography`, `darkTheme`, `darkPageBackground`.
- Components apply tokens via inline `style` (e.g. `style={{ color: darkTheme.text.primary, padding: spacing.md }}`). Use Tailwind classes for layout only (flex, grid, responsive breakpoints, `text-sm`-style sizing).
- Don't build Tailwind class names from token values at runtime (`` `bg-[${color}]` ``). Tailwind can't see them at build time and the styles silently disappear. For hover/focus states that need token colors, set CSS variables inline and reference them from static classes. See `navLinkVars` in `src/app/(head-of-transport)/head-of-transport/layout.tsx`:
  `style={{ "--nav-bg-hover": darkTheme.interactive.hoverBg }}` + `className="hover:bg-[var(--nav-bg-hover)]"`.
  This is needed because inline `color`/`background` always beat `:hover` rules.
- `globals.css` mirrors a few values (`--background`, `--foreground`). Keep them in sync with `darkTheme`.

## Dark theme is the default identity

The app is dark everywhere, whatever the OS light/dark preference. The look is a "live fleet-tracking" dashboard: near-black backdrop, soft blue/violet glow, elevated surfaces.

- **Page background**: apply `darkPageBackground` once, in the role's `layout.tsx`. Individual pages must not set their own page background. That's what keeps the product feeling like one continuous surface.
- **Shared components** (`src/components/ui/`: `Button`, `Input`, `Card`) default to `theme="dark"`. Pass `theme="light"` only when a surface is deliberately light (an explicit opt-in, e.g. a printable view). Don't mix light cards into a dark page.
- New role areas (`driver`, `parent`, `admin`) should get a `layout.tsx` modeled on the head-of-transport one: sidebar, brand header, nav with icons, user block. The brand header is `<BrandMark size={sizing.brandSidebar} />` next to the "Wassel" text; don't redraw the logo. The layout wraps itself in `RoleGuard` and renders `<UserBlock />` for the user block (see Route protection below). `parent/layout.tsx` is only that guard, the background and the user block until the area gets its screens.

## Color palette (`tokens.ts`)

| Token | Use for |
|---|---|
| `darkTheme.background.*` | Page gradient stops and glow tints. Consumed via `darkPageBackground`. |
| `darkTheme.surface.card` + `cardBorder` + `cardShadow` | Elevated surfaces: cards, list rows. |
| `darkTheme.surface.input` + `inputBorder` | Form field fills/borders (recessed, one step lighter than cards). |
| `darkTheme.surface.sidebar` | Translucent nav rail (with `backdropFilter: blur(12px)`). |
| `darkTheme.text.primary` | Headings, primary content, input values. |
| `darkTheme.text.secondary` | Body copy, labels, supporting values. |
| `darkTheme.text.muted` | Placeholders, helper text, disabled/"coming soon" items. Never for essential content. |
| `colors.primary.*` (blue) | Primary buttons inside the app, links at rest (`primary[300]` on dark), focus rings (`primary[400]`/`[500]`). |
| `colors.secondary.*` (violet) | Secondary buttons, gradient partner to primary (background glow). |
| `colors.accent.*` (amber), `darkTheme.interactive.*` | **Signature accent, used sparingly**: current nav item (`accent[300]` text, `accent[400]` icon/indicator, `interactive.activeBg`), hover states (`interactive.hoverBg`), small eyebrow labels, the brand mark badge (`brand.*`), and the public "Sign in" CTA (`cta.*`). Never for large fills, body text, or status. |
| `cta.*` | The public call to action (`CtaLink` / `CtaButton` in `components/ui/Button.tsx`): small solid `accent[400]` fill, `primary[900]` navy label (10.2:1), `accent[300]` hover with a soft amber glow, sliding arrow. One style everywhere it appears: `CtaLink` for links, `CtaButton` for the submit on the auth pages. In-app forms keep the blue primary `Button`. |
| `brand.*` | `BrandMark` (`components/ui/BrandMark.tsx`): amber badge, navy bus, pale sunrise arc. `src/app/icon.svg` repeats it with literal values; keep both in sync. |
| `colors.success.*` / `darkTheme.status.*` | Live/active status only (the pulsing green dot). |
| `colors.error.*` | Errors and destructive actions. Destructive buttons use `error[600]` (white text passes AA there; `error[500]` doesn't). Error text on dark uses `error[500]`. |
| `colors.warning.*` | Warnings. |
| `colors.neutral.*` | Light-theme opt-in surfaces and text. Rarely needed on dark. |

## Typography

- **Times New Roman** (`"Times New Roman", Times, serif`) globally via `body` in `globals.css`; mirrored as `typography.fontFamily.serif`. Don't add other font families.
- Scale is `typography.fontSize` (xs 12 → 4xl 36, each with a paired line-height). Via Tailwind: `text-xs`…`text-3xl`.
  - Page title: `text-2xl`/`text-3xl` · section heading: `text-lg` · body: `text-sm`/`text-base` · meta/pills/eyebrows: `text-xs`.
- Weights (`typography.fontWeight`):
  - `regular` 400: body copy.
  - `medium` 500: labels, nav items, buttons, pills.
  - `semibold` 600: page and section headings.
  - `bold` 700: the brand wordmark and license-plate numbers only.
- Eyebrow labels (small context above a heading): `text-xs font-medium uppercase tracking-wider` in `colors.accent[300]`.

## Auth pages

`/login`, `/reset-password`, `/set-password` and `/verify-2fa` live in the `(public)` route group (its layout supplies the page background and `MotionConfig`) and share one frame:

- `AuthShell` (`components/auth/`) is the page: lg and up, a split screen with the hero photo, a navy scrim (`auth.panelScrim`) and a headline on the left (`auth.panelColumns`), the form column on the right. Below lg the photo is a fixed, dimmed backdrop (`auth.backdropScrim`). It also renders the "Back to home" link. Pass a short `headline`; the subline is fixed.
- `AuthCard` is the frosted card (`auth.cardSurface` + `auth.cardBlur`): brand lockup, `h1`, description, then the form. Spread `authFieldProps` on every field (44px height and the two-tone focus ring, since the card can sit over the photo). Submit with `CtaButton className="w-full"`.
- Password fields use `PasswordInput` (`components/ui/`), which adds the show/hide toggle (fixed name "Show password", state in `aria-pressed`). It's built on `Input`'s `endAdornment` slot.
- Messages: a field's own error goes through `Input`'s `error` prop. A message about the whole form (the backend refused, or "try again") is a `<p role="alert" className="text-sm">` in `colors.error[500]` above the submit button. A notice that isn't an error ("Your sign-in has expired", "Your password is set") is a `role="status"` paragraph in `darkTheme.text.secondary`. `/login` takes its notice from `?expired=1` or `?passwordSet=1`, read in the server page and passed to `LoginForm`, because `useSearchParams` in the form would need a Suspense boundary to build.
- The code step (`/verify-2fa`) locks "Send a new code" for 60 seconds from page load and after each resend, because the server allows one new code a minute per account.
- New auth screens reuse these; don't give them their own background or card.

## API calls

- Every call to the backend goes through `request()` in `src/lib/api/client.ts`. Don't call `fetch` directly. It sends the session cookies (`credentials: "include"`), prefixes `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8080`; an empty value counts as unset; it is baked in at build time, so staging passes it as a Docker build arg), and sends `Content-Type` only when there is a body, because the backend's CORS allows only that header.
- One module per backend area in `src/lib/api/`; `auth.ts` is the model. Every module calls the real backend; there are no mocks or sample clients. The one exception: while a Sprint 3 endpoint (`docs/contracts/runs.md`) is not merged, its screen may use a temporary sample client built from `docs/contracts/samples/`, and the PR that wires the real call deletes it. The Today screen (SCRUM-255) is the one using it now: it imports `getRunsDay`/`getAbsentStudents` from `lib/api/runsSample.ts` (the contract's sample JSON, copied to `lib/api/__fixtures__/runs/`), while the real calls already exist in `runs.ts`; going live means changing that one import and deleting `runsSample.ts` and the fixtures. The two workarounds are in `routes.ts`, and both get every route (one request per route): `listUnassignedStudents()`, because the backend has no endpoint for students on no route, and `getRouteAssignments()`, which says which route each student is on so the students screen can filter by route in memory, because the students list's `route` filter still reads the old text column.
- A failed call throws `ApiValidationError` (a 400 or 409 with an `errors` map: show each message next to its field) or `ApiError` (any other non-2xx: `status` says what to do, `message` is the backend's `detail`, and `studentIds` is the optimize 409's list of students without a pin). A network failure rejects as it is. Forms say "Something went wrong. Please try again." for anything they don't handle by status.
- The auth cookies are `HttpOnly` and `SameSite=Strict`. The frontend never reads them, and it must be served from the same site as the API: locally that is `localhost` on two ports, and in a deployment it is the `/api/*` proxy above. The proxy forwards the browser's `Origin` header, so the backend's `CORS_ALLOWED_ORIGINS` must still list the public address of the app, or every POST, PUT and DELETE is refused with a 403.

## Map

- Every map is `MapView` (`components/map/MapView.tsx`): Leaflet with OpenStreetMap tiles (the attribution is required by the tile policy; keep it). Import `MapView`, never `LeafletMap.tsx`: Leaflet needs `window`, so `MapView` loads it client-only with `next/dynamic` and shows a skeleton of the same height meanwhile.
- Props: `label` names the map region. `markers` are numbered stops (`number`, an accessible `label` like "Stop 1: Hadi Rizk", an optional `popup`). `school` gets its own marker. `path` is the ordered line, e.g. `[...route.stops, route.school]`. Stops and points with `null` coordinates are skipped, so `Stop` and `RouteSchool` from `lib/api/routes.ts` fit as they are. With nothing to show it renders an empty state (`emptyMessage`).
- Several routes on one map: pass `routes` (each `{ id, label, color, markers, path }`, color from `mapTheme.routeColors`). Each route gets its own colored markers and line, and a legend naming every route sits beside the map (under it on a phone). The palette has 10 colors and repeats after that, so a route's name must also be in its markers' `label` and `popup`. Without `routes` the map's markup is unchanged.
- The map fits itself to all points unless you pass `center` (and `zoom`). It refits when the points change, never when the pin moves.
- Pin mode: pass `onPinChange` with a controlled `pin` (echo the new value back). The pin is placed by clicking the map or the "Place pin at map centre" button, moved by dragging or by the arrow keys while it has focus, and its coordinates are read out in an `aria-live` line under the map.
- Colors and sizes come from `mapTheme` in `tokens.ts`; popup and focus colors reach Leaflet's own elements through CSS variables and the `.wassel-map` rules in `globals.css`. Markers are `divIcon`s built from tokens and integers only, never from caller strings. Scroll-wheel zoom is off so the page still scrolls, and zoom/fade animations follow reduced motion.

## Tests

- Vitest + Testing Library. Config is `vitest.config.mts` (an `.mts` file so it can use ESM
  without `"type": "module"` in `package.json`, which would also affect Next's own config).
- A test file sits next to what it tests: `src/lib/api/client.test.ts` is the model, and the
  one to copy for a `request()`-based module. Mock `fetch` with `vi.stubGlobal` rather than
  hitting a real backend.
- `npm test` runs once and exits non-zero on a failure (CI's `frontend-build` job runs this
  and fails the build). `npm run test:watch` re-runs on save during development.
- `npm run test:coverage` is the same run plus a v8 coverage report (a text summary and an HTML report in
  `frontend/coverage/`, git-ignored). CI's `frontend-build` job runs it instead of `npm test` and uploads the
  folder as the `frontend-coverage` artifact. It is a report only: there are no thresholds, so a low number
  never fails the build.
- `vitest.setup.ts` loads the jest-dom matchers (`toBeInTheDocument`, etc.) for every test.

## Revoking access

- `RevokeAccessControl` (`components/ui/`) is the Revoke / Restore access button for a person (SCRUM-98): one button, then an inline question with Confirm and Cancel (Escape cancels, focus goes to Confirm and back to the button). Both directions ask first. The caller's `onRevoke`/`onRestore` must report their own failures (a toast or an alert), because the control goes back to the button whatever happened.
- The drivers roster and the parents list use it. A revoked driver arrives from the API as `status: "deactivated"` and is shown as "Revoked"; a parent as `status: "revoked"`. Update the row from the response instead of reloading the list.

## Route protection

- There is no middleware. The session token carries no role (the backend reloads the role from the database on every request, so a role change applies at once), so only `GET /api/auth/me` can say who is signed in.
- Every role layout wraps itself in `RoleGuard role="..."` (`components/auth/RoleGuard.tsx`). It renders nothing until `/me` answers. A 401 goes to `/login`, a user with another role goes to their own area (`ROLE_HOME` in `lib/api/auth.ts`), and any other failure shows an alert and never redirects to login, so an API outage doesn't sign anyone out. `useCurrentUser()` gives the user to anything inside it.
- `UserBlock` is the shared user block: the email, the role and Sign out.
- This only decides which shell to show. The backend checks the session and the role on every endpoint, so never ship data in a role page's bundle that another role shouldn't see.
- Why in the browser and not in a middleware or server layout: a server call would need a second, runtime API URL inside the staging container, and would break if the frontend and API ever got different hostnames, because the cookie is host-only.

## Surfaces

- Cards: `Card` (dark) = `surface.card` fill, 1px `surface.cardBorder`, `surface.cardShadow`, `radius.lg`, `spacing.lg` padding.
- Inactive or unavailable items recede: translucent fill (`rgba(255,255,255,0.03)`) or dashed border, no shadow, muted text. Don't use `opacity` on text to fade it, because that breaks contrast.
- Radii: `radius.md` for buttons/inputs/list rows, `radius.lg` for cards, `radius.full` for pills, dots, and avatars.
- Spacing: only `spacing.*` values (4/8/16/24/32/48…). No arbitrary pixel gaps.

## Motion (framer-motion)

- **Subtle and purposeful.** Motion marks state changes (item added, vehicle deactivated, active nav item moving) and entrances (list/card fade-slide, staggered ~80ms). Durations are about 0.2–0.35s, `easeOut`. No bounces or flashy effects.
- **Always respect reduced motion.** Every role layout wraps content in `<MotionConfig reducedMotion="user">`, which drops transform animations. Anything looping or continuous (like the live-status pulse) must also check `useReducedMotion()` and fall back to a static style.
- **Decorative animated elements get `aria-hidden="true"`.** The meaning always lives in real text next to them (e.g. the pulsing dot is hidden, and the "Active"/"Inactive" label is what gets announced).

## Accessibility (never skip)

- **Contrast**: WCAG AA minimum, 4.5:1 for body text and 3:1 for large text and UI boundaries like focus rings. Check every new text/background pairing, including placeholders and text inside buttons. The ratios for the `darkTheme.text.*` tokens are documented in `tokens.ts`. Re-verify if you change a value.
- **Labels**: every input has a visible `<label>` linked by `htmlFor`/`id` (the `Input` component does this). Errors are linked with `aria-describedby` and announced via `role="alert"`.
- **Keyboard**: use native `<button>`/`<a>`/`<input>`. Never put click handlers on a `div`. Every interactive element has a visible `focus-visible` outline. When UI swaps in place (inline edit, confirm step), move focus to the new control.
- **Not-yet-built destinations** render as non-interactive text with `aria-disabled="true"` and a visible "Soon"/"Coming soon" pill. Never use a dead link.
- **Landmarks**: one `<main>` per page (layouts wrap children in a plain `<div>`). Nav has an `aria-label`. Icons next to text are `aria-hidden` (see `src/components/ui/icons.tsx`).
- **Confirmation** before destructive actions (e.g. deactivating a vehicle).
