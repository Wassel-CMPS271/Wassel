"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import type { ConnectivityState } from "@/lib/offline/connectivity";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

export interface ConnectionBannerProps {
  state: ConnectivityState;
  // The queue is paused (a 401 of its own): sending stopped until the session is
  // checked or the driver is signed in again, whatever connectivity says. The page
  // sends the driver to /login on its own once /me confirms it; the link is for
  // when that check couldn't answer.
  paused: boolean;
  // /me confirmed the session is gone. Until it has (it's still asking, or couldn't
  // answer), the paused banner doesn't claim the session expired.
  sessionExpired: boolean;
  // Unsent confirmations on this phone right now (queued/sending/error/blocked/
  // conflict) — not only this run's, since signing out or reconnecting matters
  // for all of them.
  savedCount: number;
  // False while taps can't be saved on this phone (its storage is full, blocked,
  // unreadable or corrupt): they're sent straight to the server instead, so nothing
  // new is kept for later while offline. Shown whatever connectivity says — a
  // corrupt queue is just as unable to save a tap while online as while offline.
  canSave: boolean;
  onSendNow: () => void;
}

function pluralStops(count: number): string {
  return count === 1 ? "1 confirmation" : `${count} confirmations`;
}

const bannerStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: spacing.sm,
  padding: `${spacing.sm} ${spacing.md}`,
  borderRadius: radius.md,
  border: `1px solid ${darkTheme.surface.inputBorder}`,
  backgroundColor: darkTheme.surface.input,
};

function connectivityPrefix(state: ConnectivityState): string {
  if (state === "offline") return "You're offline. ";
  if (state === "unknown") return "Checking your connection… ";
  return "";
}

// The wrapper (role="status") stays mounted whatever there is to say, even nothing:
// a live region that already exists when its content changes is reliably announced,
// while one that appears already holding its final text is not always (frontend/
// CLAUDE.md, screen-reader notices). Only bannerContent, and the style that gives the
// banner its visible box, vary.
export function ConnectionBanner({
  state,
  paused,
  sessionExpired,
  savedCount,
  canSave,
  onSendNow,
}: ConnectionBannerProps) {
  const content = bannerContent({ state, paused, sessionExpired, savedCount, canSave, onSendNow });

  return (
    <div role="status" aria-live="polite" style={content ? bannerStyle : undefined}>
      {content}
    </div>
  );
}

function bannerContent({
  state,
  paused,
  sessionExpired,
  savedCount,
  canSave,
  onSendNow,
}: ConnectionBannerProps): ReactNode | null {
  if (paused) {
    const saved =
      savedCount > 0 ? `the ${pluralStops(savedCount)} saved on this phone` : "anything saved on this phone";
    return (
      <>
        <p className="text-sm" style={{ color: darkTheme.text.primary }}>
          {sessionExpired
            ? `Your session expired. Sign in again, and ${saved} will be sent.`
            : `Sending is paused while your sign-in is checked. Once it is, ${saved} will be sent.`}
        </p>
        <Link
          href="/login?expired=1"
          className={`inline-flex items-center text-sm font-medium underline ${focusRingClass}`}
          style={{
            ...focusRingStyle,
            color: colors.primary[300],
            minHeight: sizing.tapTarget,
            borderRadius: radius.md,
            flexShrink: 0,
          }}
        >
          Sign in again
        </Link>
        <Button variant="secondary" onClick={onSendNow} style={{ flexShrink: 0, minHeight: sizing.tapTarget }}>
          Send now
        </Button>
      </>
    );
  }

  // Shown whatever connectivity says: a tap can't be saved for later either way, so
  // the driver must be told even while online (a corrupt queue, say), not only while
  // offline.
  if (!canSave) {
    const message =
      state === "online"
        ? "Confirmations can't be saved on this phone right now. Taps go straight to the server instead."
        : `${connectivityPrefix(state)}Confirmations can't be saved on this phone right now, so they can't be sent until you're back online.`;
    return (
      <p className="text-sm" style={{ color: darkTheme.text.primary }}>
        {message}
      </p>
    );
  }

  if (state === "online") return null;

  return (
    <>
      <p className="text-sm" style={{ color: darkTheme.text.primary }}>
        {connectivityPrefix(state)}
        {savedCount > 0
          ? `${pluralStops(savedCount)} saved on this phone, sent once you're back online.`
          : "Confirmations will be saved on this phone until you're back online."}
      </p>
      {savedCount > 0 && (
        <Button variant="secondary" onClick={onSendNow} style={{ flexShrink: 0, minHeight: sizing.tapTarget }}>
          Send now
        </Button>
      )}
    </>
  );
}
