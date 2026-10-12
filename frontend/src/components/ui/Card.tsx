import type { HTMLAttributes } from "react";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

export type CardTheme = "light" | "dark";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  theme?: CardTheme;
}

// Shared surface used across role areas — Wassim's login form (SCRUM-173)
// should use this instead of a one-off bordered <div>. Dark by default
// (elevated surface with border + shadow); pass theme="light" only on an
// explicitly light surface.
export function Card({ theme = "dark", className = "", style, ...props }: CardProps) {
  const isDark = theme === "dark";
  return (
    <div
      className={className}
      style={{
        backgroundColor: isDark ? darkTheme.surface.card : "#ffffff",
        border: `1px solid ${isDark ? darkTheme.surface.cardBorder : colors.neutral[200]}`,
        borderRadius: radius.lg,
        padding: spacing.lg,
        ...(isDark ? { boxShadow: darkTheme.surface.cardShadow } : {}),
        ...style,
      }}
      {...props}
    />
  );
}
