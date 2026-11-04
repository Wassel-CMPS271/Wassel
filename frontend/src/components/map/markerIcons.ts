// Marker icons for the map, drawn as divIcons from design tokens. Image
// icons would need Leaflet's default marker PNGs, whose paths break under a
// bundler. The html is built only from tokens and integers, never from
// caller strings, so nothing here needs escaping. The marker's accessible
// name is set on the marker element (see LeafletMap), so the html is hidden.

import { divIcon, type DivIcon } from "leaflet";
import { mapTheme, radius, typography } from "@/styles/tokens";

const RING = `2px solid ${mapTheme.markerRing}`;

function box(size: number, extra: string): string {
  return `width:${size}px;height:${size}px;box-sizing:border-box;box-shadow:${mapTheme.markerShadow};${extra}`;
}

// A small "+N" badge for a marker standing in for several stops at one
// spot, sized off the stop badge so it needs no token of its own. Colors
// are the stop badge's own two tokens, swapped (contrast is symmetric), or
// the route's own color on a multi-route map (SCRUM-224).
function countBadge(stopSize: number, extra: number, fill: string): string {
  const size = Math.round(stopSize * 0.55);
  return `<div aria-hidden="true" style="position:absolute;top:-2px;right:-2px;${box(
    size,
    `display:flex;align-items:center;justify-content:center;border-radius:${radius.full};border:${RING};background:${mapTheme.markerRing};color:${fill};font-size:${Math.round(size * 0.65)}px;line-height:1;font-weight:${typography.fontWeight.semibold};`,
  )}">+${extra}</div>`;
}

// `fill` defaults to the single-route stop color; a multi-route map passes
// the route's own color from `mapTheme.routeColors` instead.
export function stopIcon(number?: number, count?: number, fill: string = mapTheme.stopFill): DivIcon {
  const size = mapTheme.stopSize;
  const text =
    number === undefined || !Number.isFinite(number) ? "" : String(Math.trunc(number));
  const circle = `<div aria-hidden="true" style="${box(
    size,
    `display:flex;align-items:center;justify-content:center;border-radius:${radius.full};border:${RING};background:${fill};color:${mapTheme.markerText};font-size:${typography.fontSize.xs.size};line-height:1;font-weight:${typography.fontWeight.semibold};`,
  )}">${text}</div>`;
  const extra = count !== undefined && Number.isFinite(count) ? Math.trunc(count) : 0;
  const html =
    extra > 0
      ? `<div aria-hidden="true" style="position:relative;width:${size}px;height:${size}px;">${circle}${countBadge(size, extra, fill)}</div>`
      : circle;
  return divIcon({
    className: "wassel-map-marker wassel-map-stop",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// A schoolhouse glyph (24x24), in the brand ink on the brand badge.
const SCHOOL_GLYPH = `<svg viewBox="0 0 24 24" width="20" height="20" fill="${mapTheme.schoolInk}" focusable="false"><path d="M12 3 2 9l10 6 8-4.8V16h2V9L12 3zm-6 9.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.8L12 16l-6-3.8z"/></svg>`;

export function schoolIcon(): DivIcon {
  const size = mapTheme.schoolSize;
  const html = `<div aria-hidden="true" style="${box(
    size,
    `display:flex;align-items:center;justify-content:center;border-radius:${radius.md};border:${RING};background:${mapTheme.schoolFill};`,
  )}">${SCHOOL_GLYPH}</div>`;
  return divIcon({
    className: "wassel-map-marker wassel-map-school",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// A teardrop: a square with three round corners, turned so the square
// corner points down at the spot. The square's diagonal fits the icon box,
// so the tip lands on the bottom edge, where the anchor is.
export function pinIcon(): DivIcon {
  const size = mapTheme.pinSize;
  const side = Math.round(size / Math.SQRT2);
  const offset = (size - side) / 2;
  const dot = Math.round(side / 3);
  const html =
    `<div aria-hidden="true" style="position:relative;width:${size}px;height:${size}px;">` +
    `<div style="position:absolute;left:${offset}px;top:${offset}px;${box(
      side,
      `transform:rotate(-45deg);border-radius:50% 50% 50% 0;border:${RING};background:${mapTheme.pinFill};`,
    )}"></div>` +
    `<div style="position:absolute;left:${(size - dot) / 2}px;top:${(size - dot) / 2}px;width:${dot}px;height:${dot}px;border-radius:${radius.full};background:${mapTheme.markerRing};"></div>` +
    `</div>`;
  return divIcon({
    className: "wassel-map-marker wassel-map-pin",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}
