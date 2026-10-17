import type { Coordinates, MaybeCoordinates } from "./types";

// True when both values are set, finite and in WGS84 range.
export function isValidCoordinates<T extends MaybeCoordinates>(
  point: T | null | undefined,
): point is T & Coordinates {
  if (!point) return false;
  const { latitude, longitude } = point;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export const NUDGE_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
export type NudgeKey = (typeof NUDGE_KEYS)[number];

export function isNudgeKey(key: string): key is NudgeKey {
  return (NUDGE_KEYS as readonly string[]).includes(key);
}

const NUDGE_PIXELS = 10;
const TILE_SIZE = 256;

// Moves a point about NUDGE_PIXELS on screen at the given zoom, for moving
// the pin with the arrow keys. In Web Mercator a pixel spans
// 360 / (256 * 2^zoom) degrees of longitude, and cos(latitude) times that of
// latitude.
export function nudgeCoordinates(
  { latitude, longitude }: Coordinates,
  key: NudgeKey,
  zoom: number,
): Coordinates {
  const lngStep = (NUDGE_PIXELS * 360) / (TILE_SIZE * 2 ** zoom);
  const latStep = lngStep * Math.cos((latitude * Math.PI) / 180);
  switch (key) {
    case "ArrowUp":
      return { latitude: Math.min(latitude + latStep, 90), longitude };
    case "ArrowDown":
      return { latitude: Math.max(latitude - latStep, -90), longitude };
    case "ArrowLeft":
      return { latitude, longitude: Math.max(longitude - lngStep, -180) };
    case "ArrowRight":
      return { latitude, longitude: Math.min(longitude + lngStep, 180) };
  }
}

// "33.88600, 35.48500": five decimals is about a metre.
export function formatCoordinates({ latitude, longitude }: Coordinates): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
