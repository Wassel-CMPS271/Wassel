"use client";

import { forwardRef, useId, useState } from "react";
import type { CSSProperties } from "react";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
import type { InputProps } from "@/components/ui/Input";
import { colors, darkTheme, iconSize, radius, sizing } from "@/styles/tokens";

export type PasswordInputProps = Omit<InputProps, "type" | "endAdornment">;

// Input with a show/hide toggle. The toggle's name stays "Show password" and
// aria-pressed carries the state, so screen readers hear "pressed" when the
// password is visible. The eye/slashed-eye icon mirrors it visually.
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ id, theme = "dark", ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [visible, setVisible] = useState(false);
    const isDark = theme === "dark";

    return (
      <Input
        ref={ref}
        id={inputId}
        theme={theme}
        type={visible ? "text" : "password"}
        endAdornment={
          <button
            type="button"
            aria-label="Show password"
            aria-pressed={visible}
            aria-controls={inputId}
            onClick={() => setVisible((v) => !v)}
            className={`inline-flex self-stretch items-center justify-center text-[var(--toggle-color)] transition-colors duration-150 hover:text-[var(--toggle-color-hover)] motion-reduce:transition-none ${focusRingClass}`}
            style={
              {
                ...focusRingStyle,
                "--toggle-color": isDark ? darkTheme.text.secondary : colors.neutral[600],
                "--toggle-color-hover": isDark ? darkTheme.text.primary : colors.neutral[900],
                width: sizing.tapTarget,
                minHeight: sizing.tapTarget,
                borderRadius: radius.md,
              } as CSSProperties
            }
          >
            {visible ? <EyeOffIcon size={iconSize.md} /> : <EyeIcon size={iconSize.md} />}
          </button>
        }
        {...props}
      />
    );
  },
);
PasswordInput.displayName = "PasswordInput";
