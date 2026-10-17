import type { ReactNode } from "react";

// A point that may be missing. Matches `Stop` in lib/api/routes.ts (both null
// means "no pin yet"), so stops can be passed to the map as they are.
export interface MaybeCoordinates {
  latitude: number | null;
  longitude: number | null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface MapMarker extends MaybeCoordinates {
  id: string; // e.g. the stop's studentId
  label: string; // accessible name, e.g. "Stop 1: Hadi Rizk"
  number?: number; // shows a numbered badge, e.g. Stop.position
  popup?: ReactNode; // opened on click or Enter
}

// `RouteSchool` from lib/api/routes.ts fits as is.
export interface MapSchool extends Coordinates {
  label?: string; // default "School"
  popup?: ReactNode;
}

export interface MapViewProps {
  label: string; // the map region's accessible name
  markers?: MapMarker[]; // markers without coordinates are skipped
  school?: MapSchool | null;
  // Ordered points joined by a line, e.g. [...route.stops, route.school].
  // Points without coordinates are skipped, as in the contract's leg rule.
  path?: MaybeCoordinates[];
  // A fixed view. Without it the map fits itself to all the points.
  center?: Coordinates;
  zoom?: number;
  // Pin mode: passing onPinChange shows a single draggable pin, also placed
  // by clicking the map. The pin is controlled: echo the new value back.
  pin?: Coordinates | null;
  onPinChange?: (latitude: number, longitude: number) => void;
  pinLabel?: string; // default "Pin"
  height?: string; // default mapTheme.height
  emptyMessage?: string; // shown when there is nothing to put on the map
}
