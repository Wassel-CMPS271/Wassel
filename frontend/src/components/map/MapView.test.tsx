import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MapView } from "./MapView";

// The real map is loaded with next/dynamic; stand in a marker so these tests
// only cover what MapView decides before Leaflet loads.
vi.mock("next/dynamic", () => ({
  default: () =>
    function LeafletMapStub() {
      return <div data-testid="leaflet-map" />;
    },
}));

afterEach(() => {
  cleanup();
});

const school = { latitude: 33.896, longitude: 35.484, arrivalTime: "07:30" };

it("labels the map region", () => {
  render(<MapView label="Route map" school={school} />);

  expect(screen.getByRole("region", { name: "Route map" })).toBeInTheDocument();
  expect(screen.getByTestId("leaflet-map")).toBeInTheDocument();
});

it("shows the empty state when there is nothing to show", () => {
  render(<MapView label="Route map" />);

  expect(screen.getByRole("region", { name: "Route map" })).toHaveTextContent(
    "No locations to show yet.",
  );
  expect(screen.queryByTestId("leaflet-map")).not.toBeInTheDocument();
});

it("shows the empty state when no stop has a pin", () => {
  render(
    <MapView
      label="Route map"
      emptyMessage="None of these students has a pin yet."
      markers={[{ id: "s-1", label: "Stop 1: Lina Daher", number: 1, latitude: null, longitude: null }]}
      path={[{ latitude: null, longitude: null }]}
      school={null}
    />,
  );

  expect(screen.getByText("None of these students has a pin yet.")).toBeInTheDocument();
  expect(screen.queryByTestId("leaflet-map")).not.toBeInTheDocument();
});

it("shows the map for a single pinned stop", () => {
  render(
    <MapView
      label="Route map"
      markers={[{ id: "s-1", label: "Stop 1: Hadi Rizk", latitude: 33.886, longitude: 35.485 }]}
    />,
  );

  expect(screen.getByTestId("leaflet-map")).toBeInTheDocument();
});

it("shows the map in pin mode with only a center, so a first pin can be placed", () => {
  render(
    <MapView
      label="Home location"
      center={{ latitude: 33.896, longitude: 35.484 }}
      pin={null}
      onPinChange={() => {}}
    />,
  );

  expect(screen.getByTestId("leaflet-map")).toBeInTheDocument();
});

it("ignores a pin when not in pin mode", () => {
  render(<MapView label="Route map" pin={{ latitude: 33.896, longitude: 35.484 }} />);

  expect(screen.queryByTestId("leaflet-map")).not.toBeInTheDocument();
});

it("treats a school without coordinates as nothing to show", () => {
  render(<MapView label="Route map" school={{ latitude: null, longitude: null }} />);

  expect(screen.getByText("No locations to show yet.")).toBeInTheDocument();
  expect(screen.queryByTestId("leaflet-map")).not.toBeInTheDocument();
});

it("shows the map when a route has pinned markers", () => {
  render(
    <MapView
      label="Proposal map"
      routes={[
        {
          id: "r-1",
          label: "Route A",
          color: "#b91c1c",
          markers: [{ id: "s-1", label: "Route A, stop 1: Hadi Rizk", latitude: 33.886, longitude: 35.485 }],
        },
      ]}
    />,
  );

  expect(screen.getByTestId("leaflet-map")).toBeInTheDocument();
});

it("shows the empty state when every route has no stops", () => {
  render(
    <MapView
      label="Proposal map"
      routes={[{ id: "r-1", label: "Route A", color: "#b91c1c", markers: [], path: [] }]}
    />,
  );

  expect(screen.getByText("No locations to show yet.")).toBeInTheDocument();
  expect(screen.queryByTestId("leaflet-map")).not.toBeInTheDocument();
});

it("shows the map from a route's own line even without markers", () => {
  render(
    <MapView
      label="Proposal map"
      routes={[
        {
          id: "r-1",
          label: "Route A",
          color: "#b91c1c",
          path: [{ latitude: 33.886, longitude: 35.485 }, { latitude: 33.896, longitude: 35.484 }],
        },
      ]}
    />,
  );

  expect(screen.getByTestId("leaflet-map")).toBeInTheDocument();
});
