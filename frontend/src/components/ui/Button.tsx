"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonTheme = "light" | "dark";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  theme?: ButtonTheme;
}

// error[600] (not error[500]) is the darkest shade of red whose white
// label text still clears 4.5:1 — kept the same in both themes since the
// button paints its own background regardless of the surface behind it.
const VARIANT_STYLES_LIGHT: Record<ButtonVariant, CSSProperties> = {
  primary: {
    backgroundColor: colors.primary[500],
    color: "#ffffff",
    border: "1px solid transparent",
  },
  secondary: {
    backgroundColor: colors.secondary[50],
    color: colors.secondary[700],
    border: `1px solid ${colors.secondary[200]}`,
  },
  danger: {
    backgroundColor: colors.error[600],
    color: "#ffffff",
    border: "1px solid transparent",
  },
  ghost: {
    backgroundColor: "transparent",
    color: colors.neutral[700],
    border: `1px solid ${colors.neutral[300]}`,
  },
};

const VARIANT_STYLES_DARK: Record<ButtonVariant, CSSProperties> = {
  primary: {
    backgroundColor: colors.primary[500],
    color: "#ffffff",
    border: "1px solid transparent",
  },
  secondary: {
    backgroundColor: "rgba(100, 64, 255, 0.16)",
    color: darkTheme.text.primary,
    border: `1px solid ${darkTheme.surface.inputBorder}`,
  },
  danger: {
    backgroundColor: colors.error[600],
    color: "#ffffff",
    border: "1px solid transparent",
  },
  ghost: {
    backgroundColor: "transparent",
    color: darkTheme.text.secondary,
    border: `1px solid ${darkTheme.surface.inputBorder}`,
  },
};

// Shared button used across role areas — Wassim's login form (SCRUM-173)
// should use this instead of a one-off <button>. Dark by default (the
// app's identity); pass theme="light" only on an explicitly light surface.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", theme = "dark", style, className = "", type = "button", ...props },
    ref,
  ) => {
    const variantStyles =
      theme === "dark" ? VARIANT_STYLES_DARK[variant] : VARIANT_STYLES_LIGHT[variant];
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        style={{
          ...variantStyles,
          borderRadius: radius.md,
          padding: `${spacing.sm} ${spacing.md}`,
          outlineColor: colors.primary[500],
          ...style,
        }}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
