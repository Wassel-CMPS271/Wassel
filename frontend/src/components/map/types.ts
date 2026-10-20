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
  // One marker can stand in for several stops that share a spot (e.g.
  // siblings at one address). `count` is how many more besides the one
  // shown by `number`, drawn as a small "+N" badge.
  count?: number;
  popup?: ReactNode; // opened on click or Enter
}

// `RouteSchool` from lib/api/routes.ts fits as is. A school without
// coordinates is skipped, like a stop without a pin.
export interface MapSchool extends MaybeCoordinates {
  label?: string; // default "School"
  popup?: ReactNode;
}

// One route on a multi-route map (SCRUM-224, e.g. the "Generate routes"
// proposal): its own numbered markers, its own line ending at the shared
// `school`, and its own color from `mapTheme.routeColors`. A route with no
// stops (empty `markers` and `path`) draws nothing.
export interface MapRoute {
  id: string; // React key, e.g. the route's vehicle id
  label: string; // route name or plate, shown in the legend
  color: string; // from mapTheme.routeColors
  markers?: MapMarker[]; // this route's stops; markers without coordinates are skipped
  path?: MaybeCoordinates[]; // this route's line, e.g. [...route.stops, school]
}

export interface MapViewProps {
  label: string; // the map region's accessible name
  markers?: MapMarker[]; // markers without coordinates are skipped
  school?: MapSchool | null;
  // Ordered points joined by a line, e.g. [...route.stops, route.school].
  // Points without coordinates are skipped, as in the contract's leg rule.
  path?: MaybeCoordinates[];
  // Several routes on one map, each with its own markers, line and color.
  // A legend naming each route is drawn beside the map. Use this instead of
  // (or alongside) `markers`/`path` for a multi-route map; existing callers
  // that only pass `markers`/`path` are unaffected.
  routes?: MapRoute[];
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
