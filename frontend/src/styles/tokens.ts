// Shared design tokens (colors, spacing, radius, typography).
//
// SCRUM-158: single source of truth for Wassel's visual language.
// Import these plain constants directly in components, or reference them
// from tailwind.config to generate matching utility classes — both read
// from the same values, so there's never a mismatch between the two.
//
// Usage in a component:
//   import { colors, spacing } from "@/styles/tokens";
//   <div style={{ color: colors.primary[500], padding: spacing.md }} />
//
// Usage in tailwind.config (if/when one is added on top of Tailwind v4's
// CSS-based theme):
//   import { colors, spacing, radius, typography } from "./src/styles/tokens";
//   theme: { extend: { colors, spacing, borderRadius: radius, ... } }
//
// Wassim (SCRUM-173): import from this file instead of hardcoding hex
// values or spacing numbers in the login UI.

/**
 * Color palette.
 * Each color exposes a 50–900 scale (50 = lightest, 900 = darkest) so
 * components can pick the right shade for backgrounds, borders, text,
 * and hover/active states without inventing new hex values.
 */
export const colors = {
  primary: {
    50: "#eef4ff",
    100: "#d9e6ff",
    200: "#b3ccff",
    300: "#80a8ff",
    400: "#4d7fff",
    500: "#1a56ff", // primary brand color — default buttons, links, active states
    600: "#1445d1",
    700: "#0f359e",
    800: "#0a256e",
    900: "#061847",
  },
  secondary: {
    50: "#f2f0ff",
    100: "#e1dcff",
    200: "#c3b9ff",
    300: "#a08fff",
    400: "#8267ff",
    500: "#6440ff", // secondary accent color — supporting actions, highlights
    600: "#4f2fd6",
    700: "#3c22a3",
    800: "#2a1873",
    900: "#1a0e49",
  },
  neutral: {
    50: "#fafafa",
    100: "#f4f4f5",
    200: "#e4e4e7",
    300: "#d4d4d8",
    400: "#a1a1aa",
    500: "#71717a", // default body text on light backgrounds
    600: "#52525b",
    700: "#3f3f46",
    800: "#27272a",
    900: "#18181b",
  },
  success: {
    50: "#ecfdf3",
    100: "#d1fadf",
    500: "#12b76a", // success text/icons
    600: "#079455",
    700: "#067647",
  },
  error: {
    50: "#fef3f2",
    100: "#fee4e2",
    500: "#f04438", // error text/icons, destructive actions
    600: "#d92d20",
    700: "#b42318",
  },
  warning: {
    50: "#fffaeb",
    100: "#fef0c7",
    500: "#f79009", // warning text/icons
    600: "#dc6803",
    700: "#b54708",
  },
  // Signature warm accent. Use sparingly: active nav item, hover states,
  // small highlights (eyebrow labels), the brand mark badge, and the public
  // "Sign in" CTA (see `cta` below). Never for large fills or body text.
  accent: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d", // accent text on dark surfaces (~12.5:1 on surface.card)
    400: "#fbbf24", // accent icons, indicator bars
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
  },
} as const;

/**
 * Spacing scale, in pixels. Use for padding, margin, gap, etc.
 * Named after t-shirt sizes so call sites stay readable
 * (e.g. spacing.md instead of a bare "16px").
 */
export const spacing = {
  none: "0px",
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
  "3xl": "64px",
  "4xl": "96px",
} as const;

/**
 * Border radius scale. "full" is for pills/avatars (fully rounded).
 */
export const radius = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  full: "9999px",
} as const;

/**
 * Typography scale.
 * fontSize entries pair a px size with a matched line-height so text
 * never needs a one-off line-height override at the call site.
 */
export const typography = {
  fontFamily: {
    // Matches the global body font set in globals.css — keep these in sync.
    serif: '"Times New Roman", Times, serif',
  },
  fontSize: {
    xs: { size: "12px", lineHeight: "16px" },
    sm: { size: "14px", lineHeight: "20px" },
    base: { size: "16px", lineHeight: "24px" }, // default body text
    lg: { size: "18px", lineHeight: "28px" },
    xl: { size: "20px", lineHeight: "28px" },
    "2xl": { size: "24px", lineHeight: "32px" },
    "3xl": { size: "30px", lineHeight: "38px" },
    "4xl": { size: "36px", lineHeight: "44px" },
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

/**
 * Dark theme tokens — the default visual identity for every page (see
 * frontend/CLAUDE.md). Light styling stays available as an explicit
 * opt-in via theme="light" on the shared UI components.
 *
 * Every text tone here was checked against WCAG AA (4.5:1 body text,
 * 3:1 large text) on both `background.base` and `surface.card`/`input`:
 *   text.primary  ~16.6:1 on surface.card, ~18.6:1 on background.base
 *   text.secondary ~10.9:1 on surface.card
 *   text.muted     ~5.7:1 on surface.input, ~6.0:1 on surface.card
 * Re-check contrast with a tool like WebAIM's checker if any of these
 * values change.
 */
export const darkTheme = {
  background: {
    base: "#05060a", // page background, bottom of the gradient
    top: "#0b0d14", // page background, top of the gradient
    glowPrimary: "rgba(26, 86, 255, 0.18)", // radial glow tint, from colors.primary[500]
    glowSecondary: "rgba(100, 64, 255, 0.12)", // radial glow tint, from colors.secondary[500]
  },
  surface: {
    card: "#14161d", // elevated card background
    cardBorder: "rgba(255, 255, 255, 0.08)",
    cardShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
    input: "#1b1e27", // recessed input fill, one step lighter than card
    inputBorder: "rgba(255, 255, 255, 0.14)",
    sidebar: "rgba(16, 18, 24, 0.78)", // translucent nav rail over the page gradient
    sidebarBlur: "blur(12px)", // backdropFilter that pairs with `sidebar`
    recede: "rgba(255, 255, 255, 0.03)", // inactive/"before" items that should sit back
  },
  interactive: {
    hoverBg: "rgba(251, 191, 36, 0.06)", // accent tint for hovered nav items/cards
    activeBg: "rgba(251, 191, 36, 0.12)", // accent tint for the current nav item
    activeBorder: "rgba(251, 191, 36, 0.35)",
    // Focus ring for controls over photo/video: primary[400] outline with a
    // dark halo (same as background.base) so it clears 3:1 on any frame (~5.6:1).
    focusRing: colors.primary[400],
    focusHalo: "#05060a",
  },
  text: {
    primary: "#f5f5f7", // headings, primary content
    secondary: "#c7c9d1", // body copy, capacity values
    muted: "#9497a3", // helper text, placeholders
  },
  status: {
    activeDot: colors.success[500],
    activeGlow: "rgba(18, 183, 106, 0.55)",
    inactiveDot: colors.neutral[400],
  },
} as const;

/**
 * Primary public call to action (the landing page "Sign in" links): a
 * small solid amber fill with a navy label. Contrast (WCAG formula):
 *   text (primary[900]) on bg (accent[400])      10.2:1
 *   text (primary[900]) on bgHover (accent[300]) 11.9:1
 * The focus ring stays primary[400] with the dark halo (5.6:1).
 */
export const cta = {
  bg: colors.accent[400],
  bgHover: colors.accent[300],
  text: colors.primary[900],
  glow: "0 0 24px rgba(251, 191, 36, 0.45)", // hover glow, tint of accent[400]
} as const;

/**
 * Brand mark: amber badge with a navy school bus in front of a pale
 * sunrise arc. Bus on badge 10.2:1; bus on sun 13.7:1. Keep
 * src/app/icon.svg in sync with these values.
 */
export const brand = {
  badge: colors.accent[400],
  ink: colors.primary[900],
  sun: colors.accent[100],
} as const;

/** Minimum hit area for any link or button (WCAG 2.5.5 target size). */
export const sizing = {
  tapTarget: "44px",
  brandSidebar: "40px", // BrandMark beside the wordmark in the role sidebars (was the old "W" badge size)
} as const;

/** Icon pixel sizes, so call sites don't pass bare numbers. */
export const iconSize = {
  sm: 16, // inline glyph inside a button (the CTA arrow, "Back to home")
  md: 20, // feature icons inside a tile
} as const;

/**
 * Public landing page (SCRUM-183).
 *
 * Display sizes scale fluidly between the mobile and desktop values, so
 * headings don't need breakpoint classes.
 *
 * Scrims are tints of background.base (rgb 5, 6, 10) over photo/video.
 * Worst case checked against a pure-white pixel under the scrim (sRGB blend):
 *   alpha 0.72 -> text.primary 7.9:1, text.secondary 5.2:1, accent[300] 6.0:1
 *   alpha 0.80 -> text.primary 10.8:1, text.secondary 7.1:1
 * text.muted fails over media (2.9:1 at 0.72), so it is never used there.
 */
export const landing = {
  contentMaxWidth: "1200px",
  display: {
    hero: { size: "clamp(36px, 3.6vw + 20px, 64px)", lineHeight: "1.08" },
    section: { size: "clamp(28px, 1.6vw + 22px, 40px)", lineHeight: "1.2" },
  },
  // lg and up: at least 0.8 across the left 55% where the text column sits
  // (the text column never extends past ~59% of the viewport at lg).
  heroScrimWide:
    "linear-gradient(90deg, rgba(5, 6, 10, 0.92) 0%, rgba(5, 6, 10, 0.8) 55%, rgba(5, 6, 10, 0.72) 60%, rgba(5, 6, 10, 0.25) 80%, rgba(5, 6, 10, 0.08) 100%)",
  // Below lg the text spans most of the width, so the tint is even.
  heroScrimNarrow: "rgba(5, 6, 10, 0.72)",
  // Bottom of the hero fades into the page background.
  heroFadeBottom: `linear-gradient(180deg, transparent 65%, ${darkTheme.background.base} 100%)`,
  // Closing CTA image: page color at the edges, at least 0.72 everywhere else.
  ctaScrim: `linear-gradient(180deg, ${darkTheme.background.base} 0%, rgba(5, 6, 10, 0.72) 25%, rgba(5, 6, 10, 0.72) 75%, ${darkTheme.background.base} 100%)`,
} as const;

/**
 * Auth pages (SCRUM-186): /login, /reset-password, /set-password, /verify-2fa.
 *
 * Scrims are tints of colors.primary[900] (navy, rgb 6, 24, 71) over the hero
 * photo. Worst case checked against a pure-white pixel under the scrim:
 *   alpha 0.80 -> text.primary 8.5:1, text.secondary 5.6:1
 *   alpha 0.75 -> text.primary 7.1:1, text.secondary 4.7:1
 * Controls over the photo use the two-tone focus ring (focusRing.ts).
 */
export const auth = {
  cardMaxWidth: "420px",
  // Frosted card: surface.card at 0.72 plus blur. Over the 0.8 mobile scrim
  // text.secondary stays above 9.4:1 and the focus ring above 4.2:1.
  cardSurface: "rgba(20, 22, 29, 0.72)",
  cardBlur: "blur(16px)",
  // Desktop photo panel width (lg and up); the form column takes the rest.
  panelColumns: "55fr 45fr",
  // Desktop panel: lighter at the top so the photo reads, at least 0.8 from
  // 55% down, where the headline sits (bottom-aligned).
  panelScrim:
    "linear-gradient(180deg, rgba(6, 24, 71, 0.3) 0%, rgba(6, 24, 71, 0.55) 35%, rgba(6, 24, 71, 0.8) 55%, rgba(6, 24, 71, 0.88) 100%)",
  // Below lg the photo sits behind the card and the "Back to home" link.
  backdropScrim: "rgba(6, 24, 71, 0.8)",
  // Keeps the bus in frame when the photo is cropped to a tall panel.
  photoPosition: "72% center",
} as const;

/**
 * Full-page background: soft primary/secondary radial glows over a dark
 * vertical gradient. Applied once by each role layout so every page in
 * that area shares one continuous backdrop — pages shouldn't set their own.
 */
export const darkPageBackground = [
  `radial-gradient(1200px circle at 15% -10%, ${darkTheme.background.glowPrimary}, transparent 55%)`,
  `radial-gradient(900px circle at 100% 0%, ${darkTheme.background.glowSecondary}, transparent 50%)`,
  `linear-gradient(180deg, ${darkTheme.background.top} 0%, ${darkTheme.background.base} 100%)`,
].join(", ");
