"use client";

// Explicit GPS opt-in (SCRUM-273): the driver turns live location sharing on and
// off for the current run; useGpsSharing/gpsState own the state machine, this is
// only the copy and the button for each of its states.

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LocationIcon } from "@/components/ui/icons";
import type { DriverGpsApi } from "@/lib/api/driverGps";
import type { Run } from "@/lib/api/runs";
import type { Connectivity } from "@/lib/offline/connectivity";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";
import { useGpsSharing } from "./useGpsSharing";

export interface GpsSharingCardProps {
  run: Run;
  api: DriverGpsApi | null;
  connectivity: Connectivity;
}

const cardStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: spacing.sm,
  padding: spacing.md,
};

// A static dot, not the pulsing live-status one used elsewhere: nothing here
// animates, so there's nothing for reduced motion to switch off. Decorative —
// the text next to it carries the meaning.
function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: "8px", height: "8px", backgroundColor: color }}
    />
  );
}

// Not-yet-built destinations are non-interactive text with a "Soon" pill
// (frontend/CLAUDE.md) — here, SCRUM-261 (the backend) not being merged yet.
function SoonCard() {
  return (
    <Card style={cardStyle}>
      <div className="flex items-center" style={{ gap: spacing.sm }}>
        <LocationIcon size={18} style={{ color: darkTheme.text.muted }} />
        <span aria-disabled="true" className="text-sm" style={{ color: darkTheme.text.muted }}>
          Share your live location
        </span>
        <span
          className="text-xs font-medium"
          style={{
            padding: `2px ${spacing.sm}`,
            borderRadius: radius.full,
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            color: darkTheme.text.muted,
          }}
        >
          Soon
        </span>
      </div>
    </Card>
  );
}

export function GpsSharingCard({ run, api, connectivity }: GpsSharingCardProps) {
  const { state, optIn, optOut, retry } = useGpsSharing({ run, api, connectivity });

  if (api === null) return <SoonCard />;

  switch (state.status) {
    case "unavailable":
      return (
        <Card style={cardStyle}>
          <p className="text-sm" style={{ color: darkTheme.text.muted }}>
            Location sharing isn&apos;t available on this device or browser (it needs a secure
            connection and location support).
          </p>
        </Card>
      );

    case "off":
      return (
        <Card style={cardStyle}>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Share your live location with the head of transportation while this run is in
            progress. It turns off automatically once the run ends, and you can stop it any time.
          </p>
          <Button
            onClick={optIn}
            className="w-full sm:w-auto"
            style={{ minHeight: sizing.tapTarget, alignSelf: "flex-start" }}
          >
            Share my location
          </Button>
        </Card>
      );

    case "requesting":
      return (
        <Card style={cardStyle}>
          <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Requesting your location…
          </p>
          <Button
            disabled
            className="w-full sm:w-auto"
            style={{ minHeight: sizing.tapTarget, alignSelf: "flex-start" }}
          >
            Requesting…
          </Button>
        </Card>
      );

    case "sharing":
      return (
        <Card style={cardStyle}>
          <div role="status" className="flex items-center" style={{ gap: spacing.sm }}>
            <Dot color={darkTheme.status.activeDot} />
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              Sharing your location with the head of transportation.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={optOut}
            className="w-full sm:w-auto"
            style={{ minHeight: sizing.tapTarget, alignSelf: "flex-start" }}
          >
            Stop sharing
          </Button>
        </Card>
      );

    case "paused": {
      const reasonText =
        state.blockedReason === "offline"
          ? "Paused — you're offline. It resumes on its own once you're back online."
          : state.blockedReason === "hidden"
            ? "Paused while this screen is off or in the background. Location sharing only works while this screen is open."
            : "Location sharing is only active while this run is in progress.";
      return (
        <Card style={cardStyle}>
          <div role="status" className="flex items-center" style={{ gap: spacing.sm }}>
            <Dot color={darkTheme.status.inactiveDot} />
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              {reasonText}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={optOut}
            className="w-full sm:w-auto"
            style={{ minHeight: sizing.tapTarget, alignSelf: "flex-start" }}
          >
            Stop sharing
          </Button>
        </Card>
      );
    }

    case "denied":
      return (
        <Card style={cardStyle}>
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            Location access is blocked. Open this site&apos;s settings in your browser, allow
            location, then try again.
          </p>
          <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
            <Button
              variant="secondary"
              onClick={retry}
              style={{ minHeight: sizing.tapTarget }}
            >
              Try again
            </Button>
            <Button variant="ghost" onClick={optOut} style={{ minHeight: sizing.tapTarget }}>
              Stop sharing
            </Button>
          </div>
        </Card>
      );

    case "error": {
      const message =
        state.errorCode === 3
          ? "Getting your location is taking too long."
          : "Couldn't get your location. Check your device's location settings.";
      return (
        <Card style={cardStyle}>
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            {message}
          </p>
          <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
            <Button
              variant="secondary"
              onClick={retry}
              style={{ minHeight: sizing.tapTarget }}
            >
              Try again
            </Button>
            <Button variant="ghost" onClick={optOut} style={{ minHeight: sizing.tapTarget }}>
              Stop sharing
            </Button>
          </div>
        </Card>
      );
    }
  }
}
