import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { auth, colors, darkTheme, iconSize, landing, radius, sizing, spacing, typography } from "@/styles/tokens";

const SUBLINE = "Every student. Every stop. Every morning.";

interface AuthShellProps {
  /** Large line on the desktop photo panel. */
  headline: string;
  children: ReactNode;
}

// Page frame for the auth screens. lg and up: split screen, the hero photo
// with a navy scrim and the headline on the left (auth.panelColumns), the
// card centered on the page background on the right. Below lg: the photo
// is a dimmed fixed backdrop behind the card. The (public) layout supplies
// the page background and MotionConfig.
export function AuthShell({ headline, children }: AuthShellProps) {
  return (
    <main className="relative min-h-[100svh] lg:grid" style={{ gridTemplateColumns: auth.panelColumns }}>
      <div className="fixed inset-0 lg:sticky lg:inset-auto lg:top-0 lg:h-[100svh]">
        {/* next/image `fill` needs a relative/absolute/fixed parent, not sticky. */}
        <div className="absolute inset-0">
          <Image
            src="/landing/hero-poster.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover"
            style={{ objectPosition: auth.photoPosition }}
          />
        </div>
        <div aria-hidden="true" className="absolute inset-0 lg:hidden" style={{ background: auth.backdropScrim }} />
        <div aria-hidden="true" className="absolute inset-0 hidden lg:block" style={{ background: auth.panelScrim }} />

        <div className="absolute inset-x-0 bottom-0 hidden lg:block" style={{ padding: spacing["3xl"] }}>
          <span
            aria-hidden="true"
            className="block"
            style={{
              width: spacing["2xl"],
              height: spacing.xs,
              borderRadius: radius.full,
              backgroundColor: colors.accent[400],
            }}
          />
          <p
            style={{
              margin: `${spacing.lg} 0 0`,
              color: darkTheme.text.primary,
              fontSize: landing.display.hero.size,
              lineHeight: landing.display.hero.lineHeight,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            {headline}
          </p>
          <p className="text-xl" style={{ margin: `${spacing.md} 0 0`, color: darkTheme.text.secondary }}>
            {SUBLINE}
          </p>
        </div>
      </div>

      <div
        className="relative flex min-h-[100svh] flex-col items-center justify-center"
        style={{ padding: `${spacing.xl} ${spacing.md}` }}
      >
        <div className="flex w-full flex-col" style={{ maxWidth: auth.cardMaxWidth, gap: spacing.md }}>
          <Link
            href="/"
            className={`inline-flex items-center self-start text-sm font-medium text-[var(--back-color)] transition-colors duration-150 hover:text-[var(--back-color-hover)] motion-reduce:transition-none ${focusRingClass}`}
            style={
              {
                ...focusRingStyle,
                "--back-color": darkTheme.text.secondary,
                "--back-color-hover": darkTheme.text.primary,
                gap: spacing.sm,
                minHeight: sizing.tapTarget,
                paddingRight: spacing.sm,
                borderRadius: radius.md,
              } as CSSProperties
            }
          >
            <ArrowLeftIcon size={iconSize.sm} />
            Back to home
          </Link>
          {children}
        </div>
      </div>
    </main>
  );
}
