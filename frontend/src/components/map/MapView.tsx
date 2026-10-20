"use client";

// Shared map (SCRUM-222): stops, the school, the line between them, and a
// draggable pin. Leaflet only runs in the browser, so the map itself is
// loaded client-only with next/dynamic; the server renders the region and a
// placeholder of the same height. See "Map" in frontend/CLAUDE.md.

import dynamic from "next/dynamic";
import { RouteIcon } from "@/components/ui/icons";
import { darkTheme, mapTheme, radius, sizing, spacing } from "@/styles/tokens";
import { isValidCoordinates } from "./geo";
import type { MapViewProps } from "./types";

export type { Coordinates, MapMarker, MapRoute, MapSchool, MapViewProps, MaybeCoordinates } from "./types";

function MapSkeleton({ height }: { height: string }) {
  return (
    <div
      aria-busy="true"
      className="w-full animate-pulse motion-reduce:animate-none"
      style={{ height, borderRadius: radius.lg, backgroundColor: darkTheme.surface.skeleton }}
    >
      <span className="sr-only">Loading map</span>
    </div>
  );
}

// `loading` can't see the props, so the placeholder uses the default height.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <MapSkeleton height={mapTheme.height} />,
});

function MapEmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{
        padding: spacing.xl,
        border: `1px dashed ${darkTheme.surface.cardBorder}`,
        borderRadius: radius.lg,
        backgroundColor: darkTheme.surface.emptyState,
      }}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center"
        style={{
          width: sizing.emptyStateBadge,
          height: sizing.emptyStateBadge,
          borderRadius: radius.full,
          backgroundColor: darkTheme.surface.emptyStateBadge,
          color: darkTheme.text.muted,
          marginBottom: spacing.md,
        }}
      >
        <RouteIcon size={24} />
      </span>
      <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: sizing.emptyStateText }}>
        {message}
      </p>
    </div>
  );
}

export function MapView({ label, emptyMessage = "No locations to show yet.", ...props }: MapViewProps) {
  const pinMode = props.onPinChange !== undefined;
  const hasSomethingToShow =
    (props.markers ?? []).some(isValidCoordinates) ||
    (props.routes ?? []).some(
      (route) => (route.markers ?? []).some(isValidCoordinates) || (route.path ?? []).some(isValidCoordinates),
    ) ||
    isValidCoordinates(props.school) ||
    (props.path ?? []).some(isValidCoordinates) ||
    (pinMode && isValidCoordinates(props.pin)) ||
    isValidCoordinates(props.center);

  return (
    <section aria-label={label} className="w-full">
      {hasSomethingToShow ? <LeafletMap {...props} /> : <MapEmptyState message={emptyMessage} />}
    </section>
  );
}
