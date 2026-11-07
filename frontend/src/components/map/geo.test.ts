import { describe, expect, it } from "vitest";
import { formatCoordinates, isNudgeKey, isValidCoordinates, nudgeCoordinates } from "./geo";

describe("isValidCoordinates", () => {
  it("accepts a set, in-range point", () => {
    expect(isValidCoordinates({ latitude: 33.886, longitude: 35.485 })).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a stop without a pin", { latitude: null, longitude: null }],
    ["half a pin", { latitude: 33.886, longitude: null }],
    ["NaN", { latitude: Number.NaN, longitude: 35.485 }],
    ["Infinity", { latitude: 33.886, longitude: Number.POSITIVE_INFINITY }],
    ["latitude out of range", { latitude: 91, longitude: 35.485 }],
    ["longitude out of range", { latitude: 33.886, longitude: -181 }],
  ])("rejects %s", (_, point) => {
    expect(isValidCoordinates(point)).toBe(false);
  });
});

describe("nudgeCoordinates", () => {
  const start = { latitude: 33.886, longitude: 35.485 };

  it("moves the point in the arrow's direction", () => {
    expect(nudgeCoordinates(start, "ArrowUp", 15).latitude).toBeGreaterThan(start.latitude);
    expect(nudgeCoordinates(start, "ArrowDown", 15).latitude).toBeLessThan(start.latitude);
    expect(nudgeCoordinates(start, "ArrowLeft", 15).longitude).toBeLessThan(start.longitude);
    expect(nudgeCoordinates(start, "ArrowRight", 15).longitude).toBeGreaterThan(start.longitude);
    expect(nudgeCoordinates(start, "ArrowUp", 15).longitude).toBe(start.longitude);
  });

  it("moves about ten screen pixels, so less when zoomed in", () => {
    const far = nudgeCoordinates(start, "ArrowRight", 10).longitude - start.longitude;
    const near = nudgeCoordinates(start, "ArrowRight", 11).longitude - start.longitude;
    expect(near).toBeCloseTo(far / 2);
    // 10px at zoom 15: 10 * 360 / (256 * 2^15) degrees of longitude.
    expect(nudgeCoordinates(start, "ArrowRight", 15).longitude - start.longitude).toBeCloseTo(
      3600 / (256 * 2 ** 15),
    );
  });

  it("stays inside the valid range", () => {
    expect(nudgeCoordinates({ latitude: 90, longitude: 0 }, "ArrowUp", 0).latitude).toBe(90);
    expect(nudgeCoordinates({ latitude: 0, longitude: 180 }, "ArrowRight", 0).longitude).toBe(180);
  });
});

it("knows the arrow keys", () => {
  expect(isNudgeKey("ArrowUp")).toBe(true);
  expect(isNudgeKey("Enter")).toBe(false);
});

it("formats coordinates to five decimals", () => {
  expect(formatCoordinates({ latitude: 33.886, longitude: 35.48 })).toBe("33.88600, 35.48000");
});
