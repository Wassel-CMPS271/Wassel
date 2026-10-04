import type { CSSProperties } from "react";
import { darkTheme } from "@/styles/tokens";

// Two-tone focus ring for controls that can sit over photo or video: the
// halo fills the outline offset so the blue ring keeps 3:1 on any frame.
// Kept out of "use client" modules so server components get the real values.
export const focusRingClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_2px_var(--focus-halo)]";

export const focusRingStyle = {
  "--focus-halo": darkTheme.interactive.focusHalo,
  outlineColor: darkTheme.interactive.focusRing,
} as CSSProperties;
