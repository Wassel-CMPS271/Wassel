"use client";

import { forwardRef, useId } from "react";
import type { CSSProperties, SelectHTMLAttributes } from "react";
import { colors, darkTheme, lightTheme, radius, spacing, typography } from "@/styles/tokens";

export type SelectTheme = "light" | "dark";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  theme?: SelectTheme;
}

// Labeled select, styled to match Input (same label, error and focus-ring
// treatment) so a form can mix text fields and pickers without the error
// handling looking different. Dark by default; pass theme="light" only on
// an explicitly light surface.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, theme = "dark", id, className = "", style, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const errorId = error ? `${selectId}-error` : undefined;
    const isDark = theme === "dark";

    return (
      <div className="flex flex-col" style={{ gap: spacing.xs }}>
        <label
          htmlFor={selectId}
          className="text-sm font-medium"
          style={{ color: isDark ? darkTheme.text.secondary : colors.neutral[700] }}
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={`w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
          style={
            {
              borderRadius: radius.md,
              padding: `${spacing.sm} ${spacing.md}`,
              border: `1px solid ${
                error ? colors.error[500] : isDark ? darkTheme.surface.inputBorder : colors.neutral[300]
              }`,
              backgroundColor: isDark ? darkTheme.surface.input : lightTheme.inputFill,
              color: isDark ? darkTheme.text.primary : lightTheme.inputText,
              fontFamily: typography.fontFamily.serif,
              outlineColor: colors.primary[500],
              ...style,
            } as CSSProperties
          }
          {...props}
        >
          {children}
        </select>
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
Select.displayName = "Select";
