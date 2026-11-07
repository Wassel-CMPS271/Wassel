import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MapViewProps } from "@/components/map/MapView";
import type { FleetProposal, PlannedRoute, Stop } from "@/lib/api/routes";
import { mapTheme } from "@/styles/tokens";
import { GenerationMap, routeColorsFor } from "./GenerationMap";

// GenerationMap's job is turning a FleetProposal into MapView's `routes`
// prop; MapView/LeafletMap already have their own tests for how that prop
// is drawn, so MapView is replaced here with a stand-in that just records
// what it was given.
const mapView = vi.hoisted(() => ({ props: undefined as MapViewProps | undefined }));

vi.mock("@/components/map/MapView", () => ({
  MapView: (props: MapViewProps) => {
    mapView.props = props;
    return <section aria-label={props.label} />;
  },
}));

afterEach(() => {
  cleanup();
  mapView.props = undefined;
});

const SCHOOL = { latitude: 33.896, longitude: 35.484, arrivalTime: "07:30" };

function stop(studentId: string, name: string, position: number, pin: [number, number] | null): Stop {
  const [firstName, lastName] = name.split(" ");
  return {
    studentId,
    position,
    firstName,
    lastName,
    address: null,
    latitude: pin ? pin[0] : null,
    longitude: pin ? pin[1] : null,
    arrivalTime: null,
  };
}

function plannedRoute(overrides: Partial<PlannedRoute> & { name: string; vehicleId: string }): PlannedRoute {
  const { vehicleId, ...rest } = overrides;
  return {
    existingRouteId: null,
    vehicle: { id: vehicleId, plateNumber: vehicleId, capacity: 10 },
    driver: { id: `d-${vehicleId}`, firstName: "Karim", lastName: "Haddad" },
    drivingMinutes: 10,
    stops: [],
    leaving: [],
    ...rest,
  };
}

function proposal(routes: PlannedRoute[]): FleetProposal {
  return { id: "g-1", routes, unplaced: [], excludedVehicles: [], school: SCHOOL };
}

const HADI = stop("s-1", "Hadi Rizk", 1, [33.886, 35.485]);
const JAD = stop("s-2", "Jad Salameh", 1, [33.892, 35.49]);
const LINA_NO_PIN = stop("s-3", "Lina Daher", 2, null);

it("builds one route per planned route with stops, in palette order", () => {
  const ROUTE_A = plannedRoute({ name: "Route A 101101", vehicleId: "v-1", stops: [HADI] });
  const ROUTE_B = plannedRoute({ name: "Route B 202202", vehicleId: "v-2", stops: [JAD] });
  render(<GenerationMap proposal={proposal([ROUTE_A, ROUTE_B])} />);

  const routes = mapView.props?.routes ?? [];
  expect(routes).toHaveLength(2);
  expect(routes[0]).toMatchObject({ id: "v-1", label: "Route A 101101", color: mapTheme.routeColors[0] });
  expect(routes[1]).toMatchObject({ id: "v-2", label: "Route B 202202", color: mapTheme.routeColors[1] });
});

it("names the route in each marker's accessible label", () => {
  const ROUTE = plannedRoute({ name: "Route B 101101", vehicleId: "v-2", stops: [HADI] });
  render(<GenerationMap proposal={proposal([ROUTE])} />);

  const marker = mapView.props?.routes?.[0].markers?.[0];
  expect(marker?.label).toBe("Route B 101101, stop 1: Hadi Rizk");
});

it("skips a stop with no pin", () => {
  const ROUTE = plannedRoute({ name: "Route A 101101", vehicleId: "v-1", stops: [HADI, LINA_NO_PIN] });
  render(<GenerationMap proposal={proposal([ROUTE])} />);

  const markers = mapView.props?.routes?.[0].markers ?? [];
  expect(markers).toHaveLength(1);
  expect(markers[0].label).toContain("Hadi Rizk");
  expect(markers.some((marker) => marker.label.includes("Lina Daher"))).toBe(false);
});

it("groups students at the same address into one marker, as RouteMap does", () => {
  const JAD_MANSOUR = stop("s-5", "Jad Mansour", 1, [33.9, 35.49]);
  const LEA_MANSOUR = stop("s-6", "Lea Mansour", 2, [33.9, 35.49]);
  const ROUTE = plannedRoute({ name: "Route A 101101", vehicleId: "v-1", stops: [JAD_MANSOUR, LEA_MANSOUR] });
  render(<GenerationMap proposal={proposal([ROUTE])} />);

  const markers = mapView.props?.routes?.[0].markers ?? [];
  expect(markers).toHaveLength(1);
  expect(markers[0]).toMatchObject({ number: 1, count: 1 });
  expect(markers[0].label).toBe("Route A 101101, stops 1 and 2: Jad Mansour, Lea Mansour");
});

it("ends each route's line at the shared school", () => {
  const ROUTE_A = plannedRoute({ name: "Route A 101101", vehicleId: "v-1", stops: [HADI] });
  const ROUTE_B = plannedRoute({ name: "Route B 202202", vehicleId: "v-2", stops: [JAD] });
  render(<GenerationMap proposal={proposal([ROUTE_A, ROUTE_B])} />);

  const routes = mapView.props?.routes ?? [];
  expect(routes[0].path?.[routes[0].path!.length - 1]).toMatchObject({
    latitude: SCHOOL.latitude,
    longitude: SCHOOL.longitude,
  });
  expect(routes[1].path?.[routes[1].path!.length - 1]).toMatchObject({
    latitude: SCHOOL.latitude,
    longitude: SCHOOL.longitude,
  });
});

it("draws nothing for a route with no stops: it is left out of `routes` entirely", () => {
  const WITH_STOPS = plannedRoute({ name: "Route A 101101", vehicleId: "v-1", stops: [HADI] });
  const EMPTIED = plannedRoute({ name: "Verdun run", vehicleId: "v-2", stops: [] });
  render(<GenerationMap proposal={proposal([WITH_STOPS, EMPTIED])} />);

  const routes = mapView.props?.routes ?? [];
  expect(routes).toHaveLength(1);
  expect(routes[0].label).toBe("Route A 101101");
});

it("shows the map's empty state, with no school, when no route has any students", () => {
  const EMPTIED = plannedRoute({ name: "Verdun run", vehicleId: "v-1", stops: [] });
  render(<GenerationMap proposal={proposal([EMPTIED])} />);

  expect(mapView.props?.routes).toEqual([]);
  expect(mapView.props?.school).toBeNull();
  expect(screen.getByRole("region", { name: "Map of the proposed routes" })).toBeInTheDocument();
});

describe("single-route proposal", () => {
  it("still draws one route, colored first in the palette", () => {
    const ROUTE = plannedRoute({ name: "Route A 101101", vehicleId: "v-1", stops: [HADI, JAD] });
    render(<GenerationMap proposal={proposal([ROUTE])} />);

    const routes = mapView.props?.routes ?? [];
    expect(routes).toHaveLength(1);
    expect(routes[0].color).toBe(mapTheme.routeColors[0]);
    expect(routes[0].markers).toHaveLength(2);
  });
});

describe("more routes than colors", () => {
  // Twelve routes, each with one pinned stop, for a palette of ten.
  const MANY = Array.from({ length: 12 }, (_, index) =>
    plannedRoute({
      name: `Route ${index + 1}`,
      vehicleId: `v-${index + 1}`,
      stops: [stop(`s-${index + 1}`, "Hadi Rizk", 1, [33.88 + index / 1000, 35.48])],
    }),
  );

  it("repeats the palette from the start: route 11 shares route 1's color", () => {
    render(<GenerationMap proposal={proposal(MANY)} />);

    const routes = mapView.props?.routes ?? [];
    expect(mapTheme.routeColors).toHaveLength(10);
    expect(routes).toHaveLength(12);
    expect(routes[10].color).toBe(routes[0].color);
    expect(routes[11].color).toBe(routes[1].color);
  });

  it("still tells the routes apart by name in the legend, the marker labels and the popups", () => {
    render(<GenerationMap proposal={proposal(MANY)} />);

    const routes = mapView.props?.routes ?? [];
    expect(new Set(routes.map((route) => route.label)).size).toBe(12);
    expect(routes[0].markers?.[0].label).toBe("Route 1, stop 1: Hadi Rizk");
    expect(routes[10].markers?.[0].label).toBe("Route 11, stop 1: Hadi Rizk");

    cleanup();
    render(routes[10].markers?.[0].popup as ReactElement);
    expect(screen.getByText("Route 11")).toBeInTheDocument();
  });

  it("says that colors repeat", () => {
    render(<GenerationMap proposal={proposal(MANY)} />);

    expect(
      screen.getByText(
        "The map has 12 routes and 10 colors, so some routes share a color. The legend and each stop's popup name its route.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about colors at ten routes or fewer", () => {
    render(<GenerationMap proposal={proposal(MANY.slice(0, 10))} />);

    expect(screen.queryByText(/share a color/)).not.toBeInTheDocument();
  });
});

it("names the route and each student's stop and time in a marker's popup", () => {
  const AT_HOME = { ...HADI, arrivalTime: "07:17" };
  const ROUTE = plannedRoute({ name: "Route B 101101", vehicleId: "v-2", stops: [AT_HOME] });
  render(<GenerationMap proposal={proposal([ROUTE])} />);

  const popup = mapView.props?.routes?.[0].markers?.[0].popup as ReactElement;
  cleanup();
  render(popup);
  expect(screen.getByText("Route B 101101")).toBeInTheDocument();
  expect(screen.getByText("Stop 1: Hadi Rizk, Arrives 07:17")).toBeInTheDocument();
});

it("gives an emptied route no color, so the next route keeps the palette's next one", () => {
  const ROUTE_A = plannedRoute({ name: "Route A 101101", vehicleId: "v-1", stops: [HADI] });
  const EMPTIED = plannedRoute({ name: "Verdun run", vehicleId: "v-2", stops: [] });
  const ROUTE_C = plannedRoute({ name: "Route C 303303", vehicleId: "v-3", stops: [JAD] });

  const colors = routeColorsFor(proposal([ROUTE_A, EMPTIED, ROUTE_C]));

  expect(colors.get("v-1")).toBe(mapTheme.routeColors[0]);
  expect(colors.has("v-2")).toBe(false);
  expect(colors.get("v-3")).toBe(mapTheme.routeColors[1]);
});
