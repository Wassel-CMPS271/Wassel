import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MapViewProps } from "@/components/map/MapView";
import type { Route, Stop } from "@/lib/api/routes";
import { sizing } from "@/styles/tokens";
import { RouteMap, formatArrival } from "./RouteMap";

// Leaflet needs a real browser, so MapView is replaced with plain elements
// that draw what it would: valid markers with their popups, the school, the
// line's points and the empty state. The real skip rule is used.
const mapView = vi.hoisted(() => ({ props: undefined as MapViewProps | undefined }));

vi.mock("@/components/map/MapView", async () => {
  const { isValidCoordinates } = await import("@/components/map/geo");
  return {
    MapView: (props: MapViewProps) => {
      mapView.props = props;
      const markers = (props.markers ?? []).filter(isValidCoordinates);
      const school = isValidCoordinates(props.school) ? props.school : null;
      const path = (props.path ?? []).filter(isValidCoordinates).map((p) => [p.latitude, p.longitude]);
      if (markers.length === 0 && !school && path.length === 0) {
        return <section aria-label={props.label}>{props.emptyMessage}</section>;
      }
      return (
        <section aria-label={props.label}>
          {markers.map((marker) => (
            <div key={marker.id} role="button" aria-label={marker.label} data-testid="marker">
              {marker.popup}
            </div>
          ))}
          {school && <div data-testid="school">{school.popup}</div>}
          <div data-testid="path" data-path={JSON.stringify(path)} />
        </section>
      );
    },
  };
});

afterEach(() => {
  cleanup();
  mapView.props = undefined;
});

function stop(studentId: string, name: string, position: number, pin: [number, number] | null, arrivalTime: string | null = null): Stop {
  const [firstName, lastName] = name.split(" ");
  return {
    studentId,
    position,
    firstName,
    lastName,
    address: null,
    latitude: pin ? pin[0] : null,
    longitude: pin ? pin[1] : null,
    arrivalTime,
  };
}

function route(stops: Stop[], school: Route["school"] = { latitude: 33.9, longitude: 35.48, arrivalTime: "07:30" }): Route {
  return {
    id: "r-1",
    name: "Verdun morning run",
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 5 },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    studentCount: stops.length,
    seatsLeft: 5 - stops.length,
    school,
    stops,
  };
}

const HADI = stop("s-1", "Hadi Rizk", 1, [33.886, 35.485], "07:12");
const LINA = stop("s-2", "Lina Daher", 2, null);
const JAD = stop("s-3", "Jad Salameh", 3, [33.892, 35.49], "07:21");

function map() {
  return screen.getByRole("region", { name: "Map of Verdun morning run" });
}

function stopList() {
  return screen.getByRole("heading", { name: "Stops in order" }).parentElement!.querySelector("ol")!;
}

it("numbers the pinned stops by position and joins them in order to the school", () => {
  render(<RouteMap route={route([HADI, LINA, JAD])} />);

  const markers = within(map()).getAllByTestId("marker");
  expect(markers.map((marker) => marker.getAttribute("aria-label"))).toEqual([
    "Stop 1: Hadi Rizk",
    "Stop 3: Jad Salameh",
  ]);
  expect(mapView.props?.markers?.map((marker) => marker.number)).toEqual([1, 2, 3]);
  expect(screen.getByTestId("path")).toHaveAttribute(
    "data-path",
    JSON.stringify([
      [33.886, 35.485],
      [33.892, 35.49],
      [33.9, 35.48],
    ]),
  );
  expect(screen.getByTestId("school")).toHaveTextContent("Arrival 07:30");
});

it("passes the stops to the line in position order with the school last", () => {
  render(<RouteMap route={route([HADI, JAD, LINA])} />);

  const path = mapView.props?.path ?? [];
  expect(path.slice(0, 3)).toEqual([HADI, JAD, LINA]);
  expect(path[path.length - 1]).toMatchObject({ latitude: 33.9, longitude: 35.48 });
  expect(path).toHaveLength(4);
});

it("still ends the line at the school when the last stop has no pin", () => {
  render(<RouteMap route={route([HADI, JAD, LINA])} />);

  expect(screen.getByTestId("path")).toHaveAttribute(
    "data-path",
    JSON.stringify([
      [33.886, 35.485],
      [33.892, 35.49],
      [33.9, 35.48],
    ]),
  );
});

it("keeps the map's default height, which is shorter on a phone", () => {
  render(<RouteMap route={route([HADI, JAD])} />);

  // MapView's default is mapTheme.height, a clamp() on the viewport height.
  expect(mapView.props?.height).toBeUndefined();
});

it("shows the name and arrival time in each marker's popup", () => {
  render(<RouteMap route={route([HADI, stop("s-4", "Maya Aoun", 2, [33.88, 35.5], "07:18:00")])} />);

  const hadi = within(map()).getByRole("button", { name: "Stop 1: Hadi Rizk" });
  expect(hadi).toHaveTextContent("Hadi Rizk");
  expect(hadi).toHaveTextContent("Arrives 07:12");
  // A time sent with seconds still reads HH:mm.
  expect(within(map()).getByRole("button", { name: "Stop 2: Maya Aoun" })).toHaveTextContent("Arrives 07:18");
});

it("says the arrival time isn't set yet instead of leaving it blank", () => {
  const noTimes = route([stop("s-1", "Hadi Rizk", 1, [33.886, 35.485])], {
    latitude: 33.9,
    longitude: 35.48,
    arrivalTime: null,
  });
  render(<RouteMap route={noTimes} />);

  expect(within(map()).getByRole("button", { name: "Stop 1: Hadi Rizk" })).toHaveTextContent(
    "Arrival time not set yet",
  );
  expect(screen.getByTestId("school")).toHaveTextContent("Arrival time not set yet");
  expect(within(stopList()).getAllByText("Arrival time not set yet")).toHaveLength(2);
});

it("lists the stops in order as text, with the school last, and links to it from above the map", () => {
  render(<RouteMap route={route([HADI, LINA, JAD])} />);

  const items = within(stopList()).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "1Stop 1: Hadi RizkArrives 07:12",
    "3Stop 3: Jad SalamehArrives 07:21",
    "SSchoolArrival 07:30",
  ]);
  expect(screen.getByRole("link", { name: "Skip to the stops as a list" })).toHaveAttribute(
    "href",
    "#route-stop-list",
  );
  expect(screen.getByRole("heading", { name: "Stops in order" })).toHaveAttribute("id", "route-stop-list");
});

it("gives both links a full tap target for a phone", () => {
  render(<RouteMap route={route([HADI, LINA, JAD])} />);

  for (const name of ["Skip to the stops as a list", "Add pins on the Students page"]) {
    expect(screen.getByRole("link", { name })).toHaveStyle({ minHeight: sizing.tapTarget });
  }
});

it("lists the stops with no pin under the map, with a link to the Students page", () => {
  render(<RouteMap route={route([HADI, LINA, JAD])} />);

  const heading = screen.getByRole("heading", { name: "Not on the map: no pin yet" });
  const box = heading.parentElement!;
  expect(within(box).getByText("Stop 2: Lina Daher")).toBeInTheDocument();
  expect(within(box).getByRole("link", { name: "Add pins on the Students page" })).toHaveAttribute(
    "href",
    "/head-of-transport/students",
  );
  expect(within(stopList()).queryByText(/Lina Daher/)).not.toBeInTheDocument();
});

it("has no 'not on the map' list when every stop has a pin", () => {
  render(<RouteMap route={route([HADI, JAD])} />);

  expect(screen.queryByText("Not on the map: no pin yet")).not.toBeInTheDocument();
});

it("shows the map's empty state, not the school alone, when no stop has a pin", () => {
  render(<RouteMap route={route([LINA])} />);

  expect(map()).toHaveTextContent("None of the students on this route has a pin yet");
  expect(mapView.props?.school).toBeNull();
  expect(screen.queryByTestId("school")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Stops in order" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Skip to the stops as a list" })).not.toBeInTheDocument();
  expect(screen.getByText("Stop 2: Lina Daher")).toBeInTheDocument();
});

it("says the route has no students when it has none", () => {
  render(<RouteMap route={route([])} />);

  expect(map()).toHaveTextContent("No students on this route yet.");
  expect(screen.queryByText("Not on the map: no pin yet")).not.toBeInTheDocument();
});

it("leaves out the school and the end of the line when the school has no coordinates", () => {
  render(<RouteMap route={route([HADI, JAD], { latitude: null, longitude: null, arrivalTime: "07:30" })} />);

  expect(screen.queryByTestId("school")).not.toBeInTheDocument();
  expect(screen.getByTestId("path")).toHaveAttribute(
    "data-path",
    JSON.stringify([
      [33.886, 35.485],
      [33.892, 35.49],
    ]),
  );
  expect(within(stopList()).queryByText("School")).not.toBeInTheDocument();
  expect(screen.getByText(/The school's location isn't set/)).toBeInTheDocument();
});

it("redraws from a new route, leaving nothing behind for a stop that moved or left", () => {
  const { rerender } = render(<RouteMap route={route([HADI, LINA, JAD])} />);

  // Jad moves to first; Hadi leaves; Lina gets a pin.
  const updated = route([
    { ...JAD, position: 1, arrivalTime: "07:10" },
    { ...LINA, position: 2, latitude: 33.88, longitude: 35.5, arrivalTime: "07:20" },
  ]);
  rerender(<RouteMap route={updated} />);

  expect(within(map()).getAllByTestId("marker").map((marker) => marker.getAttribute("aria-label"))).toEqual([
    "Stop 1: Jad Salameh",
    "Stop 2: Lina Daher",
  ]);
  expect(screen.queryByText(/Hadi Rizk/)).not.toBeInTheDocument();
  expect(screen.queryByText("Not on the map: no pin yet")).not.toBeInTheDocument();
});

it("formats arrival times as HH:mm", () => {
  expect(formatArrival("07:05")).toBe("07:05");
  expect(formatArrival("07:05:00")).toBe("07:05");
  expect(formatArrival(null)).toBe("Arrival time not set yet");
});

// Siblings at one address: same pin, so they'd otherwise draw two markers
// exactly on top of each other.
const JAD_MANSOUR = stop("s-5", "Jad Mansour", 1, [33.9, 35.49], "07:05");
const LEA_MANSOUR = stop("s-6", "Lea Mansour", 2, [33.9, 35.49], "07:08");

it("merges stops that share one spot into a single marker naming them all", () => {
  render(<RouteMap route={route([JAD_MANSOUR, LEA_MANSOUR])} />);

  const markers = within(map()).getAllByTestId("marker");
  expect(markers).toHaveLength(1);
  expect(markers[0]).toHaveAttribute("aria-label", "Stops 1 and 2: Jad Mansour, Lea Mansour");
  expect(markers[0]).toHaveTextContent("Stop 1: Jad Mansour");
  expect(markers[0]).toHaveTextContent("Arrives 07:05");
  expect(markers[0]).toHaveTextContent("Stop 2: Lea Mansour");
  expect(markers[0]).toHaveTextContent("Arrives 07:08");
  expect(mapView.props?.markers?.[0]).toMatchObject({ number: 1, count: 1 });
});

it("keeps separate markers for stops at different spots", () => {
  render(<RouteMap route={route([HADI, JAD])} />);

  const markers = within(map()).getAllByTestId("marker");
  expect(markers).toHaveLength(2);
  expect(markers.map((marker) => marker.getAttribute("aria-label"))).toEqual([
    "Stop 1: Hadi Rizk",
    "Stop 3: Jad Salameh",
  ]);
  expect(mapView.props?.markers?.every((marker) => marker.count === undefined)).toBe(true);
});

it("falls back to a normal single marker once one of a pair is removed", () => {
  const { rerender } = render(<RouteMap route={route([JAD_MANSOUR, LEA_MANSOUR])} />);
  expect(within(map()).getAllByTestId("marker")).toHaveLength(1);

  rerender(<RouteMap route={route([JAD_MANSOUR])} />);

  const markers = within(map()).getAllByTestId("marker");
  expect(markers).toHaveLength(1);
  expect(markers[0]).toHaveAttribute("aria-label", "Stop 1: Jad Mansour");
  expect(mapView.props?.markers?.[0].count).toBeUndefined();
});

it("keeps the line's stop order unchanged when markers are grouped", () => {
  render(<RouteMap route={route([JAD_MANSOUR, LEA_MANSOUR, JAD])} />);

  const path = mapView.props?.path ?? [];
  expect(path.slice(0, 3)).toEqual([JAD_MANSOUR, LEA_MANSOUR, JAD]);
  expect(path[3]).toMatchObject({ latitude: 33.9, longitude: 35.48 });
  expect(path).toHaveLength(4);
  expect(screen.getByTestId("path")).toHaveAttribute(
    "data-path",
    JSON.stringify([
      [33.9, 35.49],
      [33.9, 35.49],
      [33.892, 35.49],
      [33.9, 35.48],
    ]),
  );
});

// SCRUM-221: while a proposal is open the map can show either order.
describe("order switch", () => {
  const PROPOSED = [{ ...JAD, position: 1, arrivalTime: "07:08" }, { ...HADI, position: 2, arrivalTime: "07:18" }];
  const twoStops = route([HADI, JAD]);

  it("isn't shown without a comparison", () => {
    render(<RouteMap route={twoStops} />);

    expect(screen.queryByRole("group", { name: "Map shows" })).not.toBeInTheDocument();
  });

  it("draws the proposed order's markers, line and list when it is chosen", () => {
    render(<RouteMap route={twoStops} comparison={{ proposedStops: PROPOSED, view: "proposed", onViewChange: vi.fn() }} />);

    expect(within(screen.getByRole("group", { name: "Map shows" })).getByRole("radio", { name: "Proposed order" })).toBeChecked();
    expect(within(map()).getAllByTestId("marker").map((marker) => marker.getAttribute("aria-label"))).toEqual([
      "Stop 1: Jad Salameh",
      "Stop 2: Hadi Rizk",
    ]);
    expect(screen.getByTestId("path")).toHaveAttribute(
      "data-path",
      JSON.stringify([
        [33.892, 35.49],
        [33.886, 35.485],
        [33.9, 35.48],
      ]),
    );
    const list = screen.getByRole("heading", { name: "Stops in proposed order" }).parentElement!.querySelector("ol")!;
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Stop 1: Jad Salameh");
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Arrives 07:08");
  });

  it("draws the route's own order when Current order is chosen, and reports a change", () => {
    const onViewChange = vi.fn();
    render(<RouteMap route={twoStops} comparison={{ proposedStops: PROPOSED, view: "current", onViewChange }} />);

    expect(within(map()).getAllByTestId("marker").map((marker) => marker.getAttribute("aria-label"))).toEqual([
      "Stop 1: Hadi Rizk",
      "Stop 3: Jad Salameh",
    ]);
    expect(screen.getByRole("heading", { name: "Stops in current order" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Proposed order" }));
    expect(onViewChange).toHaveBeenCalledWith("proposed");
  });
});
