"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ComponentProps, CSSProperties } from "react";
import Link from "next/link";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { colors, cta, darkTheme, iconSize, radius, sizing, spacing } from "@/styles/tokens";

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

// The public call to action (e.g. "Sign in" -> /login): an amber fill with a
// navy label and an arrow that slides right on hover. CtaLink stays a real
// <a>; CtaButton is the same look as a form submit (the auth pages).
// Background and glow go through CSS variables so the static hover: classes
// can override them (inline styles would always beat :hover).
const CTA_CLASS = `group inline-flex items-center justify-center whitespace-nowrap text-base font-semibold transition-[background-color,box-shadow] duration-200 ease-out bg-[var(--cta-bg)] ${focusRingClass}`;

const CTA_STYLE = {
  ...focusRingStyle,
  "--cta-bg": cta.bg,
  "--cta-bg-hover": cta.bgHover,
  "--cta-glow": cta.glow,
  color: cta.text,
  gap: spacing.sm,
  borderRadius: radius.md,
  padding: `${spacing.sm} ${spacing.lg}`,
  minHeight: sizing.tapTarget,
} as CSSProperties;

function CtaArrow() {
  return (
    <svg
      width={iconSize.sm}
      height={iconSize.sm}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="transition-transform duration-200 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1 group-disabled:translate-x-0 motion-reduce:transition-none motion-reduce:transform-none"
    >
      <path d="M3 8h9.5M8.5 4l4 4-4 4" />
    </svg>
  );
}

export function CtaLink({ className = "", style, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={`${CTA_CLASS} hover:bg-[var(--cta-bg-hover)] hover:shadow-[var(--cta-glow)] ${className}`}
      style={{ ...CTA_STYLE, ...style }}
      {...props}
    >
      {children}
      <CtaArrow />
    </Link>
  );
}

// Submit-button twin of CtaLink. No hover glow while disabled (submitting).
export function CtaButton({
  className = "",
  style,
  children,
  type = "submit",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`${CTA_CLASS} enabled:hover:bg-[var(--cta-bg-hover)] enabled:hover:shadow-[var(--cta-glow)] disabled:cursor-not-allowed ${className}`}
      style={{ ...CTA_STYLE, ...style }}
      {...props}
    >
      {children}
      <CtaArrow />
    </button>
  );
}
