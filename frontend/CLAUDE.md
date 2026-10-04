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
- New role areas (`driver`, `parent`, `admin`) should get a `layout.tsx` modeled on the head-of-transport one: sidebar, brand header, nav with icons, user block. The brand header is `<BrandMark size={sizing.brandSidebar} />` next to the "Wassel" text; don't redraw the logo.

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
| `cta.*` | The public call to action (`CtaLink` in `components/ui/Button.tsx`): small solid `accent[400]` fill, `primary[900]` navy label (10.2:1), `accent[300]` hover with a soft amber glow. One style everywhere it appears; in-app forms keep the blue primary `Button`. |
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
