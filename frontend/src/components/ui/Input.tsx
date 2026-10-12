"use client";

import { forwardRef, useId } from "react";
import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { colors, darkTheme, radius, sizing, spacing, typography } from "@/styles/tokens";

export type InputTheme = "light" | "dark";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  theme?: InputTheme;
  /** Control pinned inside the field's right edge (e.g. a show-password toggle). */
  endAdornment?: ReactNode;
}

// Shared labeled input used across role areas — Wassim's login form
// (SCRUM-173) should use this instead of a one-off <input>. Dark by
// default (the app's identity); pass theme="light" only on an explicitly
// light surface. `--input-placeholder-color` is read by the ::placeholder
// rule in globals.css, since placeholder color can't be set inline.
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, theme = "dark", id, className = "", style, endAdornment, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const isDark = theme === "dark";

    return (
      <div className="flex flex-col" style={{ gap: spacing.xs }}>
        <label
          htmlFor={inputId}
          className="text-sm font-medium"
          style={{ color: isDark ? darkTheme.text.secondary : colors.neutral[700] }}
        >
          {label}
        </label>
        <div className="relative flex">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
            className={`w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
            style={
              {
                borderRadius: radius.md,
                padding: `${spacing.sm} ${spacing.md}`,
                // Leave room for the adornment (a tap-target-wide button).
                ...(endAdornment ? { paddingRight: `calc(${sizing.tapTarget} + ${spacing.xs})` } : {}),
                border: `1px solid ${
                  error ? colors.error[500] : isDark ? darkTheme.surface.inputBorder : colors.neutral[300]
                }`,
                backgroundColor: isDark ? darkTheme.surface.input : "#ffffff",
                color: isDark ? darkTheme.text.primary : "#111111",
                fontFamily: typography.fontFamily.serif,
                outlineColor: colors.primary[500],
                "--input-placeholder-color": isDark ? darkTheme.text.muted : colors.neutral[500],
                ...style,
              } as CSSProperties
            }
            {...props}
          />
          {endAdornment && <div className="absolute inset-y-0 right-0 flex items-center">{endAdornment}</div>}
        </div>
        {error && (
          <span
            id={errorId}
            role="alert"
            className="text-sm"
            style={{ color: isDark ? colors.error[500] : colors.error[600] }}
          >
            {error}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
