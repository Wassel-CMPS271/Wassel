"use client";

// The proposal on a map (SCRUM-224 step 3): every planned route with
// students drawn at once, each in its own color from mapTheme.routeColors,
// converging on the shared school. The planned-routes list above is the
// full alternative: color is never the only signal, since the legend
// repeats each route's name and every marker's accessible name says which
// route it's on. A route with no stops, or whose stops have no pin, draws
// nothing — same skip rule as RouteMap. The palette has 10 colors; past 10
// routes they repeat, so each marker's popup names its route too and a note
// under the map says so.

import { MapView, type MapMarker, type MapRoute } from "@/components/map/MapView";
import { isValidCoordinates } from "@/components/map/geo";
import type { FleetProposal, PlannedRoute, Stop } from "@/lib/api/routes";
import { darkTheme, mapTheme, spacing } from "@/styles/tokens";
import { arrivalText } from "../[routeId]/RouteMap";

const PALETTE = mapTheme.routeColors;

// Each drawn route's color by vehicle id. Only routes with stops are drawn,
// so an emptied route takes no color. The planned-route cards use the same
// colors, so a card and its line on the map match.
export function routeColorsFor(proposal: FleetProposal): Map<string, string> {
  const drawn = proposal.routes.filter((route) => route.stops.length > 0);
  return new Map(drawn.map((route, index) => [route.vehicle.id, PALETTE[index % PALETTE.length]]));
}

function stopName(stop: Stop): string {
  return `${stop.firstName} ${stop.lastName}`;
}

// "1 and 2", "1, 2 and 3"
function joinWithAnd(numbers: number[]): string {
  const items = numbers.map(String);
  if (items.length < 2) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// The route's name first, since its color can be shared once there are more
// than 10 routes; then each student at the spot with their stop and time.
function StopPopup({ stops, routeLabel }: { stops: Stop[]; routeLabel: string }) {
  return (
    <span className="flex flex-col" style={{ gap: spacing.xs }}>
      <span className="text-sm font-medium">{routeLabel}</span>
      {stops.map((stop) => (
        <span key={stop.studentId} className="text-sm" style={{ color: darkTheme.text.secondary }}>
          Stop {stop.position}: {stopName(stop)}, {arrivalText(stop.arrivalTime)}
        </span>
      ))}
    </span>
  );
}

// e.g. "Route B 101101, stop 2: Hadi Rizk" — the route comes first so the
// marker's own name still reads correctly once Leaflet announces it apart
// from the legend and the map's own label.
function singleMarker(stop: Stop, routeLabel: string): MapMarker {
  return {
    id: stop.studentId,
    number: stop.position,
    label: `${routeLabel}, stop ${stop.position}: ${stopName(stop)}`,
    latitude: stop.latitude,
    longitude: stop.longitude,
    popup: <StopPopup stops={[stop]} routeLabel={routeLabel} />,
  };
}

// Several stops at one spot (siblings at one address), same grouping rule
// as RouteMap's groupMarker.
function groupMarker(stops: Stop[], routeLabel: string): MapMarker {
  const lead = stops[0]; // `stops` arrives in position order, so this is the lowest
  return {
    id: stops.map((stop) => stop.studentId).join(","),
    number: lead.position,
    count: stops.length - 1,
    label: `${routeLabel}, stops ${joinWithAnd(stops.map((stop) => stop.position))}: ${stops.map(stopName).join(", ")}`,
    latitude: lead.latitude,
    longitude: lead.longitude,
    popup: <StopPopup stops={stops} routeLabel={routeLabel} />,
  };
}

// One marker per distinct pinned spot on this route, in `stops`' order.
// Stops without a pin are skipped, like RouteMap does for the single-route
// map; the proposal's text table under the map is where they're read.
function buildMarkers(stops: Stop[], routeLabel: string): MapMarker[] {
  const groups = new Map<string, Stop[]>();
  for (const stop of stops) {
    if (!isValidCoordinates(stop)) continue;
    const key = `${stop.latitude},${stop.longitude}`;
    const group = groups.get(key);
    if (group) group.push(stop);
    else groups.set(key, [stop]);
  }

  const emitted = new Set<string>();
  const markers: MapMarker[] = [];
  for (const stop of stops) {
    if (!isValidCoordinates(stop)) continue;
    const key = `${stop.latitude},${stop.longitude}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    const group = groups.get(key)!;
    markers.push(group.length > 1 ? groupMarker(group, routeLabel) : singleMarker(group[0], routeLabel));
  }
  return markers;
}

function buildRoute(route: PlannedRoute, school: FleetProposal["school"], color: string): MapRoute {
  return {
    id: route.vehicle.id,
    label: route.name,
    color,
    markers: buildMarkers(route.stops, route.name),
    path: [...route.stops, school],
  };
}

export function GenerationMap({ proposal }: { proposal: FleetProposal }) {
  const colorFor = routeColorsFor(proposal);
  const routes: MapRoute[] = proposal.routes
    .filter((route) => colorFor.has(route.vehicle.id))
    .map((route) => buildRoute(route, proposal.school, colorFor.get(route.vehicle.id)!));

  return (
    <div className="flex flex-col" style={{ gap: spacing.sm }}>
      <MapView
        label="Map of the proposed routes"
        routes={routes}
        school={routes.length > 0 ? { ...proposal.school, label: "School" } : null}
        emptyMessage="No planned route has any students yet, so there is nothing to draw."
      />
      {routes.length > PALETTE.length && (
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {`The map has ${routes.length} routes and ${PALETTE.length} colors, so some routes share a color. The legend and each stop's popup name its route.`}
        </p>
      )}
    </div>
  );
}
