import type { CSSProperties, ReactNode } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Card";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { auth, darkTheme, sizing, spacing, typography } from "@/styles/tokens";

// Spread onto every field in an auth form: tap-target height and the
// two-tone focus ring, since the card can sit over the hero photo.
export const authFieldProps = {
  className: focusRingClass,
  style: { ...focusRingStyle, minHeight: sizing.tapTarget } as CSSProperties,
};

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

// Frosted sign-in card shared by /login, /reset-password, /set-password and
// /verify-2fa: brand lockup, page heading, then the form. Sits inside AuthShell.
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <Card
      className="p-[var(--card-pad)] sm:p-[var(--card-pad-wide)]"
      style={
        {
          "--card-pad": spacing.lg,
          "--card-pad-wide": spacing.xl,
          padding: undefined,
          backgroundColor: auth.cardSurface,
          backdropFilter: auth.cardBlur,
          WebkitBackdropFilter: auth.cardBlur,
        } as CSSProperties
      }
    >
      <div className="flex flex-col" style={{ gap: spacing.lg }}>
        <div className="flex items-center" style={{ gap: spacing.sm }}>
          <BrandMark />
          <span className="text-xl font-bold tracking-wide" style={{ color: darkTheme.text.primary }}>
            Wassel
          </span>
        </div>

        <div>
          <h1
            style={{
              margin: 0,
              color: darkTheme.text.primary,
              fontSize: typography.fontSize["2xl"].size,
              lineHeight: typography.fontSize["2xl"].lineHeight,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              margin: `${spacing.sm} 0 0`,
              color: darkTheme.text.secondary,
              fontSize: typography.fontSize.sm.size,
              lineHeight: typography.fontSize.sm.lineHeight,
            }}
          >
            {description}
          </p>
        </div>

        {children}
      </div>
    </Card>
  );
}
