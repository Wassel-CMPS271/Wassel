import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DivIcon } from "leaflet";
import { mapTheme } from "@/styles/tokens";
import LeafletMap, { TILE_ATTRIBUTION, TILE_URL } from "./LeafletMap";

// react-leaflet needs a real browser layout, so it is replaced with plain
// elements that record their props. Leaflet itself (divIcon) is real.
const leaflet = vi.hoisted(() => ({
  map: {
    getCenter: vi.fn(),
    getZoom: vi.fn(),
    fitBounds: vi.fn(),
    setView: vi.fn(),
  },
  mapEvents: {} as { click?: (event: { latlng: { lat: number; lng: number } }) => void },
  // Latest event handlers per marker kind (stop, school, pin).
  markerHandlers: new Map<string, Record<string, (event: unknown) => void>>(),
}));

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T }).current = value;
}

vi.mock("react-leaflet", () => ({
  MapContainer: ({
    ref,
    children,
    center,
    zoom,
    bounds,
    style,
  }: Record<string, unknown> & { ref?: Ref<unknown>; children?: ReactNode; style?: { width?: string; height?: string } }) => {
    useEffect(() => assignRef(ref, leaflet.map), [ref]);
    return (
      <div
        data-testid="map"
        data-center={JSON.stringify(center)}
        data-zoom={String(zoom)}
        data-bounds={JSON.stringify(bounds)}
        data-width={style?.width}
        data-height={style?.height}
      >
        {children}
      </div>
    );
  },
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <div data-testid="tiles" data-url={url} data-attribution={attribution} />
  ),
  Polyline: ({ positions, pathOptions }: { positions: unknown; pathOptions?: { color?: string } }) => (
    <div data-testid="polyline" data-positions={JSON.stringify(positions)} data-color={pathOptions?.color} />
  ),
  Popup: ({ children }: { children: ReactNode }) => <div data-testid="popup">{children}</div>,
  Marker: function MockMarker({
    ref,
    position,
    icon,
    draggable,
    eventHandlers = {},
    children,
  }: {
    ref?: Ref<unknown>;
    position: [number, number];
    icon: DivIcon;
    draggable?: boolean;
    eventHandlers?: Record<string, (event: unknown) => void>;
    children?: ReactNode;
  }) {
    const element = useRef<HTMLDivElement>(null);
    const kind = String(icon.options.className).match(/wassel-map-(stop|school|pin)/)?.[1] ?? "";
    leaflet.markerHandlers.set(kind, eventHandlers);
    useEffect(() => {
      // Leaflet makes marker elements focusable.
      element.current!.tabIndex = 0;
      const marker = { getElement: () => element.current };
      assignRef(ref, marker);
      eventHandlers.add?.({ target: marker });
      // Only on mount, like Leaflet's "add".
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div
        ref={element}
        data-testid={`marker-${kind}`}
        data-position={JSON.stringify(position)}
        data-draggable={String(Boolean(draggable))}
        data-html={String(icon.options.html)}
      >
        {children}
      </div>
    );
  },
  useMap: () => leaflet.map,
  useMapEvents: (handlers: typeof leaflet.mapEvents) => {
    leaflet.mapEvents = handlers;
    return leaflet.map;
  },
}));

beforeEach(() => {
  leaflet.map.getCenter.mockReset().mockReturnValue({ lat: 33.9, lng: 35.5 });
  leaflet.map.getZoom.mockReset().mockReturnValue(15);
  leaflet.map.fitBounds.mockReset();
  leaflet.map.setView.mockReset();
  leaflet.mapEvents = {};
  leaflet.markerHandlers.clear();
});

afterEach(() => {
  cleanup();
});

const school = { latitude: 33.896, longitude: 35.484, arrivalTime: "07:30" };
const stops = [
  { studentId: "s-1", position: 1, firstName: "Hadi", lastName: "Rizk", latitude: 33.886, longitude: 35.485 },
  { studentId: "s-2", position: 2, firstName: "Lina", lastName: "Daher", latitude: null, longitude: null },
  { studentId: "s-3", position: 3, firstName: "Jad", lastName: "Salameh", latitude: 33.892, longitude: 35.49 },
];
const markers = stops.map((stop) => ({
  id: stop.studentId,
  label: `Stop ${stop.position}: ${stop.firstName} ${stop.lastName}`,
  number: stop.position,
  latitude: stop.latitude,
  longitude: stop.longitude,
  popup: <p>{stop.firstName}</p>,
}));

it("uses OpenStreetMap tiles with the attribution", () => {
  render(<LeafletMap school={school} />);

  const tiles = screen.getByTestId("tiles");
  expect(tiles).toHaveAttribute("data-url", TILE_URL);
  expect(TILE_URL).toContain("tile.openstreetmap.org");
  expect(tiles.getAttribute("data-attribution")).toContain("OpenStreetMap</a> contributors");
  expect(TILE_ATTRIBUTION).toContain("https://www.openstreetmap.org/copyright");
});

it("draws numbered, labelled stops and skips the ones without a pin", () => {
  render(<LeafletMap markers={markers} />);

  const drawn = screen.getAllByTestId("marker-stop");
  expect(drawn).toHaveLength(2);
  expect(drawn[0]).toHaveAttribute("aria-label", "Stop 1: Hadi Rizk");
  expect(drawn[0]).toHaveAttribute("role", "button");
  expect(drawn[0].getAttribute("data-html")).toContain(">1</div>");
  expect(drawn[1]).toHaveAttribute("aria-label", "Stop 3: Jad Salameh");
  expect(drawn[1].getAttribute("data-html")).toContain(">3</div>");
  expect(screen.queryByRole("button", { name: /Lina Daher/ })).not.toBeInTheDocument();
});

it("puts popup content inside its marker", () => {
  render(<LeafletMap markers={markers} />);

  const first = screen.getByRole("button", { name: "Stop 1: Hadi Rizk" });
  expect(within(first).getByTestId("popup")).toHaveTextContent("Hadi");
});

it("draws the school with its own marker", () => {
  render(<LeafletMap markers={markers} school={school} />);

  const schoolMarker = screen.getByTestId("marker-school");
  expect(schoolMarker).toHaveAttribute("aria-label", "School");
  expect(schoolMarker).toHaveAttribute("data-position", "[33.896,35.484]");
  expect(schoolMarker.getAttribute("data-html")).not.toEqual(
    screen.getAllByTestId("marker-stop")[0].getAttribute("data-html"),
  );
});

it("joins the path in order and skips points without a pin", () => {
  render(<LeafletMap markers={markers} school={school} path={[...stops, school]} />);

  expect(screen.getByTestId("polyline")).toHaveAttribute(
    "data-positions",
    JSON.stringify([
      [33.886, 35.485],
      [33.892, 35.49],
      [33.896, 35.484],
    ]),
  );
});

it("draws no line without a path", () => {
  render(<LeafletMap markers={markers} school={school} />);

  expect(screen.queryByTestId("polyline")).not.toBeInTheDocument();
});

it("fits all the points at first", () => {
  render(<LeafletMap markers={markers} school={school} />);

  expect(JSON.parse(screen.getByTestId("map").getAttribute("data-bounds")!)).toEqual([
    [33.886, 35.485],
    [33.892, 35.49],
    [33.896, 35.484],
  ]);
});

// jsdom has no layout, so phone width is checked through the styles: the map
// takes the full width of its column and a height that shrinks with the
// viewport.
it("fills the width and uses the viewport-based height, so it fits a phone", () => {
  render(<LeafletMap markers={markers} />);

  const map = screen.getByTestId("map");
  expect(map).toHaveAttribute("data-width", "100%");
  expect(map).toHaveAttribute("data-height", mapTheme.height);
  expect(mapTheme.height).toMatch(/^clamp\(.*vh/);
});

it("centers on a single point, or on a fixed center", () => {
  render(<LeafletMap school={school} />);
  expect(screen.getByTestId("map")).toHaveAttribute("data-center", "[33.896,35.484]");
  expect(screen.getByTestId("map")).toHaveAttribute("data-zoom", "16");
  cleanup();

  render(<LeafletMap markers={markers} center={{ latitude: 33.9, longitude: 35.5 }} zoom={12} />);
  expect(screen.getByTestId("map")).toHaveAttribute("data-center", "[33.9,35.5]");
  expect(screen.getByTestId("map")).toHaveAttribute("data-zoom", "12");
});

it("refits when the points change, but not when the pin moves", () => {
  const onPinChange = vi.fn();
  const { rerender } = render(
    <LeafletMap markers={markers} school={school} pin={{ latitude: 33.89, longitude: 35.48 }} onPinChange={onPinChange} />,
  );
  expect(leaflet.map.fitBounds).not.toHaveBeenCalled();

  rerender(<LeafletMap markers={markers} school={school} pin={{ latitude: 33.8, longitude: 35.4 }} onPinChange={onPinChange} />);
  expect(leaflet.map.fitBounds).not.toHaveBeenCalled();

  rerender(<LeafletMap markers={markers.slice(0, 1)} school={school} pin={{ latitude: 33.8, longitude: 35.4 }} onPinChange={onPinChange} />);
  expect(leaflet.map.fitBounds).toHaveBeenCalledTimes(1);
  expect(leaflet.map.fitBounds.mock.calls[0][0]).toEqual([
    [33.886, 35.485],
    [33.896, 35.484],
  ]);
});

it("shows no pin controls outside pin mode", () => {
  render(<LeafletMap markers={markers} school={school} />);

  expect(screen.queryByTestId("marker-pin")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /map centre/ })).not.toBeInTheDocument();
  leaflet.mapEvents.click?.({ latlng: { lat: 1, lng: 2 } });
  expect(leaflet.mapEvents.click).toBeUndefined();
});

it("places the first pin by clicking the map", () => {
  const onPinChange = vi.fn();
  render(<LeafletMap center={{ latitude: 33.896, longitude: 35.484 }} pin={null} onPinChange={onPinChange} />);

  expect(screen.queryByTestId("marker-pin")).not.toBeInTheDocument();
  expect(screen.getByText(/No pin yet/)).toBeInTheDocument();

  leaflet.mapEvents.click!({ latlng: { lat: 33.88, lng: 35.49 } });

  expect(onPinChange).toHaveBeenCalledWith(33.88, 35.49);
});

it("places the pin at the map centre from a button", () => {
  const onPinChange = vi.fn();
  render(<LeafletMap center={{ latitude: 33.896, longitude: 35.484 }} pin={null} onPinChange={onPinChange} />);

  fireEvent.click(screen.getByRole("button", { name: "Place pin at map centre" }));

  expect(onPinChange).toHaveBeenCalledWith(33.9, 35.5);
});

it("shows a draggable pin and reads out its coordinates", () => {
  render(
    <LeafletMap
      school={school}
      pin={{ latitude: 33.886, longitude: 35.485 }}
      onPinChange={vi.fn()}
      pinLabel="Home pin"
    />,
  );

  const pin = screen.getByRole("button", { name: "Home pin. Arrow keys move it." });
  expect(pin).toHaveAttribute("data-draggable", "true");
  expect(pin).toHaveAccessibleDescription("Home pin: 33.88600, 35.48500");
  expect(screen.getByText("Home pin: 33.88600, 35.48500")).toHaveAttribute("aria-live", "polite");
  expect(screen.getByRole("button", { name: "Move pin to map centre" })).toBeInTheDocument();
});

it("reports where the pin was dragged to", () => {
  const onPinChange = vi.fn();
  render(<LeafletMap pin={{ latitude: 33.886, longitude: 35.485 }} onPinChange={onPinChange} />);

  leaflet.markerHandlers.get("pin")!.dragend({ target: { getLatLng: () => ({ lat: 33.87, lng: 35.47 }) } });

  expect(onPinChange).toHaveBeenCalledWith(33.87, 35.47);
});

it("moves the pin with the arrow keys without panning the map", () => {
  const onPinChange = vi.fn();
  render(<LeafletMap pin={{ latitude: 33.886, longitude: 35.485 }} onPinChange={onPinChange} />);
  const pin = screen.getByTestId("marker-pin");

  const notPrevented = fireEvent.keyDown(pin, { key: "ArrowUp" });

  expect(notPrevented).toBe(false);
  expect(onPinChange).toHaveBeenCalledTimes(1);
  const [latitude, longitude] = onPinChange.mock.calls[0];
  expect(latitude).toBeGreaterThan(33.886);
  expect(longitude).toBe(35.485);

  onPinChange.mockClear();
  expect(fireEvent.keyDown(pin, { key: "Enter" })).toBe(true);
  fireEvent.keyDown(pin, { key: "ArrowLeft", ctrlKey: true });
  expect(onPinChange).not.toHaveBeenCalled();
});

it("moves from the latest pin after a rerender", () => {
  const onPinChange = vi.fn();
  const { rerender } = render(<LeafletMap pin={{ latitude: 33.886, longitude: 35.485 }} onPinChange={onPinChange} />);
  rerender(<LeafletMap pin={{ latitude: 10, longitude: 20 }} onPinChange={onPinChange} />);

  fireEvent.keyDown(screen.getByTestId("marker-pin"), { key: "ArrowRight" });

  const [latitude, longitude] = onPinChange.mock.calls[0];
  expect(latitude).toBe(10);
  expect(longitude).toBeGreaterThan(20);
});

it("leaves out a school without coordinates and ends the line at the last stop", () => {
  const noSchool = { latitude: null, longitude: null, arrivalTime: null };
  render(<LeafletMap markers={markers} school={noSchool} path={[...stops, noSchool]} />);

  expect(screen.queryByTestId("marker-school")).not.toBeInTheDocument();
  expect(screen.getByTestId("polyline")).toHaveAttribute(
    "data-positions",
    JSON.stringify([
      [33.886, 35.485],
      [33.892, 35.49],
    ]),
  );
});

// SCRUM-224: several routes on one map, each with its own markers and line.
const ROUTE_A = {
  id: "route-a",
  label: "Route A 101101",
  color: mapTheme.routeColors[1],
  markers: [
    {
      id: "a-1",
      label: "Route A 101101, stop 1: Hadi Rizk",
      number: 1,
      latitude: 33.886,
      longitude: 35.485,
    },
  ],
  path: [
    { latitude: 33.886, longitude: 35.485 },
    school,
  ],
};
const ROUTE_B = {
  id: "route-b",
  label: "Route B 202202",
  color: mapTheme.routeColors[2],
  markers: [
    {
      id: "b-1",
      label: "Route B 202202, stop 1: Jad Salameh",
      number: 1,
      latitude: 33.892,
      longitude: 35.49,
    },
  ],
  path: [
    { latitude: 33.892, longitude: 35.49 },
    school,
  ],
};
const EMPTY_ROUTE = { id: "route-c", label: "Route C 303303", color: mapTheme.routeColors[3] };

it("draws each route's markers in its own color, with the route named in the accessible name", () => {
  render(<LeafletMap routes={[ROUTE_A, ROUTE_B]} school={school} />);

  const hadi = screen.getByRole("button", { name: "Route A 101101, stop 1: Hadi Rizk" });
  const jad = screen.getByRole("button", { name: "Route B 202202, stop 1: Jad Salameh" });
  expect(hadi.getAttribute("data-html")).toContain(mapTheme.routeColors[1]);
  expect(jad.getAttribute("data-html")).toContain(mapTheme.routeColors[2]);
});

it("draws each route's own line, ending at the shared school, in the route's color", () => {
  render(<LeafletMap routes={[ROUTE_A, ROUTE_B]} school={school} />);

  const lines = screen.getAllByTestId("polyline");
  expect(lines).toHaveLength(2);
  const colors = lines.map((line) => line.getAttribute("data-color"));
  expect(colors).toEqual(expect.arrayContaining([mapTheme.routeColors[1], mapTheme.routeColors[2]]));
  for (const line of lines) {
    const positions = JSON.parse(line.getAttribute("data-positions")!);
    expect(positions[positions.length - 1]).toEqual([school.latitude, school.longitude]);
  }
});

it("draws nothing for a route with no stops", () => {
  render(<LeafletMap routes={[ROUTE_A, EMPTY_ROUTE]} school={school} />);

  expect(screen.getAllByTestId("marker-stop")).toHaveLength(1);
  expect(screen.getAllByTestId("polyline")).toHaveLength(1);
  expect(screen.queryByText("Route C 303303")).toBeInTheDocument(); // still named in the legend
});

it("shows a legend naming each route beside its color swatch", () => {
  render(<LeafletMap routes={[ROUTE_A, ROUTE_B]} school={school} />);

  const legend = screen.getByRole("list", { name: "Routes on the map" });
  const items = within(legend).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual(["Route A 101101", "Route B 202202"]);
});

it("shows no legend without routes", () => {
  render(<LeafletMap markers={markers} school={school} />);

  expect(screen.queryByRole("list", { name: "Routes on the map" })).not.toBeInTheDocument();
});

it("fits every route's points, along with the school", () => {
  render(<LeafletMap routes={[ROUTE_A, ROUTE_B]} school={school} />);

  const bounds = JSON.parse(screen.getByTestId("map").getAttribute("data-bounds")!);
  expect(bounds).toEqual(
    expect.arrayContaining([
      [33.886, 35.485],
      [33.892, 35.49],
      [33.896, 35.484],
    ]),
  );
});

it("still draws a single route's markers, line and school as before when `routes` isn't passed", () => {
  render(<LeafletMap markers={markers} school={school} path={[...stops, school]} />);

  expect(screen.getAllByTestId("marker-stop")).toHaveLength(2);
  expect(screen.getByTestId("marker-school")).toBeInTheDocument();
  expect(screen.getByTestId("polyline")).toHaveAttribute("data-color", mapTheme.line);
  expect(screen.queryByRole("list", { name: "Routes on the map" })).not.toBeInTheDocument();
  // No legend row either: the map box sits right inside the wrapper, as before.
  const box = screen.getByTestId("map").parentElement;
  expect(box?.parentElement).toHaveClass("wassel-map");
  expect(box).not.toHaveClass("min-w-0");
});

it("puts the legend in a row beside the map only when `routes` is passed", () => {
  render(
    <LeafletMap
      school={school}
      routes={[{ id: "v-1", label: "Route A 101101", color: mapTheme.routeColors[0], markers: [markers[0]] }]}
    />,
  );

  const row = screen.getByTestId("map").parentElement?.parentElement;
  expect(row).not.toHaveClass("wassel-map");
  expect(row).toContainElement(screen.getByRole("list", { name: "Routes on the map" }));
});

it("moves a stop's own marker when it changes place, leaving no stale one behind", () => {
  const { rerender } = render(<LeafletMap markers={markers} />);
  const first = screen.getByRole("button", { name: "Stop 1: Hadi Rizk" });

  // Hadi becomes stop 3 at a new spot; Jad becomes stop 1.
  const moved = [
    { ...markers[2], label: "Stop 1: Jad Salameh", number: 1 },
    { ...markers[0], label: "Stop 3: Hadi Rizk", number: 3, latitude: 33.88, longitude: 35.47 },
  ];
  rerender(<LeafletMap markers={moved} />);

  const drawn = screen.getAllByTestId("marker-stop");
  expect(drawn).toHaveLength(2);
  const hadi = screen.getByRole("button", { name: "Stop 3: Hadi Rizk" });
  expect(hadi).toBe(first); // the same marker, updated in place
  expect(hadi).toHaveAttribute("data-position", "[33.88,35.47]");
  expect(hadi.getAttribute("data-html")).toContain(">3</div>");
  expect(screen.queryByRole("button", { name: "Stop 1: Hadi Rizk" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Stop 1: Jad Salameh" }).getAttribute("data-html")).toContain(
    ">1</div>",
  );

  rerender(<LeafletMap markers={moved.slice(0, 1)} />);
  expect(screen.getAllByTestId("marker-stop")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Hadi Rizk/ })).not.toBeInTheDocument();
});
