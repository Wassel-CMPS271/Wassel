import { expect, it } from "vitest";
import { mapTheme } from "@/styles/tokens";
import { pinIcon, schoolIcon, stopIcon } from "./markerIcons";

function htmlOf(icon: ReturnType<typeof stopIcon>): string {
  return String(icon.options.html);
}

it("draws a numbered stop from the tokens", () => {
  const icon = stopIcon(3);
  expect(icon.options.className).toContain("wassel-map-stop");
  expect(htmlOf(icon)).toContain(">3</div>");
  expect(htmlOf(icon)).toContain(mapTheme.stopFill);
  expect(htmlOf(icon)).toContain('aria-hidden="true"');
  expect(icon.options.iconSize).toEqual([mapTheme.stopSize, mapTheme.stopSize]);
  expect(icon.options.iconAnchor).toEqual([mapTheme.stopSize / 2, mapTheme.stopSize / 2]);
});

it("draws a stop without a number", () => {
  expect(htmlOf(stopIcon())).toMatch(/><\/div>$/);
  expect(htmlOf(stopIcon(Number.NaN))).toMatch(/><\/div>$/);
});

it("only ever puts a whole number into the html", () => {
  expect(htmlOf(stopIcon(2.7))).toContain(">2</div>");
});

it("draws the school apart from the stops", () => {
  const icon = schoolIcon();
  expect(icon.options.className).toContain("wassel-map-school");
  expect(icon.options.className).not.toContain("wassel-map-stop");
  expect(htmlOf(icon)).toContain(mapTheme.schoolFill);
  expect(htmlOf(icon)).toContain("<svg");
});

it("anchors the pin at its tip", () => {
  const icon = pinIcon();
  expect(icon.options.className).toContain("wassel-map-pin");
  expect(htmlOf(icon)).toContain(mapTheme.pinFill);
  expect(icon.options.iconAnchor).toEqual([mapTheme.pinSize / 2, mapTheme.pinSize]);
});
