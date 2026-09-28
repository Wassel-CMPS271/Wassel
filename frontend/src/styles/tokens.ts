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
  // small highlights (eyebrow labels). Never for large fills or body text.
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
  },
  interactive: {
    hoverBg: "rgba(251, 191, 36, 0.06)", // accent tint for hovered nav items/cards
    activeBg: "rgba(251, 191, 36, 0.12)", // accent tint for the current nav item
    activeBorder: "rgba(251, 191, 36, 0.35)",
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
 * Full-page background: soft primary/secondary radial glows over a dark
 * vertical gradient. Applied once by each role layout so every page in
 * that area shares one continuous backdrop — pages shouldn't set their own.
 */
export const darkPageBackground = [
  `radial-gradient(1200px circle at 15% -10%, ${darkTheme.background.glowPrimary}, transparent 55%)`,
  `radial-gradient(900px circle at 100% 0%, ${darkTheme.background.glowSecondary}, transparent 50%)`,
  `linear-gradient(180deg, ${darkTheme.background.top} 0%, ${darkTheme.background.base} 100%)`,
].join(", ");
