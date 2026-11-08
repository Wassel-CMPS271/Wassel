"use client";

import { Button } from "@/components/ui/Button";
import type { ConnectivityState } from "@/lib/offline/connectivity";
import { darkTheme, radius, sizing, spacing } from "@/styles/tokens";

export interface ConnectionBannerProps {
  state: ConnectivityState;
  // The queue is paused (a 401): sending stopped until the driver is signed in
  // again, whatever connectivity says.
  paused: boolean;
  // Unsent confirmations on this phone right now (queued/sending/error/blocked/
  // conflict) — not only this run's, since signing out or reconnecting matters
  // for all of them.
  savedCount: number;
  // False until SCRUM-263 (confirmationReplayApi is null): confirmations stay
  // online-only, so there's nothing queued to send and no "Send now" to offer.
  replayAvailable: boolean;
  onSendNow: () => void;
}

function pluralStops(count: number): string {
  return count === 1 ? "1 confirmation" : `${count} confirmations`;
}

// role="status": announced without interrupting, the way the page's other
// non-error notices are (frontend/CLAUDE.md).
export function ConnectionBanner({
  state,
  paused,
  savedCount,
  replayAvailable,
  onSendNow,
}: ConnectionBannerProps) {
  if (!paused && state === "online") return null;

  const style = {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: spacing.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    borderRadius: radius.md,
    border: `1px solid ${darkTheme.surface.inputBorder}`,
    backgroundColor: darkTheme.surface.input,
  };

  if (paused) {
    return (
      <div role="status" style={style}>
        <p className="text-sm" style={{ color: darkTheme.text.primary }}>
          You&apos;re signed out. Sign in again, then send{" "}
          {savedCount > 0 ? pluralStops(savedCount) : "what's saved on this phone"}.
        </p>
        <Button variant="secondary" onClick={onSendNow} style={{ flexShrink: 0, minHeight: sizing.tapTarget }}>
          Send now
        </Button>
      </div>
    );
  }

  if (!replayAvailable) {
    return (
      <div role="status" style={style}>
        <p className="text-sm" style={{ color: darkTheme.text.primary }}>
          {state === "offline" ? "You're offline." : "Checking your connection…"} Offline saving
          isn&apos;t available yet, so confirmations can&apos;t be sent until you&apos;re back
          online.
        </p>
      </div>
    );
  }

  return (
    <div role="status" style={style}>
      <p className="text-sm" style={{ color: darkTheme.text.primary }}>
        {state === "offline" ? "You're offline." : "Checking your connection…"}{" "}
        {savedCount > 0
          ? `${pluralStops(savedCount)} saved on this phone, sent once you're back online.`
          : "Confirmations will be saved on this phone until you're back online."}
      </p>
      {savedCount > 0 && (
        <Button variant="secondary" onClick={onSendNow} style={{ flexShrink: 0, minHeight: sizing.tapTarget }}>
          Send now
        </Button>
      )}
    </div>
  );
}
