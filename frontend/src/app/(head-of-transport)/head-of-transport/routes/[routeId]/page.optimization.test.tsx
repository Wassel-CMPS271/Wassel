// The route page's optimization flow (SCRUM-221): propose, compare, apply or
// discard, and what happens when the proposal is stale or can't be made.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DndContextProps, DragEndEvent } from "@dnd-kit/core";
import { ApiError } from "@/lib/api/errors";
import {
  addStudentToRoute,
  applyProposal,
  discardProposal,
  getRoute,
  listUnassignedStudents,
  proposeOptimization,
  removeStudentFromRoute,
  reorderStops,
  type Proposal,
  type Route,
  type Stop,
} from "@/lib/api/routes";
import type { Student } from "@/lib/api/students";
import type { StudentDragData } from "./studentDnd";
import RouteDetailPage from "./page";

const dnd = vi.hoisted(() => ({ props: undefined as DndContextProps | undefined }));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  function CapturingDndContext(props: DndContextProps) {
    dnd.props = props;
    return <actual.DndContext {...props} />;
  }
  return { ...actual, DndContext: CapturingDndContext };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ routeId: "r-1" }),
}));

vi.mock("@/lib/api/routes", () => ({
  getRoute: vi.fn(),
  listUnassignedStudents: vi.fn(),
  addStudentToRoute: vi.fn(),
  removeStudentFromRoute: vi.fn(),
  reorderStops: vi.fn(),
  proposeOptimization: vi.fn(),
  applyProposal: vi.fn(),
  discardProposal: vi.fn(),
}));

// Leaflet needs a real browser; the stand-in draws the markers in order and
// the line's points, so a test can see which order the map shows.
vi.mock("@/components/map/MapView", () => ({
  MapView: ({
    label,
    markers = [],
    path = [],
  }: {
    label: string;
    markers?: { id: string; label: string; latitude: number | null }[];
    path?: { latitude: number | null; longitude: number | null }[];
  }) => (
    <section aria-label={label}>
      {markers
        .filter((marker) => marker.latitude !== null)
        .map((marker) => (
          <span key={marker.id} role="img" aria-label={marker.label} />
        ))}
      <span data-testid="map-path" data-path={JSON.stringify(path.map((p) => [p.latitude, p.longitude]))} />
    </section>
  ),
}));

vi.mock("@/lib/api/students", () => ({
  getStudents: vi.fn(),
}));

function stop(studentId: string, name: string, position: number, arrivalTime: string): Stop {
  const [firstName, lastName] = name.split(" ");
  const n = Number(studentId.replace(/\D/g, ""));
  return {
    studentId,
    position,
    firstName,
    lastName,
    address: null,
    latitude: 33.89 + n * 0.001,
    longitude: 35.5 + n * 0.001,
    arrivalTime,
  };
}

function route(stops: Stop[], capacity = 4): Route {
  return {
    id: "r-1",
    name: "Hamra morning run",
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    studentCount: stops.length,
    seatsLeft: capacity - stops.length,
    school: { latitude: 33.9, longitude: 35.48, arrivalTime: "07:30" },
    stops,
  };
}

const LINA = stop("s-1", "Lina Saad", 1, "07:00");
const MAYA = stop("s-2", "Maya Haddad", 2, "07:10");
const HADI = stop("s-3", "Hadi Aoun", 3, "07:20");
const CURRENT = [LINA, MAYA, HADI];
// The proposal reverses the order, with new positions and times.
const PROPOSED = [
  stop("s-3", "Hadi Aoun", 1, "07:09"),
  stop("s-2", "Maya Haddad", 2, "07:15"),
  stop("s-1", "Lina Saad", 3, "07:22"),
];

function feasible(currentMinutes = 22, proposedMinutes = 13): Proposal {
  return {
    id: "p-1",
    feasible: true,
    current: { drivingMinutes: currentMinutes, stops: CURRENT },
    proposed: { drivingMinutes: proposedMinutes, stops: PROPOSED },
    reasons: [],
  };
}

function infeasible(reasons: Proposal["reasons"]): Proposal {
  return { id: null, feasible: false, current: { drivingMinutes: 22, stops: CURRENT }, proposed: null, reasons };
}

const OMAR: Student = {
  id: "s-4",
  firstName: "Omar",
  lastName: "Nasser",
  grade: "5",
  guardianName: "",
  guardianPhone: "",
  status: "active",
  address: null,
  latitude: 33.89,
  longitude: 35.5,
  route: null,
  parentUserId: null,
  createdAt: "",
};

async function renderPage() {
  render(<RouteDetailPage />);
  await screen.findByRole("heading", { name: "Hamra morning run" });
}

function optimizeButton() {
  return screen.getByRole("button", { name: /^Optimiz/ });
}

async function openProposal() {
  fireEvent.click(optimizeButton());
  return screen.findByRole("region", { name: /Optimization proposal|can't be optimized/ });
}

function panel() {
  return screen.queryByRole("region", { name: /Optimization proposal|can't be optimized/ });
}

function routeList() {
  return within(screen.getByRole("region", { name: "On this route" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

function mapMarkers() {
  return within(screen.getByRole("region", { name: "Map of Hamra morning run" }))
    .queryAllByRole("img")
    .map((marker) => marker.getAttribute("aria-label"));
}

function column(name: "Current order" | "Proposed order") {
  return screen.getByRole("region", { name });
}

beforeEach(() => {
  dnd.props = undefined;
  vi.mocked(getRoute).mockReset().mockResolvedValue(route(CURRENT));
  vi.mocked(listUnassignedStudents).mockReset().mockResolvedValue([OMAR]);
  vi.mocked(addStudentToRoute).mockReset();
  vi.mocked(removeStudentFromRoute).mockReset();
  vi.mocked(reorderStops).mockReset();
  vi.mocked(proposeOptimization).mockReset().mockResolvedValue(feasible());
  vi.mocked(applyProposal).mockReset();
  vi.mocked(discardProposal).mockReset();
});

afterEach(() => {
  cleanup();
});

it("disables Optimize on a route with no stops, and says why", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([]));
  await renderPage();

  expect(optimizeButton()).toBeDisabled();
  expect(optimizeButton()).toHaveAccessibleDescription("Add a student to the route before optimizing.");
});

it("shows the proposal without changing the route", async () => {
  await renderPage();
  const before = routeList();

  await openProposal();

  expect(proposeOptimization).toHaveBeenCalledWith("r-1");
  expect(applyProposal).not.toHaveBeenCalled();
  expect(getRoute).toHaveBeenCalledTimes(1);
  expect(routeList()).toEqual(before);
  expect(screen.getByText("3 of 4 seats")).toBeInTheDocument();
  expect(screen.getByText(/Proposal ready: Saves 9 min/)).toBeInTheDocument();
});

it("shows both orders with numbers, names, arrival times and totals, and the difference", async () => {
  await renderPage();
  await openProposal();

  const current = within(column("Current order")).getAllByRole("listitem").map((item) => item.textContent);
  const proposed = within(column("Proposed order")).getAllByRole("listitem").map((item) => item.textContent);
  expect(current).toEqual([
    "1Stop 1: Lina SaadArrives 07:00",
    "2Stop 2: Maya HaddadArrives 07:10",
    "3Stop 3: Hadi AounArrives 07:20",
  ]);
  expect(proposed).toEqual([
    "1Stop 1: Hadi AounArrives 07:09",
    "2Stop 2: Maya HaddadArrives 07:15",
    "3Stop 3: Lina SaadArrives 07:22",
  ]);
  expect(within(column("Current order")).getByText("Total driving time: 22 min")).toBeInTheDocument();
  expect(within(column("Proposed order")).getByText("Total driving time: 13 min")).toBeInTheDocument();
  expect(within(panel()!).getByText("Saves 9 min")).toBeInTheDocument();
});

it.each([
  [20, 24, "4 min longer"],
  [15, 15, "No change"],
])("shows %i → %i min as %s", async (current, proposed, text) => {
  vi.mocked(proposeOptimization).mockResolvedValue(feasible(current, proposed));
  await renderPage();
  await openProposal();

  expect(within(panel()!).getByText(text)).toBeInTheDocument();
});

it("shows the proposed order on the map by default, and switches with the radio group", async () => {
  await renderPage();
  expect(mapMarkers()).toEqual(["Stop 1: Lina Saad", "Stop 2: Maya Haddad", "Stop 3: Hadi Aoun"]);

  await openProposal();

  const group = screen.getByRole("group", { name: "Map shows" });
  expect(within(group).getByRole("radio", { name: "Proposed order" })).toBeChecked();
  expect(mapMarkers()).toEqual(["Stop 1: Hadi Aoun", "Stop 2: Maya Haddad", "Stop 3: Lina Saad"]);

  fireEvent.click(within(group).getByRole("radio", { name: "Current order" }));
  expect(mapMarkers()).toEqual(["Stop 1: Lina Saad", "Stop 2: Maya Haddad", "Stop 3: Hadi Aoun"]);
  expect(screen.getByRole("heading", { name: "Stops in current order" })).toBeInTheDocument();
});

it("focuses the panel heading when it opens", async () => {
  await renderPage();
  await openProposal();

  await waitFor(() => expect(screen.getByRole("heading", { name: "Optimization proposal" })).toHaveFocus());
});

it("applies the proposal: the route, lists, counter and map follow the answer", async () => {
  vi.mocked(applyProposal).mockResolvedValue(route(PROPOSED));
  await renderPage();
  await openProposal();

  fireEvent.click(screen.getByRole("button", { name: "Apply" }));

  await waitFor(() => expect(panel()).not.toBeInTheDocument());
  expect(applyProposal).toHaveBeenCalledWith("r-1", "p-1");
  expect(routeList().map((text) => text?.includes("Hadi Aoun"))[0]).toBe(true);
  expect(mapMarkers()).toEqual(["Stop 1: Hadi Aoun", "Stop 2: Maya Haddad", "Stop 3: Lina Saad"]);
  expect(screen.queryByRole("group", { name: "Map shows" })).not.toBeInTheDocument();
  expect(screen.getByText("3 of 4 seats")).toBeInTheDocument();
  expect(screen.getByText("New order applied. Saves 9 min.")).toBeInTheDocument();
  await waitFor(() => expect(optimizeButton()).toHaveFocus());
  expect(getRoute).toHaveBeenCalledTimes(1);
});

it("discards the proposal and leaves the route as it was", async () => {
  vi.mocked(discardProposal).mockResolvedValue(undefined);
  await renderPage();
  await openProposal();

  fireEvent.click(screen.getByRole("button", { name: "Discard" }));

  await waitFor(() => expect(panel()).not.toBeInTheDocument());
  expect(discardProposal).toHaveBeenCalledWith("r-1", "p-1");
  expect(applyProposal).not.toHaveBeenCalled();
  expect(mapMarkers()).toEqual(["Stop 1: Lina Saad", "Stop 2: Maya Haddad", "Stop 3: Hadi Aoun"]);
  expect(screen.getByText("Proposal discarded. The route is unchanged.")).toBeInTheDocument();
  await waitFor(() => expect(optimizeButton()).toHaveFocus());
});

it("closes a feasible proposal on Escape without discarding or applying", async () => {
  await renderPage();
  await openProposal();

  fireEvent.keyDown(screen.getByRole("button", { name: "Apply" }), { key: "Escape" });

  expect(panel()).not.toBeInTheDocument();
  expect(discardProposal).not.toHaveBeenCalled();
  expect(applyProposal).not.toHaveBeenCalled();
  await waitFor(() => expect(optimizeButton()).toHaveFocus());
});

it.each([
  ["Apply", 404],
  ["Apply", 409],
  ["Discard", 404],
  ["Discard", 409],
] as const)("treats a %s answered with %i as a stale proposal and reloads the route", async (button, status) => {
  const error = new ApiError(status, "Gone.");
  vi.mocked(applyProposal).mockRejectedValue(error);
  vi.mocked(discardProposal).mockRejectedValue(error);
  await renderPage();
  await openProposal();
  // Someone else changed the route meanwhile; the reload shows it.
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA]));

  fireEvent.click(screen.getByRole("button", { name: button }));

  expect(await screen.findByRole("alert")).toHaveTextContent("This proposal is out of date. Optimize again.");
  expect(panel()).not.toBeInTheDocument();
  expect(await screen.findByText("2 of 4 seats")).toBeInTheDocument();
  expect(getRoute).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(optimizeButton()).toHaveFocus());
});

it("keeps the panel open with an alert when Apply fails for another reason", async () => {
  vi.mocked(applyProposal).mockRejectedValue(new TypeError("Failed to fetch"));
  await renderPage();
  await openProposal();

  fireEvent.click(screen.getByRole("button", { name: "Apply" }));

  const alert = await within(panel()!).findByRole("alert");
  expect(alert).toHaveTextContent("Something went wrong. Please try again.");
  // Apply was disabled during the request, so focus goes to the alert, not <body>.
  await waitFor(() => expect(alert).toHaveFocus());
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled());
  expect(getRoute).toHaveBeenCalledTimes(1);
});

it("keeps the panel open with a focused alert when Discard fails for another reason", async () => {
  vi.mocked(discardProposal).mockRejectedValue(new ApiError(500));
  await renderPage();
  await openProposal();

  fireEvent.click(screen.getByRole("button", { name: "Discard" }));

  const alert = await within(panel()!).findByRole("alert");
  expect(alert).toHaveTextContent("Something went wrong. Please try again.");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
});

it("shows the not-found state when a stale apply finds the route deleted", async () => {
  vi.mocked(applyProposal).mockRejectedValue(new ApiError(404, "Gone."));
  await renderPage();
  await openProposal();
  vi.mocked(getRoute).mockRejectedValue(new ApiError(404, "Route not found."));

  fireEvent.click(screen.getByRole("button", { name: "Apply" }));

  const heading = await screen.findByRole("heading", { name: "Route not found" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(panel()).not.toBeInTheDocument();
});

it("shows the backend's 409 when another optimize for the route is running, and lets it be asked again", async () => {
  const detail = "This route is already being optimized. Try again in a moment.";
  vi.mocked(proposeOptimization).mockRejectedValueOnce(new ApiError(409, detail));
  await renderPage();

  fireEvent.click(optimizeButton());

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(detail);
  await waitFor(() => expect(alert).toHaveFocus());
  await waitFor(() => expect(optimizeButton()).toBeEnabled());
  await openProposal();
  expect(screen.queryByText(detail)).not.toBeInTheDocument();
});

it("says something went wrong when Optimize fails without a message", async () => {
  vi.mocked(proposeOptimization).mockRejectedValue(new TypeError("Failed to fetch"));
  await renderPage();

  fireEvent.click(optimizeButton());

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Something went wrong. Please try again.");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(panel()).not.toBeInTheDocument();
});

it("closes an infeasible answer on Escape without sending anything", async () => {
  vi.mocked(proposeOptimization).mockResolvedValue(
    infeasible([{ code: "CAPACITY_EXCEEDED", message: "The route has 4 students but the vehicle seats 3." }]),
  );
  await renderPage();
  await openProposal();

  fireEvent.keyDown(screen.getByRole("heading", { name: "This route can't be optimized" }), { key: "Escape" });

  expect(panel()).not.toBeInTheDocument();
  expect(discardProposal).not.toHaveBeenCalled();
  await waitFor(() => expect(optimizeButton()).toHaveFocus());
});

it("ignores Escape while Apply is in flight", async () => {
  let resolveApply: (value: Route) => void = () => {};
  vi.mocked(applyProposal).mockReturnValue(new Promise((resolve) => (resolveApply = resolve)));
  await renderPage();
  await openProposal();

  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  fireEvent.keyDown(screen.getByRole("heading", { name: "Optimization proposal" }), { key: "Escape" });

  expect(discardProposal).not.toHaveBeenCalled();
  expect(panel()).toBeInTheDocument();
  await act(async () => resolveApply(route(PROPOSED)));
  expect(panel()).not.toBeInTheDocument();
});

it("leaves Escape outside the panel alone", async () => {
  await renderPage();
  await openProposal();

  fireEvent.keyDown(screen.getByRole("radio", { name: "Current order" }), { key: "Escape" });

  expect(panel()).toBeInTheDocument();
  expect(discardProposal).not.toHaveBeenCalled();
});

it("keeps the panel in the page's Tab order, not a focus trap", async () => {
  await renderPage();
  const region = await openProposal();

  // An inline region, not a modal dialog, so Tab moves on to the map and the lists.
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(region).not.toHaveAttribute("aria-modal");
  // The heading takes focus from script only; Tab inside the panel goes Apply, then Discard.
  expect(within(region).getByRole("heading", { name: "Optimization proposal" })).toHaveAttribute("tabindex", "-1");
  expect(within(region).getAllByRole("button").map((button) => button.textContent)).toEqual(["Apply", "Discard"]);
  // The panel comes right after Optimize in the page, so Tab moves forward into it.
  expect(optimizeButton().compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("stacks the two orders on a phone and puts them side by side from sm up", async () => {
  await renderPage();
  await openProposal();

  const grid = column("Current order").parentElement!;
  expect(grid).toBe(column("Proposed order").parentElement);
  expect(grid).toHaveClass("grid", "grid-cols-1", "sm:grid-cols-2");
  // The buttons wrap instead of overflowing a narrow screen.
  expect(screen.getByRole("button", { name: "Apply" }).parentElement).toHaveClass("flex-wrap");
});

it("explains why a proposal isn't feasible, and offers no Apply", async () => {
  vi.mocked(proposeOptimization).mockResolvedValue(
    infeasible([
      { code: "CAPACITY_EXCEEDED", message: "The route has 4 students but the vehicle seats 3." },
      { code: "ARRIVAL_TIME_UNREACHABLE", message: "The first pickup would be at 05:40." },
      { code: "SOMETHING_NEW", message: "A reason this screen doesn't know yet." },
    ]),
  );
  await renderPage();
  const region = await openProposal();

  expect(within(region).getByRole("heading", { name: "This route can't be optimized" })).toBeInTheDocument();
  expect(within(region).getByText(/^Over capacity: more students are on this route/)).toBeInTheDocument();
  expect(within(region).getByText("The route has 4 students but the vehicle seats 3.")).toBeInTheDocument();
  expect(within(region).getByText(/first pickup before 06:00/)).toBeInTheDocument();
  expect(within(region).getByText(/school arrival time can't be reached/)).toBeInTheDocument();
  expect(within(region).getByText("A reason this screen doesn't know yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Map shows" })).not.toBeInTheDocument();

  fireEvent.click(within(region).getByRole("button", { name: "Close" }));

  expect(panel()).not.toBeInTheDocument();
  expect(discardProposal).not.toHaveBeenCalled();
  await waitFor(() => expect(optimizeButton()).toHaveFocus());
});

it("shows the backend's 409 when the school arrival time isn't set", async () => {
  const detail = "The school's arrival time isn't set yet. An admin sets it in the school settings.";
  vi.mocked(proposeOptimization).mockRejectedValue(new ApiError(409, detail));
  await renderPage();

  fireEvent.click(optimizeButton());

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(detail);
  await waitFor(() => expect(alert).toHaveFocus());
  expect(panel()).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Add pins on the Students page" })).not.toBeInTheDocument();
});

it("shows the backend's 409 when the route has no stops anymore", async () => {
  vi.mocked(proposeOptimization).mockRejectedValue(new ApiError(409, "This route has no stops to optimize."));
  await renderPage();

  fireEvent.click(optimizeButton());

  expect(await screen.findByRole("alert")).toHaveTextContent("This route has no stops to optimize.");
});

it("names the students without a pin from the 409 and links to the Students page", async () => {
  vi.mocked(proposeOptimization).mockRejectedValue(
    new ApiError(409, "2 students have no pin yet.", ["s-1", "s-3"]),
  );
  await renderPage();

  fireEvent.click(optimizeButton());

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("2 students have no pin yet.");
  expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Lina Saad",
    "Hadi Aoun",
  ]);
  expect(within(alert).getByRole("link", { name: "Add pins on the Students page" })).toHaveAttribute(
    "href",
    "/head-of-transport/students",
  );
});

it("closes the proposal when a student is added", async () => {
  vi.mocked(addStudentToRoute).mockResolvedValue(route([...CURRENT, stop("s-4", "Omar Nasser", 4, "07:25")]));
  await renderPage();
  await openProposal();

  const omar = within(screen.getByRole("region", { name: "Not on a route" })).getByText("Omar Nasser").closest("li")!;
  fireEvent.click(within(omar).getByRole("button", { name: "Add" }));

  expect(panel()).not.toBeInTheDocument();
  expect(await screen.findByText("4 of 4 seats")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Map shows" })).not.toBeInTheDocument();
  expect(
    screen.getByText(
      "Omar Nasser added to the route. 4 of 4 seats filled. The optimization proposal was closed because the stops changed. Optimize again for a new one.",
    ),
  ).toBeInTheDocument();
  expect(optimizeButton()).toBeEnabled();
});

it("closes the proposal when a student is removed", async () => {
  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([MAYA, HADI]));
  await renderPage();
  await openProposal();

  const lina = within(screen.getByRole("region", { name: "On this route" })).getByText("Lina Saad").closest("li")!;
  fireEvent.click(within(lina).getByRole("button", { name: "Remove" }));

  expect(panel()).not.toBeInTheDocument();
  expect(await screen.findByText("2 of 4 seats")).toBeInTheDocument();
});

it("closes the proposal when a student is dropped on the other list", async () => {
  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([MAYA, HADI]));
  await renderPage();
  await openProposal();

  const data: StudentDragData = { from: "on-route", name: "Lina Saad", stop: LINA };
  act(() => {
    dnd.props?.onDragEnd?.({
      active: { id: "student-s-1", data: { current: data } },
      over: { id: "unassigned" },
    } as unknown as DragEndEvent);
  });

  expect(panel()).not.toBeInTheDocument();
  expect(removeStudentFromRoute).toHaveBeenCalledWith("r-1", "s-1");
  expect(await screen.findByText("2 of 4 seats")).toBeInTheDocument();
});

it("closes the proposal when a stop is reordered with the Move down button", async () => {
  vi.mocked(reorderStops).mockResolvedValue(
    route([MAYA, LINA, HADI].map((s, i) => ({ ...s, position: i + 1 }))),
  );
  await renderPage();
  await openProposal();

  const lina = within(screen.getByRole("region", { name: "On this route" })).getByText("Lina Saad").closest("li")!;
  fireEvent.click(within(lina).getByRole("button", { name: "Move Lina Saad down" }));

  expect(panel()).not.toBeInTheDocument();
  await waitFor(() => expect(reorderStops).toHaveBeenCalledWith("r-1", ["s-2", "s-1", "s-3"]));
  expect(
    await screen.findByText(
      "Lina Saad moved to stop 2 of 3. The optimization proposal was closed because the stops changed. Optimize again for a new one.",
    ),
  ).toBeInTheDocument();
});

it("closes the proposal when a stop is dragged onto another", async () => {
  vi.mocked(reorderStops).mockResolvedValue(
    route([MAYA, LINA, HADI].map((s, i) => ({ ...s, position: i + 1 }))),
  );
  await renderPage();
  await openProposal();

  const data: StudentDragData = { from: "on-route", name: "Lina Saad", stop: LINA };
  act(() => {
    dnd.props?.onDragEnd?.({
      active: { id: "student-s-1", data: { current: data } },
      over: { id: "student-s-2" },
    } as unknown as DragEndEvent);
  });

  expect(panel()).not.toBeInTheDocument();
  expect(reorderStops).toHaveBeenCalledWith("r-1", ["s-2", "s-1", "s-3"]);
  expect(await screen.findByText(/^Lina Saad moved to stop 2 of 3\. The optimization proposal was closed/)).toBeInTheDocument();
});

it("says the proposal was closed even when the change that closed it fails", async () => {
  vi.mocked(removeStudentFromRoute).mockRejectedValue(new ApiError(500));
  await renderPage();
  await openProposal();

  const lina = within(screen.getByRole("region", { name: "On this route" })).getByText("Lina Saad").closest("li")!;
  fireEvent.click(within(lina).getByRole("button", { name: "Remove" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  expect(panel()).not.toBeInTheDocument();
  expect(
    screen.getByText("The optimization proposal was closed because the stops changed. Optimize again for a new one."),
  ).toBeInTheDocument();
});

it("sends one propose for a double click, and disables the page's controls meanwhile", async () => {
  let resolvePropose: (value: Proposal) => void = () => {};
  vi.mocked(proposeOptimization).mockReturnValue(new Promise((resolve) => (resolvePropose = resolve)));
  await renderPage();

  act(() => {
    fireEvent.click(optimizeButton());
    fireEvent.click(optimizeButton());
  });

  expect(proposeOptimization).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Optimizing…" })).toBeDisabled();
  const lina = within(screen.getByRole("region", { name: "On this route" })).getByText("Lina Saad").closest("li")!;
  expect(within(lina).getByRole("button", { name: "Remove" })).toBeDisabled();

  await act(async () => resolvePropose(feasible()));
  expect(panel()).toBeInTheDocument();
});

it("sends one apply for a double click, and disables Apply and Discard meanwhile", async () => {
  let resolveApply: (value: Route) => void = () => {};
  vi.mocked(applyProposal).mockReturnValue(new Promise((resolve) => (resolveApply = resolve)));
  await renderPage();
  await openProposal();
  const apply = screen.getByRole("button", { name: "Apply" });

  act(() => {
    fireEvent.click(apply);
    fireEvent.click(apply);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  });

  expect(applyProposal).toHaveBeenCalledTimes(1);
  expect(discardProposal).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();

  await act(async () => resolveApply(route(PROPOSED)));
  expect(panel()).not.toBeInTheDocument();
});

it("keeps Optimize disabled while a proposal is open", async () => {
  await renderPage();
  await openProposal();

  expect(optimizeButton()).toBeDisabled();
});

it("has no duplicate ids with the proposal open", async () => {
  await renderPage();
  await openProposal();

  const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
});
