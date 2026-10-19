"use client";

// The Leaflet side of MapView. Leaflet touches `window` as soon as it loads,
// so this module is only ever imported through MapView's client-only
// next/dynamic call. Import MapView, not this file.

import "leaflet/dist/leaflet.css";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import type { LatLngTuple, LeafletEvent, Map as LeafletMapInstance, Marker as LeafletMarker } from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/Button";
import { darkTheme, iconSize, mapTheme, radius, sizing, spacing } from "@/styles/tokens";
import { formatCoordinates, isNudgeKey, isValidCoordinates, nudgeCoordinates } from "./geo";
import { pinIcon, schoolIcon, stopIcon } from "./markerIcons";
import type { Coordinates, MapRoute, MapViewProps } from "./types";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// Required by the OpenStreetMap tile usage policy.
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const DEFAULT_ZOOM = 15; // a fixed `center` without a `zoom`
const POINT_ZOOM = 16; // a single point, and the closest auto-fit gets
const FIT_PADDING: [number, number] = [32, 32];

type View = { center: LatLngTuple; zoom: number } | { bounds: LatLngTuple[] };

function toTuple({ latitude, longitude }: Coordinates): LatLngTuple {
  return [latitude, longitude];
}

function computeView(center: Coordinates | undefined, zoom: number | undefined, points: Coordinates[]): View {
  if (center && isValidCoordinates(center)) return { center: toTuple(center), zoom: zoom ?? DEFAULT_ZOOM };
  if (points.length === 1) return { center: toTuple(points[0]), zoom: zoom ?? POINT_ZOOM };
  if (points.length > 1) return { bounds: points.map(toTuple) };
  return { center: [0, 0], zoom: 2 }; // MapView shows its empty state before this can happen
}

// Re-applies the view when the markers, school, path or fixed view change.
// MapContainer applies the first view itself, so the first run is skipped.
// The pin isn't part of the key, so dragging it never moves the map.
function FitView({ viewKey, animate }: { viewKey: string; animate: boolean }) {
  const map = useMap();
  const isFirst = useRef(true);
  const view = useMemo(() => JSON.parse(viewKey) as View, [viewKey]);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if ("bounds" in view) {
      map.fitBounds(view.bounds, { padding: FIT_PADDING, maxZoom: POINT_ZOOM, animate });
    } else {
      map.setView(view.center, view.zoom, { animate });
    }
  }, [map, view, animate]);

  return null;
}

function MapClick({ onClick }: { onClick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onClick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

// Leaflet makes markers focusable; this names them for screen readers.
function labelMarker(marker: LeafletMarker | null | undefined, label: string) {
  const element = marker?.getElement();
  if (!element) return;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", label);
}

function LabelledMarker({
  position,
  label,
  icon,
  zIndexOffset,
  popup,
}: {
  position: LatLngTuple;
  label: string;
  icon: ReturnType<typeof stopIcon>;
  zIndexOffset?: number;
  popup?: ReactNode;
}) {
  const ref = useRef<LeafletMarker>(null);
  useEffect(() => labelMarker(ref.current, label), [label]);

  return (
    <Marker
      ref={ref}
      position={position}
      icon={icon}
      zIndexOffset={zIndexOffset}
      eventHandlers={{ add: (event: LeafletEvent) => labelMarker(event.target, label) }}
    >
      {popup ? <Popup>{popup}</Popup> : null}
    </Marker>
  );
}

// Each route's name/plate next to its color swatch, so color is never the
// only way to tell routes apart. The swatch has the markers' own ring: the
// route colors alone are under 3:1 on the dark page.
function RouteLegend({ routes }: { routes: MapRoute[] }) {
  return (
    <ul
      aria-label="Routes on the map"
      className="flex flex-col shrink-0 min-w-0 sm:w-1/4"
      style={{ gap: spacing.sm, padding: 0, margin: 0 }}
    >
      {routes.map((route) => (
        <li key={route.id} className="list-none flex items-center text-sm" style={{ gap: spacing.sm }}>
          <span
            aria-hidden="true"
            className="inline-block shrink-0"
            style={{
              width: iconSize.sm,
              height: iconSize.sm,
              borderRadius: radius.full,
              backgroundColor: route.color,
              border: `2px solid ${mapTheme.markerRing}`,
            }}
          />
          <span className="min-w-0 break-words" style={{ color: darkTheme.text.secondary }}>
            {route.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

// A multi-route map puts the legend beside the map (under it on a phone).
// Without `routes` this adds nothing, so single-route maps keep their markup.
function WithLegend({ routes, children }: { routes: MapRoute[]; children: ReactNode }) {
  if (routes.length === 0) return <>{children}</>;
  return (
    <div className="flex w-full flex-col sm:flex-row" style={{ gap: spacing.md }}>
      {children}
      <RouteLegend routes={routes} />
    </div>
  );
}

export default function LeafletMap({
  markers = [],
  school,
  path,
  routes = [],
  center,
  zoom,
  pin,
  onPinChange,
  pinLabel = "Pin",
  height = mapTheme.height,
}: Omit<MapViewProps, "label" | "emptyMessage">) {
  const [map, setMap] = useState<LeafletMapInstance | null>(null);
  const animate = !useReducedMotion();
  const pinMode = onPinChange !== undefined;
  const validPin = pinMode && isValidCoordinates(pin) ? pin : null;

  const visibleMarkers = markers.filter(isValidCoordinates);
  const validSchool = isValidCoordinates(school) ? school : null;
  const pathPoints = (path ?? []).filter(isValidCoordinates).map(toTuple);
  const routeMarkers = routes.map((route) => (route.markers ?? []).filter(isValidCoordinates));
  const routePaths = routes.map((route) => (route.path ?? []).filter(isValidCoordinates).map(toTuple));

  const fitPoints: Coordinates[] = [...visibleMarkers, ...(validSchool ? [validSchool] : [])];
  for (const point of path ?? []) {
    if (isValidCoordinates(point)) fitPoints.push(point);
  }
  for (const route of routes) {
    for (const marker of route.markers ?? []) {
      if (isValidCoordinates(marker)) fitPoints.push(marker);
    }
    for (const point of route.path ?? []) {
      if (isValidCoordinates(point)) fitPoints.push(point);
    }
  }
  const viewKey = JSON.stringify(computeView(center, zoom, fitPoints));
  // The first view also takes in the pin, so an existing pin starts in sight.
  const [initialView] = useState(() =>
    computeView(center, zoom, validPin ? [...fitPoints, validPin] : fitPoints),
  );

  // The pin's keydown listener is attached once per marker element, so it
  // reads the latest pin and callback through refs.
  const latest = useRef({ pin: validPin, onPinChange, map });
  useEffect(() => {
    latest.current = { pin: validPin, onPinChange, map };
  });

  function handlePinKeyDown(event: KeyboardEvent) {
    const { pin: current, onPinChange: notify, map: mapInstance } = latest.current;
    if (!current || !isNudgeKey(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    // Otherwise Leaflet's own keyboard handler pans the map as well.
    event.preventDefault();
    event.stopPropagation();
    const next = nudgeCoordinates(current, event.key, mapInstance?.getZoom() ?? POINT_ZOOM);
    notify?.(next.latitude, next.longitude);
  }

  function placePinAtCenter() {
    if (!map || !onPinChange) return;
    const { lat, lng } = map.getCenter();
    onPinChange(lat, lng);
  }

  const wrapperStyle = {
    "--map-popup-bg": darkTheme.surface.card,
    "--map-popup-text": darkTheme.text.primary,
    "--map-focus": darkTheme.interactive.focusRing,
    "--focus-halo": darkTheme.interactive.focusHalo,
  } as CSSProperties;

  const pinStatusId = useId();

  return (
    <div className="wassel-map flex w-full flex-col" style={{ ...wrapperStyle, gap: spacing.sm }}>
      <WithLegend routes={routes}>
        <div
          className={`w-full overflow-hidden${routes.length > 0 ? " min-w-0" : ""}`}
          style={{ borderRadius: radius.lg, border: `1px solid ${darkTheme.surface.cardBorder}` }}
        >
          <MapContainer
            ref={setMap}
            {...("bounds" in initialView
              ? { bounds: initialView.bounds, boundsOptions: { padding: FIT_PADDING, maxZoom: POINT_ZOOM } }
              : { center: initialView.center, zoom: initialView.zoom })}
            scrollWheelZoom={false}
            zoomAnimation={animate}
            fadeAnimation={animate}
            markerZoomAnimation={animate}
            style={{ height, width: "100%", backgroundColor: darkTheme.surface.input }}
          >
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
            <FitView viewKey={viewKey} animate={animate} />

            {pathPoints.length > 1 ? (
              <Polyline
                positions={pathPoints}
                interactive={false}
                pathOptions={{ color: mapTheme.line, weight: mapTheme.lineWeight, opacity: mapTheme.lineOpacity }}
              />
            ) : null}

            {routes.map((route, index) =>
              routePaths[index].length > 1 ? (
                <Polyline
                  key={`route-path-${route.id}`}
                  positions={routePaths[index]}
                  interactive={false}
                  pathOptions={{ color: route.color, weight: mapTheme.lineWeight, opacity: mapTheme.lineOpacity }}
                />
              ) : null,
            )}

            {visibleMarkers.map((marker) => (
              <LabelledMarker
                key={marker.id}
                position={toTuple(marker)}
                label={marker.label}
                icon={stopIcon(marker.number, marker.count)}
                popup={marker.popup}
              />
            ))}

            {routes.map((route, index) =>
              routeMarkers[index].map((marker) => (
                <LabelledMarker
                  key={`${route.id}-${marker.id}`}
                  position={toTuple(marker)}
                  label={marker.label}
                  icon={stopIcon(marker.number, marker.count, route.color)}
                  popup={marker.popup}
                />
              )),
            )}

            {validSchool ? (
              <LabelledMarker
                position={toTuple(validSchool)}
                label={validSchool.label ?? "School"}
                icon={schoolIcon()}
                zIndexOffset={500}
                popup={validSchool.popup}
              />
            ) : null}

            {pinMode ? <MapClick onClick={onPinChange} /> : null}
            {validPin ? (
              <Marker
                position={toTuple(validPin)}
                icon={pinIcon()}
                draggable
                zIndexOffset={1000}
                eventHandlers={{
                  add: (event: LeafletEvent) => {
                    const marker = event.target as LeafletMarker;
                    labelMarker(marker, `${pinLabel}. Arrow keys move it.`);
                    const element = marker.getElement();
                    element?.setAttribute("aria-describedby", pinStatusId);
                    element?.addEventListener("keydown", handlePinKeyDown);
                  },
                  dragend: (event: LeafletEvent) => {
                    const { lat, lng } = (event.target as LeafletMarker).getLatLng();
                    onPinChange?.(lat, lng);
                  },
                }}
              />
            ) : null}
          </MapContainer>
        </div>
      </WithLegend>

      {pinMode ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between" style={{ gap: spacing.sm }}>
          <div className="text-sm">
            <p id={pinStatusId} aria-live="polite" style={{ color: darkTheme.text.secondary }}>
              {validPin
                ? `${pinLabel}: ${formatCoordinates(validPin)}`
                : `No ${pinLabel.toLowerCase()} yet. Click the map or use “Place pin at map centre”.`}
            </p>
            <p className="text-xs" style={{ color: darkTheme.text.muted }}>
              {validPin ? "Drag the pin, click the map, or focus the pin and use the arrow keys." : "Use the arrow keys on the map to pan."}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={placePinAtCenter}
            disabled={!map}
            style={{ minHeight: sizing.tapTarget, outlineColor: darkTheme.interactive.focusRing }}
          >
            {validPin ? "Move pin to map centre" : "Place pin at map centre"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
