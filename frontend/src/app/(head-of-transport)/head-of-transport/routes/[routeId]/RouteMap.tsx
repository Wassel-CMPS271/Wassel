"use client";

// The route on a map (SCRUM-220): the pinned stops in position order, the line
// to the school, and the school. Drawn only from `route`, so the page redraws
// it from the Route every add, remove and drop answers with. The same
// information is listed as text under the map, and the stops with no pin are
// listed apart, because the map can't show them. While an optimization
// proposal is open (SCRUM-221) a radio group switches all of it between the
// current and the proposed order.

import type { ReactNode } from "react";
import Link from "next/link";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { isValidCoordinates } from "@/components/map/geo";
import type { Route, Stop } from "@/lib/api/routes";
import { colors, darkTheme, mapTheme, radius, sizing, spacing } from "@/styles/tokens";

const STUDENTS_HREF = "/head-of-transport/students";
const NOT_SET = "Arrival time not set yet";

const linkClass =
  "inline-flex items-center self-start text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-md";
// minHeight keeps the links a full tap target on a phone.
const linkStyle = { color: colors.primary[300], outlineColor: colors.primary[400], minHeight: sizing.tapTarget };

// The contract sends "HH:mm"; the slice also covers a time sent with seconds.
export function formatArrival(time: string | null): string {
  return time ? time.slice(0, 5) : NOT_SET;
}

export function arrivalText(time: string | null): string {
  return time ? `Arrives ${formatArrival(time)}` : NOT_SET;
}

function stopName(stop: Stop): string {
  return `${stop.firstName} ${stop.lastName}`;
}

// The number is the stop's position, so it stays right when stops before it
// have no pin.
function stopLabel(stop: Stop): string {
  return `Stop ${stop.position}: ${stopName(stop)}`;
}

function Popup({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="flex flex-col" style={{ gap: spacing.xs }}>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
        {detail}
      </span>
    </span>
  );
}

// "1 and 2", "1, 2 and 3"
function joinWithAnd(numbers: number[]): string {
  const items = numbers.map(String);
  if (items.length < 2) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// "Stops 1 and 2: Jad Mansour, Lea Mansour", for the marker shared by
// several stops at one spot.
function groupLabel(stops: Stop[]): string {
  return `Stops ${joinWithAnd(stops.map((stop) => stop.position))}: ${stops.map(stopName).join(", ")}`;
}

// Lists every student sharing the marker, each with their own stop number
// and arrival time.
function GroupPopup({ stops }: { stops: Stop[] }) {
  return (
    <span className="flex flex-col" style={{ gap: spacing.sm }}>
      {stops.map((stop) => (
        <span key={stop.studentId} className="flex flex-col" style={{ gap: spacing.xs }}>
          <span className="text-sm font-medium">{stopLabel(stop)}</span>
          <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {arrivalText(stop.arrivalTime)}
          </span>
        </span>
      ))}
    </span>
  );
}

// The same look as the marker on the map: a numbered stop, or the school.
// `fill` is a route's own color on the multi-route proposal (SCRUM-224).
export function Badge({
  children,
  school = false,
  fill = mapTheme.stopFill,
}: {
  children: ReactNode;
  school?: boolean;
  fill?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center text-xs font-semibold"
      style={{
        width: mapTheme.stopSize,
        height: mapTheme.stopSize,
        borderRadius: radius.full,
        backgroundColor: school ? mapTheme.schoolFill : fill,
        color: school ? mapTheme.schoolInk : mapTheme.markerText,
      }}
    >
      {children}
    </span>
  );
}

function ListRow({ badge, title, detail }: { badge: ReactNode; title: string; detail: string }) {
  return (
    <li className="list-none flex items-center" style={{ gap: spacing.sm }}>
      {badge}
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-medium break-words" style={{ color: darkTheme.text.primary }}>
          {title}
        </span>
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {detail}
        </span>
      </span>
    </li>
  );
}

function singleMarker(stop: Stop): MapMarker {
  return {
    id: stop.studentId,
    number: stop.position,
    label: stopLabel(stop),
    latitude: stop.latitude,
    longitude: stop.longitude,
    popup: <Popup title={stopName(stop)} detail={arrivalText(stop.arrivalTime)} />,
  };
}

// Several stops at one spot (siblings at one address) would otherwise draw
// separate markers exactly on top of each other, hiding all but the last.
// They become one marker, numbered with the group's lowest position and
// badged with how many more it stands for.
function groupMarker(stops: Stop[]): MapMarker {
  const lead = stops[0]; // `stops` arrives in position order, so this is the lowest
  return {
    id: stops.map((stop) => stop.studentId).join(","),
    number: lead.position,
    count: stops.length - 1,
    label: groupLabel(stops),
    latitude: lead.latitude,
    longitude: lead.longitude,
    popup: <GroupPopup stops={stops} />,
  };
}

// One marker per distinct pinned spot, in `stops`' order, each standing in
// for every stop at that spot.
function buildMarkers(stops: Stop[]): MapMarker[] {
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
    if (!isValidCoordinates(stop)) {
      markers.push(singleMarker(stop));
      continue;
    }
    const key = `${stop.latitude},${stop.longitude}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    const group = groups.get(key)!;
    markers.push(group.length > 1 ? groupMarker(group) : singleMarker(group[0]));
  }
  return markers;
}

export type MapOrder = "current" | "proposed";

// While an optimization proposal is open (SCRUM-221) the map can show either
// order. The page owns `view`, so each new proposal starts on "proposed".
export interface MapComparison {
  proposedStops: Stop[];
  view: MapOrder;
  onViewChange: (view: MapOrder) => void;
}

const ORDER_OPTIONS: { value: MapOrder; label: string }[] = [
  { value: "current", label: "Current order" },
  { value: "proposed", label: "Proposed order" },
];

// Native radios, so arrow keys move between them and the group is announced
// with its legend. minHeight keeps each option a full tap target.
function OrderSwitch({ view, onViewChange }: Omit<MapComparison, "proposedStops">) {
  return (
    <fieldset className="flex flex-wrap items-center" style={{ gap: spacing.md, border: 0, padding: 0, margin: 0 }}>
      <legend className="text-sm font-medium" style={{ color: darkTheme.text.secondary, marginBottom: spacing.xs }}>
        Map shows
      </legend>
      {ORDER_OPTIONS.map((option) => (
        <label
          key={option.value}
          className="inline-flex items-center text-sm font-medium cursor-pointer"
          style={{ gap: spacing.sm, minHeight: sizing.tapTarget, color: darkTheme.text.primary }}
        >
          <input
            type="radio"
            name="route-map-order"
            value={option.value}
            checked={view === option.value}
            onChange={() => onViewChange(option.value)}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ accentColor: colors.primary[400], outlineColor: colors.primary[400] }}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function RouteMap({ route, comparison }: { route: Route; comparison?: MapComparison }) {
  const shownOrder = comparison?.view;
  const stops = comparison?.view === "proposed" ? comparison.proposedStops : route.stops;
  const pinned = stops.filter(isValidCoordinates);
  const unpinned = stops.filter((stop) => !isValidCoordinates(stop));
  const hasPinned = pinned.length > 0;
  const schoolOnMap = isValidCoordinates(route.school);
  const schoolArrival = route.school.arrivalTime
    ? `Arrival ${formatArrival(route.school.arrivalTime)}`
    : NOT_SET;

  const markers: MapMarker[] = buildMarkers(stops);

  const emptyMessage =
    stops.length === 0
      ? "No students on this route yet. Add a student to see the route on the map."
      : "None of the students on this route has a pin yet, so there is nothing to draw. Add pins on the Students page.";

  return (
    <section aria-labelledby="route-map-heading" className="flex flex-col" style={{ gap: spacing.md }}>
      <div className="flex flex-col" style={{ gap: spacing.xs }}>
        <h2 id="route-map-heading" className="text-lg font-semibold" style={{ color: darkTheme.text.primary }}>
          Route map
        </h2>
        {comparison && <OrderSwitch view={comparison.view} onViewChange={comparison.onViewChange} />}
        {hasPinned && (
          <a href="#route-stop-list" className={linkClass} style={linkStyle}>
            Skip to the stops as a list
          </a>
        )}
      </div>

      <MapView
        label={`Map of ${route.name}`}
        markers={markers}
        // With no pinned stop the map shows its empty state, not the school alone.
        school={hasPinned ? { ...route.school, label: "School", popup: <Popup title="School" detail={schoolArrival} /> } : null}
        // Points without coordinates are skipped, so a school with none just ends the line at the last stop.
        path={hasPinned ? [...stops, route.school] : undefined}
        emptyMessage={emptyMessage}
      />

      {hasPinned && !schoolOnMap && (
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          The school&apos;s location isn&apos;t set, so the line stops at the last pinned stop.
        </p>
      )}

      {hasPinned && (
        <div className="flex flex-col" style={{ gap: spacing.sm }}>
          <h3
            id="route-stop-list"
            tabIndex={-1}
            className="text-base font-semibold"
            style={{ color: darkTheme.text.primary }}
          >
            {shownOrder ? `Stops in ${shownOrder} order` : "Stops in order"}
          </h3>
          <ol className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
            {pinned.map((stop) => (
              <ListRow
                key={stop.studentId}
                badge={<Badge>{stop.position}</Badge>}
                title={stopLabel(stop)}
                detail={arrivalText(stop.arrivalTime)}
              />
            ))}
            {schoolOnMap && <ListRow badge={<Badge school>S</Badge>} title="School" detail={schoolArrival} />}
          </ol>
        </div>
      )}

      {unpinned.length > 0 && (
        <div
          className="flex flex-col"
          style={{
            gap: spacing.sm,
            padding: spacing.md,
            border: `1px dashed ${darkTheme.surface.cardBorder}`,
            borderRadius: radius.md,
            backgroundColor: darkTheme.surface.recede,
          }}
        >
          <h3 className="text-base font-semibold" style={{ color: colors.warning[500] }}>
            Not on the map: no pin yet
          </h3>
          <ul className="flex flex-col" style={{ gap: spacing.xs, padding: 0, margin: 0 }}>
            {unpinned.map((stop) => (
              <li key={stop.studentId} className="list-none text-sm" style={{ color: darkTheme.text.secondary }}>
                {stopLabel(stop)}
              </li>
            ))}
          </ul>
          <Link href={STUDENTS_HREF} className={linkClass} style={linkStyle}>
            Add pins on the Students page
          </Link>
        </div>
      )}
    </section>
  );
}
