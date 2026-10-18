import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DndContextProps, DragEndEvent } from "@dnd-kit/core";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import {
  addStudentToRoute,
  getRoute,
  listUnassignedStudents,
  removeStudentFromRoute,
  reorderStops,
  type Route,
  type Stop,
} from "@/lib/api/routes";
import type { Student } from "@/lib/api/students";
import type { StudentDragData } from "./studentDnd";
import RouteDetailPage from "./page";

// The real DndContext, wrapped so a test can fire a drop straight at the
// page's onDragEnd. jsdom has no layout, so a pointer drag can't be simulated.
const dnd = vi.hoisted(() => ({ props: undefined as DndContextProps | undefined }));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  function CapturingDndContext(props: DndContextProps) {
    dnd.props = props;
    return <actual.DndContext {...props} />;
  }
  return { ...actual, DndContext: CapturingDndContext };
});

// Mutable, so a test can move the page to another route mid-request.
const params = vi.hoisted(() => ({ routeId: "r-1" }));

vi.mock("next/navigation", () => ({
  useParams: () => params,
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

// Leaflet needs a real browser; the stand-in draws one button per pinned
// stop, so a test can see what the map shows.
vi.mock("@/components/map/MapView", () => ({
  MapView: ({ label, markers = [] }: { label: string; markers?: { id: string; label: string; latitude: number | null }[] }) => (
    <section aria-label={label}>
      {markers
        .filter((marker) => marker.latitude !== null)
        .map((marker) => (
          <span key={marker.id} role="img" aria-label={marker.label} />
        ))}
    </section>
  ),
}));

// The page only takes the Student type from here; mocked so nothing reaches
// the backend.
vi.mock("@/lib/api/students", () => ({
  getStudents: vi.fn(),
}));

// A pin per student, not one shared spot, so tests with several stops on
// the map don't coincidentally exercise the same-spot grouping (SCRUM-220).
function pinFor(studentId: string): number {
  return Number(studentId.replace(/\D/g, "")) || 0;
}

function stop(studentId: string, firstName: string, lastName: string, position: number): Stop {
  return {
    studentId,
    position,
    firstName,
    lastName,
    address: null,
    latitude: 33.89 + pinFor(studentId) * 0.001,
    longitude: 35.5 + pinFor(studentId) * 0.001,
    arrivalTime: null,
  };
}

function route(stops: Stop[], capacity = 3, id = "r-1", name = "Hamra morning run"): Route {
  return {
    id,
    name,
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    studentCount: stops.length,
    seatsLeft: capacity - stops.length,
    school: { latitude: 33.9, longitude: 35.48, arrivalTime: null },
    stops,
  };
}

function student(id: string, firstName: string, lastName: string, pin = true): Student {
  return {
    id,
    firstName,
    lastName,
    grade: "5",
    guardianName: "",
    guardianPhone: "",
    status: "active",
    address: null,
    latitude: pin ? 33.89 : null,
    longitude: pin ? 35.5 : null,
    route: null,
    parentUserId: null,
    createdAt: "",
  };
}

const LINA = stop("s-1", "Lina", "Saad", 1);
const OMAR = student("s-2", "Omar", "Nasser");
const RAMI = student("s-3", "Rami", "Khoury");

const OMAR_DRAG: StudentDragData = {
  from: "unassigned",
  name: "Omar Nasser",
  entry: { id: "s-2", firstName: "Omar", lastName: "Nasser", latitude: 33.89, longitude: 35.5 },
};
const RAMI_DRAG: StudentDragData = {
  from: "unassigned",
  name: "Rami Khoury",
  entry: { id: "s-3", firstName: "Rami", lastName: "Khoury", latitude: 33.89, longitude: 35.5 },
};
const LINA_DRAG: StudentDragData = { from: "on-route", name: "Lina Saad", stop: LINA };

function drop(data: StudentDragData, overId: "on-route" | "unassigned" | null) {
  const event = {
    active: { id: `student-${data.from}`, data: { current: data } },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
  act(() => {
    dnd.props?.onDragEnd?.(event);
  });
}

function list(name: "On this route" | "Not on a route") {
  return screen.getByRole("region", { name });
}

async function renderPage() {
  const result = render(<RouteDetailPage />);
  await screen.findByRole("heading", { name: "Hamra morning run" });
  return result;
}

function row(listName: "On this route" | "Not on a route", studentName: string) {
  return within(list(listName)).getByText(studentName).closest("li")!;
}

beforeEach(() => {
  params.routeId = "r-1";
  dnd.props = undefined;
  vi.mocked(getRoute).mockReset().mockResolvedValue(route([LINA]));
  vi.mocked(listUnassignedStudents).mockReset().mockResolvedValue([OMAR, RAMI]);
  vi.mocked(addStudentToRoute).mockReset();
  vi.mocked(removeStudentFromRoute).mockReset();
  vi.mocked(reorderStops).mockReset();
});

afterEach(() => {
  cleanup();
});

it("adds a student dropped on the route list, like the Add button", async () => {
  vi.mocked(addStudentToRoute).mockResolvedValue(route([LINA, stop("s-2", "Omar", "Nasser", 2)]));
  await renderPage();

  drop(OMAR_DRAG, "on-route");

  expect(addStudentToRoute).toHaveBeenCalledWith("r-1", "s-2");
  expect(await screen.findByText("2 of 3 seats")).toBeInTheDocument();
  expect(within(list("On this route")).getByText("Omar Nasser")).toBeInTheDocument();
  await waitFor(() =>
    expect(within(list("Not on a route")).queryByText("Omar Nasser")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("heading", { name: "On this route" })).toHaveFocus();
  expect(screen.getByText("Omar Nasser added to the route. 2 of 3 seats filled.")).toBeInTheDocument();
});

it("removes a student dropped on the unassigned list, like the Remove button", async () => {
  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([]));
  await renderPage();

  drop(LINA_DRAG, "unassigned");

  expect(removeStudentFromRoute).toHaveBeenCalledWith("r-1", "s-1");
  expect(await screen.findByText("0 of 3 seats")).toBeInTheDocument();
  expect(within(list("Not on a route")).getByText("Lina Saad")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Not on a route" })).toHaveFocus();
});

it("does nothing when a card is dropped back on its own list or outside both", async () => {
  await renderPage();

  drop(OMAR_DRAG, "unassigned");
  drop(OMAR_DRAG, null);
  drop(LINA_DRAG, "on-route");

  expect(addStudentToRoute).not.toHaveBeenCalled();
  expect(removeStudentFromRoute).not.toHaveBeenCalled();
});

it("refuses a drop on the route list when the vehicle is full, with the full warning", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([LINA], 1));
  await renderPage();
  const warning = "This vehicle is full (1 of 1 seats). Remove a student before adding another.";
  expect(screen.getByText(warning)).toBeInTheDocument();

  drop(OMAR_DRAG, "on-route");

  expect(addStudentToRoute).not.toHaveBeenCalled();
  expect(within(list("Not on a route")).getByText("Omar Nasser")).toBeInTheDocument();
  // Screen readers hear the same warning as the reason.
  const announcement = dnd.props?.accessibility?.announcements?.onDragEnd({
    active: { id: "student-s-2", data: { current: OMAR_DRAG } },
    over: { id: "on-route" },
  } as unknown as DragEndEvent);
  expect(announcement).toBe(`Omar Nasser was not added. ${warning}`);
});

it("still lets a full route's students be dropped back to the unassigned list", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([LINA], 1));
  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([], 1));
  await renderPage();

  drop(LINA_DRAG, "unassigned");

  expect(removeStudentFromRoute).toHaveBeenCalledWith("r-1", "s-1");
  expect(await screen.findByText("0 of 1 seats")).toBeInTheDocument();
});

it("shows the backend's 409 as the same alert as the Add button", async () => {
  vi.mocked(addStudentToRoute).mockRejectedValue(new ApiError(409, "This vehicle is already full."));
  await renderPage();

  drop(OMAR_DRAG, "on-route");

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("This vehicle is already full.");
  expect(alert).toHaveFocus();
  expect(within(list("Not on a route")).getByText("Omar Nasser")).toBeInTheDocument();
  expect(screen.getByText("1 of 3 seats")).toBeInTheDocument();
});

it("doesn't start a second request while one is in flight", async () => {
  let resolveAdd: (value: Route) => void = () => {};
  vi.mocked(addStudentToRoute).mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)));
  await renderPage();

  drop(OMAR_DRAG, "on-route");
  drop(RAMI_DRAG, "on-route");
  drop(LINA_DRAG, "unassigned");

  expect(addStudentToRoute).toHaveBeenCalledTimes(1);
  expect(removeStudentFromRoute).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Move Rami Khoury" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move Lina Saad" })).toBeDisabled();

  await act(async () => resolveAdd(route([LINA, stop("s-2", "Omar", "Nasser", 2)])));
  expect(screen.getByRole("button", { name: "Move Rami Khoury" })).toBeEnabled();
});

it("ignores a drop that lands in the same moment as a button press", async () => {
  vi.mocked(addStudentToRoute).mockReturnValue(new Promise(() => {}));
  await renderPage();

  const omarRow = within(list("Not on a route")).getByText("Omar Nasser").closest("li")!;
  // Both in one act, so the page hasn't re-rendered with the pending state in between.
  act(() => {
    fireEvent.click(within(omarRow).getByRole("button", { name: "Add" }));
    dnd.props?.onDragEnd?.({
      active: { id: "student-s-3", data: { current: RAMI_DRAG } },
      over: { id: "on-route" },
    } as unknown as DragEndEvent);
  });

  expect(addStudentToRoute).toHaveBeenCalledTimes(1);
});


it("gives each card a keyboard drag handle with instructions", async () => {
  await renderPage();

  const handle = screen.getByRole("button", { name: "Move Omar Nasser" });
  expect(handle).toHaveAttribute("aria-roledescription", "draggable");
  expect(handle).toHaveAccessibleDescription(/press Space or Enter, then use the up and down arrow keys/);
});

it("picks a card up with Space on its handle and cancels with Escape", async () => {
  await renderPage();
  const handle = screen.getByRole("button", { name: "Move Omar Nasser" });

  fireEvent.keyDown(handle, { code: "Space" });
  expect(await screen.findByText("Picked up Omar Nasser from Not on a route.")).toBeInTheDocument();

  // The keyboard sensor listens on the document from the next tick.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.keyDown(document, { code: "Escape" });
  expect(
    await screen.findByText("Moving Omar Nasser was cancelled. They stay in Not on a route."),
  ).toBeInTheDocument();
  expect(addStudentToRoute).not.toHaveBeenCalled();
});

it("doesn't start a drag when Space is pressed on the Add button", async () => {
  await renderPage();
  const omarRow = within(list("Not on a route")).getByText("Omar Nasser").closest("li")!;

  fireEvent.keyDown(within(omarRow).getByRole("button", { name: "Add" }), { code: "Space" });

  expect(screen.queryByText(/Picked up/)).not.toBeInTheDocument();
});

it("adds a student with the Add button and moves focus to the route list", async () => {
  vi.mocked(addStudentToRoute).mockResolvedValue(route([LINA, stop("s-2", "Omar", "Nasser", 2)]));
  await renderPage();

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  expect(addStudentToRoute).toHaveBeenCalledWith("r-1", "s-2");
  expect(await screen.findByText("2 of 3 seats")).toBeInTheDocument();
  expect(within(list("On this route")).getByText("Omar Nasser")).toBeInTheDocument();
  await waitFor(() =>
    expect(within(list("Not on a route")).queryByText("Omar Nasser")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("heading", { name: "On this route" })).toHaveFocus();
  expect(screen.getByText("Omar Nasser added to the route. 2 of 3 seats filled.")).toBeInTheDocument();
});

it("removes a student with the Remove button and moves focus to the unassigned list", async () => {
  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([]));
  await renderPage();

  fireEvent.click(within(row("On this route", "Lina Saad")).getByRole("button", { name: "Remove" }));

  expect(removeStudentFromRoute).toHaveBeenCalledWith("r-1", "s-1");
  expect(await screen.findByText("0 of 3 seats")).toBeInTheDocument();
  expect(within(list("Not on a route")).getByText("Lina Saad")).toBeInTheDocument();
  expect(screen.getByText("No students on this route yet.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Not on a route" })).toHaveFocus();
  expect(screen.getByText("Lina Saad removed from the route. 0 of 3 seats filled.")).toBeInTheDocument();
});

it("warns when the vehicle is full and disables every Add, each with its own reason", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([LINA], 1));
  await renderPage();

  expect(screen.getByText("1 of 1 seats")).toBeInTheDocument();
  expect(
    screen.getByText("This vehicle is full (1 of 1 seats). Remove a student before adding another."),
  ).toBeInTheDocument();
  for (const name of ["Omar Nasser", "Rami Khoury"]) {
    const add = within(row("Not on a route", name)).getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription("Vehicle is full.");
    // The reason it points at is the one in its own row.
    const reason = document.getElementById(add.getAttribute("aria-describedby")!);
    expect(row("Not on a route", name)).toContainElement(reason);
  }
  // Removing still works on a full route.
  expect(within(row("On this route", "Lina Saad")).getByRole("button", { name: "Remove" })).toBeEnabled();
});

it("has no duplicate ids on the page, full or not", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([LINA], 1));
  await renderPage();

  const ids = () => Array.from(document.querySelectorAll("[id]"), (element) => element.id);
  expect(ids().length).toBeGreaterThan(0);
  expect(new Set(ids()).size).toBe(ids().length);

  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([], 1));
  fireEvent.click(within(row("On this route", "Lina Saad")).getByRole("button", { name: "Remove" }));
  await screen.findByText("0 of 1 seats");
  expect(new Set(ids()).size).toBe(ids().length);
});

it("leaves the disabled Add buttons out of the Tab order", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([LINA], 1));
  await renderPage();

  const tabbable = Array.from(
    document.querySelectorAll<HTMLElement>("a[href], button, [tabindex]"),
  ).filter((element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled);
  const names = tabbable.map((element) => element.getAttribute("aria-label") ?? element.textContent);

  expect(names).not.toContain("Add");
  expect(names).toEqual(
    expect.arrayContaining(["Back to routes", "Move Lina Saad", "Remove", "Move Omar Nasser"]),
  );
});

it("marks an over-capacity route and keeps Add disabled", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([LINA, stop("s-9", "Hadi", "Aoun", 2)], 1));
  await renderPage();

  expect(screen.getByText("2 of 1 seats")).toBeInTheDocument();
  expect(screen.getByText(/over capacity by 1 seat\./)).toBeInTheDocument();
  expect(
    within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }),
  ).toHaveAccessibleDescription("Vehicle is over capacity.");
});

it("shows the backend's over-capacity 409 as a focused alert and resyncs the counter", async () => {
  const message = "The route has 3 students but the vehicle seats 3.";
  vi.mocked(addStudentToRoute).mockRejectedValue(new ApiError(409, message));
  await renderPage();
  // Someone else filled the vehicle meanwhile; the resync shows it.
  const full = route([LINA, stop("s-8", "Maya", "Haddad", 2), stop("s-9", "Hadi", "Aoun", 3)]);
  vi.mocked(getRoute).mockResolvedValue(full);

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(message);
  expect(alert).toHaveFocus();
  expect(await screen.findByText("3 of 3 seats")).toBeInTheDocument();
  expect(screen.getByText(/This vehicle is full/)).toBeInTheDocument();
  expect(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" })).toBeDisabled();
  expect(alert).toHaveFocus();
});

// The backend answers an inactive student with a 409 that has `errors.studentId`.
it("shows the field message when the student was made inactive elsewhere, and drops them", async () => {
  vi.mocked(addStudentToRoute).mockRejectedValue(
    new ApiValidationError({ studentId: "Only an active student can be put on a route." }),
  );
  await renderPage();
  vi.mocked(listUnassignedStudents).mockResolvedValue([RAMI]);

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Only an active student can be put on a route.");
  expect(alert).toHaveFocus();
  await waitFor(() => expect(screen.queryByText("Omar Nasser")).not.toBeInTheDocument());
  expect(screen.getByText("1 of 3 seats")).toBeInTheDocument();
});

it("shows the not-found state when the route was deleted elsewhere", async () => {
  vi.mocked(addStudentToRoute).mockRejectedValue(new ApiError(404, "Route not found."));
  await renderPage();
  vi.mocked(getRoute).mockRejectedValue(new ApiError(404, "Route not found."));

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  const heading = await screen.findByRole("heading", { name: "Route not found" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.queryByRole("region", { name: "On this route" })).not.toBeInTheDocument();
});

it("says something went wrong for a failure without a message, and re-enables the buttons", async () => {
  vi.mocked(addStudentToRoute).mockRejectedValue(new TypeError("Failed to fetch"));
  await renderPage();

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  await waitFor(() =>
    expect(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" })).toBeEnabled(),
  );
});

it("clears the alert when the next change succeeds", async () => {
  vi.mocked(addStudentToRoute)
    .mockRejectedValueOnce(new ApiError(409, "Nope."))
    .mockResolvedValueOnce(route([LINA, stop("s-2", "Omar", "Nasser", 2)]));
  await renderPage();
  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" })).toBeEnabled(),
  );

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  expect(await screen.findByText("2 of 3 seats")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("marks students without a map pin on both lists", async () => {
  const noPinStop = { ...LINA, latitude: null, longitude: null };
  vi.mocked(getRoute).mockResolvedValue(route([noPinStop]));
  vi.mocked(listUnassignedStudents).mockResolvedValue([student("s-2", "Omar", "Nasser", false), RAMI]);
  await renderPage();

  expect(within(row("On this route", "Lina Saad")).getByText(/Needs pin/)).toBeInTheDocument();
  expect(within(row("Not on a route", "Omar Nasser")).getByText(/Needs pin/)).toBeInTheDocument();
  expect(within(row("Not on a route", "Rami Khoury")).queryByText(/Needs pin/)).not.toBeInTheDocument();
});

it("keeps the pin mark when a student without a pin moves between lists", async () => {
  vi.mocked(listUnassignedStudents).mockResolvedValue([student("s-2", "Omar", "Nasser", false)]);
  vi.mocked(addStudentToRoute).mockResolvedValue(
    route([LINA, { ...stop("s-2", "Omar", "Nasser", 2), latitude: null, longitude: null }]),
  );
  await renderPage();

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  await screen.findByText("2 of 3 seats");
  expect(within(row("On this route", "Omar Nasser")).getByText(/Needs pin/)).toBeInTheDocument();
});

it("shows a loading state until the route arrives", async () => {
  vi.mocked(getRoute).mockReturnValue(new Promise(() => {}));
  render(<RouteDetailPage />);

  expect(screen.getByText("Loading route…")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
});

it("shows both empty lists for a route with no students when every student is placed", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([]));
  vi.mocked(listUnassignedStudents).mockResolvedValue([]);
  await renderPage();

  expect(screen.getByText("0 of 3 seats")).toBeInTheDocument();
  expect(within(list("On this route")).getByText("No students on this route yet.")).toBeInTheDocument();
  expect(within(list("Not on a route")).getByText("No students are waiting for a route.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("adds the first student to a route that has none", async () => {
  vi.mocked(getRoute).mockResolvedValue(route([]));
  vi.mocked(addStudentToRoute).mockResolvedValue(route([stop("s-2", "Omar", "Nasser", 1)]));
  await renderPage();

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  expect(await screen.findByText("1 of 3 seats")).toBeInTheDocument();
  expect(screen.queryByText("No students on this route yet.")).not.toBeInTheDocument();
});

it("puts a removed student back when every other student is already placed", async () => {
  vi.mocked(listUnassignedStudents).mockResolvedValue([]);
  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([]));
  await renderPage();
  expect(screen.getByText("No students are waiting for a route.")).toBeInTheDocument();

  fireEvent.click(within(row("On this route", "Lina Saad")).getByRole("button", { name: "Remove" }));

  expect(await within(list("Not on a route")).findByText("Lina Saad")).toBeInTheDocument();
  expect(screen.queryByText("No students are waiting for a route.")).not.toBeInTheDocument();
});

it("shows an error with Try again, and focuses the route's heading once it loads", async () => {
  vi.mocked(getRoute).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<RouteDetailPage />);

  expect(await screen.findByRole("heading", { name: "Couldn't load this route" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  const heading = await screen.findByRole("heading", { name: "Hamra morning run" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(getRoute).toHaveBeenCalledTimes(2);
});

it("focuses the error heading when Try again fails again", async () => {
  vi.mocked(getRoute).mockRejectedValue(new ApiError(500, "Server error"));
  render(<RouteDetailPage />);
  await screen.findByRole("heading", { name: "Couldn't load this route" });

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => expect(getRoute).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Couldn't load this route" })).toHaveFocus(),
  );
});

it("shows a not-found state for an unknown route", async () => {
  vi.mocked(getRoute).mockRejectedValue(new ApiError(404, "Route not found."));
  render(<RouteDetailPage />);

  expect(await screen.findByRole("heading", { name: "Route not found" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to routes" })).toHaveAttribute(
    "href",
    "/head-of-transport/routes",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
});

it("sends one request for a double click on Add, and disables every control meanwhile", async () => {
  let resolveAdd: (value: Route) => void = () => {};
  vi.mocked(addStudentToRoute).mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)));
  await renderPage();
  const add = within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" });

  act(() => {
    fireEvent.click(add);
    fireEvent.click(add);
  });

  expect(addStudentToRoute).toHaveBeenCalledTimes(1);
  expect(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Adding…" })).toBeDisabled();
  expect(within(row("Not on a route", "Rami Khoury")).getByRole("button", { name: "Add" })).toBeDisabled();
  expect(within(row("On this route", "Lina Saad")).getByRole("button", { name: "Remove" })).toBeDisabled();

  await act(async () => resolveAdd(route([LINA, stop("s-2", "Omar", "Nasser", 2)])));
  expect(within(row("Not on a route", "Rami Khoury")).getByRole("button", { name: "Add" })).toBeEnabled();
});

it("takes the unassigned list from the backend's route, not only the student who moved", async () => {
  // Someone else added Rami to this route at the same time.
  vi.mocked(addStudentToRoute).mockResolvedValue(
    route([LINA, stop("s-2", "Omar", "Nasser", 2), stop("s-3", "Rami", "Khoury", 3)]),
  );
  await renderPage();

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  expect(await screen.findByText("3 of 3 seats")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("No students are waiting for a route.")).toBeInTheDocument());
  expect(within(list("On this route")).getByText("Rami Khoury")).toBeInTheDocument();
});

it("ignores an add that finishes after the page moved to another route", async () => {
  let resolveAdd: (value: Route) => void = () => {};
  vi.mocked(addStudentToRoute).mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)));
  vi.mocked(getRoute).mockImplementation(async (id) =>
    id === "r-2" ? route([], 5, "r-2", "Verdun morning run") : route([LINA]),
  );
  const { rerender } = await renderPage();
  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  params.routeId = "r-2";
  rerender(<RouteDetailPage />);
  await screen.findByRole("heading", { name: "Verdun morning run" });
  await act(async () => resolveAdd(route([LINA, stop("s-2", "Omar", "Nasser", 2)])));

  expect(screen.getByRole("heading", { name: "Verdun morning run" })).toBeInTheDocument();
  expect(screen.getByText("0 of 5 seats")).toBeInTheDocument();
  expect(within(list("Not on a route")).getByText("Omar Nasser")).toBeInTheDocument();
  expect(within(list("On this route")).queryByText("Omar Nasser")).not.toBeInTheDocument();
  // And the next change isn't blocked by the abandoned one.
  expect(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" })).toBeEnabled();
});

it("ignores a load that finishes after a newer one", async () => {
  let resolveFirst: (value: Route) => void = () => {};
  vi.mocked(getRoute)
    .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
    .mockImplementation(async () => route([], 5, "r-2", "Verdun morning run"));
  const { rerender } = render(<RouteDetailPage />);

  params.routeId = "r-2";
  rerender(<RouteDetailPage />);
  await screen.findByRole("heading", { name: "Verdun morning run" });
  await act(async () => resolveFirst(route([LINA])));

  expect(screen.getByRole("heading", { name: "Verdun morning run" })).toBeInTheDocument();
  expect(screen.queryByText("Lina Saad")).not.toBeInTheDocument();
});

function mapMarkers() {
  return within(screen.getByRole("region", { name: "Map of Hamra morning run" }))
    .queryAllByRole("img")
    .map((marker) => marker.getAttribute("aria-label"));
}

it("shows the route's pinned stops on the map", async () => {
  await renderPage();

  expect(mapMarkers()).toEqual(["Stop 1: Lina Saad"]);
});

it("redraws the map from the route an add answers with, without fetching it again", async () => {
  vi.mocked(addStudentToRoute).mockResolvedValue(route([LINA, stop("s-2", "Omar", "Nasser", 2)]));
  await renderPage();

  fireEvent.click(within(row("Not on a route", "Omar Nasser")).getByRole("button", { name: "Add" }));

  await waitFor(() => expect(mapMarkers()).toEqual(["Stop 1: Lina Saad", "Stop 2: Omar Nasser"]));
  expect(getRoute).toHaveBeenCalledTimes(1);
});

it("redraws the map from the route a drop answers with", async () => {
  vi.mocked(addStudentToRoute).mockResolvedValue(route([LINA, stop("s-3", "Rami", "Khoury", 2)]));
  await renderPage();

  drop(RAMI_DRAG, "on-route");

  await waitFor(() => expect(mapMarkers()).toEqual(["Stop 1: Lina Saad", "Stop 2: Rami Khoury"]));
  expect(getRoute).toHaveBeenCalledTimes(1);
});

it("takes a removed student off the map", async () => {
  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([]));
  await renderPage();

  fireEvent.click(within(row("On this route", "Lina Saad")).getByRole("button", { name: "Remove" }));

  await screen.findByText("0 of 3 seats");
  expect(mapMarkers()).toEqual([]);
  expect(getRoute).toHaveBeenCalledTimes(1);
});

it("puts the map before the student lists, so a phone shows it first", async () => {
  await renderPage();

  const map = screen.getByRole("region", { name: "Map of Hamra morning run" });
  for (const name of ["On this route", "Not on a route"]) {
    const heading = screen.getByRole("heading", { name });
    expect(map.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
});

// Manual reordering on "On this route" (SCRUM-221/SCRUM-73).

function routeListTexts() {
  return within(list("On this route")).getAllByRole("listitem").map((item) => item.textContent);
}

function dragOnto(activeStudentId: string, overStudentId: string, stop: Stop) {
  const data: StudentDragData = { from: "on-route", name: `${stop.firstName} ${stop.lastName}`, stop };
  act(() => {
    dnd.props?.onDragEnd?.({
      active: { id: `student-${activeStudentId}`, data: { current: data } },
      over: { id: `student-${overStudentId}` },
    } as unknown as DragEndEvent);
  });
}

it("reorders by dragging one stop onto another, calling reorderStops with the full new order", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  const HADI = stop("s-9", "Hadi", "Aoun", 3);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA, HADI], 5));
  vi.mocked(reorderStops).mockResolvedValue(
    route([stop("s-8", "Maya", "Haddad", 1), stop("s-1", "Lina", "Saad", 2), HADI], 5),
  );
  await renderPage();

  dragOnto("s-1", "s-8", LINA);

  expect(reorderStops).toHaveBeenCalledWith("r-1", ["s-8", "s-1", "s-9"]);
  await waitFor(() =>
    expect(routeListTexts()).toEqual(["1Maya HaddadRemove", "2Lina SaadRemove", "3Hadi AounRemove"]),
  );
  expect(mapMarkers()).toEqual(["Stop 1: Maya Haddad", "Stop 2: Lina Saad", "Stop 3: Hadi Aoun"]);
  expect(screen.getByText("3 of 5 seats")).toBeInTheDocument();
  expect(screen.getByText("Lina Saad moved to stop 2 of 3.")).toBeInTheDocument();
});

it("keeps the order and shows the backend's error when a reorder fails", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA], 5));
  vi.mocked(reorderStops).mockRejectedValue(
    new ApiValidationError({ studentIds: "The list must contain exactly this route's current stops." }),
  );
  await renderPage();
  const before = routeListTexts();

  dragOnto("s-1", "s-8", LINA);

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("The list must contain exactly this route's current stops.");
  expect(routeListTexts()).toEqual(before);
});

it("has no Move up on the first stop and no Move down on the last", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA], 5));
  await renderPage();

  expect(
    within(row("On this route", "Lina Saad")).queryByRole("button", { name: "Move Lina Saad up" }),
  ).not.toBeInTheDocument();
  expect(
    within(row("On this route", "Lina Saad")).getByRole("button", { name: "Move Lina Saad down" }),
  ).toBeInTheDocument();
  expect(
    within(row("On this route", "Maya Haddad")).getByRole("button", { name: "Move Maya Haddad up" }),
  ).toBeInTheDocument();
  expect(
    within(row("On this route", "Maya Haddad")).queryByRole("button", { name: "Move Maya Haddad down" }),
  ).not.toBeInTheDocument();
});

it("moves a stop down with its Move down button, calling reorderStops with the new order", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  const HADI = stop("s-9", "Hadi", "Aoun", 3);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA, HADI], 5));
  vi.mocked(reorderStops).mockResolvedValue(
    route([stop("s-8", "Maya", "Haddad", 1), stop("s-1", "Lina", "Saad", 2), HADI], 5),
  );
  await renderPage();

  fireEvent.click(
    within(row("On this route", "Lina Saad")).getByRole("button", { name: "Move Lina Saad down" }),
  );

  expect(reorderStops).toHaveBeenCalledWith("r-1", ["s-8", "s-1", "s-9"]);
  await waitFor(() =>
    expect(routeListTexts()).toEqual(["1Maya HaddadRemove", "2Lina SaadRemove", "3Hadi AounRemove"]),
  );
  expect(screen.getByText("Lina Saad moved to stop 2 of 3.")).toBeInTheDocument();
  // The button was disabled during the request; focus comes back to it.
  await waitFor(() =>
    expect(within(row("On this route", "Lina Saad")).getByRole("button", { name: "Move Lina Saad down" })).toHaveFocus(),
  );
});

it("moves focus to Move up when a stop reaches the bottom and its Move down is gone", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  const HADI = stop("s-9", "Hadi", "Aoun", 3);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA, HADI], 5));
  vi.mocked(reorderStops).mockResolvedValue(
    route([LINA, stop("s-9", "Hadi", "Aoun", 2), stop("s-8", "Maya", "Haddad", 3)], 5),
  );
  await renderPage();

  fireEvent.click(
    within(row("On this route", "Maya Haddad")).getByRole("button", { name: "Move Maya Haddad down" }),
  );

  await waitFor(() =>
    expect(within(row("On this route", "Maya Haddad")).getByRole("button", { name: "Move Maya Haddad up" })).toHaveFocus(),
  );
  expect(
    within(row("On this route", "Maya Haddad")).queryByRole("button", { name: "Move Maya Haddad down" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Maya Haddad moved to stop 3 of 3.")).toBeInTheDocument();
});

it("focuses the alert when a Move button's reorder fails", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA], 5));
  vi.mocked(reorderStops).mockRejectedValue(new TypeError("Failed to fetch"));
  await renderPage();
  const before = routeListTexts();

  fireEvent.click(
    within(row("On this route", "Lina Saad")).getByRole("button", { name: "Move Lina Saad down" }),
  );

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Something went wrong. Please try again.");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(routeListTexts()).toEqual(before);
});

it("sends one reorder for a double click on Move down", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA], 5));
  let resolveReorder: (value: Route) => void = () => {};
  vi.mocked(reorderStops).mockReturnValue(new Promise((resolve) => (resolveReorder = resolve)));
  await renderPage();
  const moveDown = within(row("On this route", "Lina Saad")).getByRole("button", { name: "Move Lina Saad down" });

  act(() => {
    fireEvent.click(moveDown);
    fireEvent.click(moveDown);
  });

  expect(reorderStops).toHaveBeenCalledTimes(1);
  expect(moveDown).toBeDisabled();
  await act(async () => resolveReorder(route([stop("s-8", "Maya", "Haddad", 1), stop("s-1", "Lina", "Saad", 2)], 5)));
});

it("moves a stop up with its Move up button, calling reorderStops with the new order", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  const HADI = stop("s-9", "Hadi", "Aoun", 3);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA, HADI], 5));
  vi.mocked(reorderStops).mockResolvedValue(
    route([stop("s-9", "Hadi", "Aoun", 1), stop("s-1", "Lina", "Saad", 2), stop("s-8", "Maya", "Haddad", 3)], 5),
  );
  await renderPage();

  fireEvent.click(
    within(row("On this route", "Hadi Aoun")).getByRole("button", { name: "Move Hadi Aoun up" }),
  );

  expect(reorderStops).toHaveBeenCalledWith("r-1", ["s-1", "s-9", "s-8"]);
  await waitFor(() =>
    expect(routeListTexts()).toEqual(["1Hadi AounRemove", "2Lina SaadRemove", "3Maya HaddadRemove"]),
  );
});

it("still adds a student dropped on the route list when it already has several stops", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA], 5));
  vi.mocked(addStudentToRoute).mockResolvedValue(
    route([LINA, MAYA, stop("s-2", "Omar", "Nasser", 3)], 5),
  );
  await renderPage();

  drop(OMAR_DRAG, "on-route");

  expect(addStudentToRoute).toHaveBeenCalledWith("r-1", "s-2");
  expect(reorderStops).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(within(list("On this route")).getByText("Omar Nasser")).toBeInTheDocument(),
  );
});

it("still removes a student dropped on the unassigned list when the route has several stops", async () => {
  const MAYA = stop("s-8", "Maya", "Haddad", 2);
  vi.mocked(getRoute).mockResolvedValue(route([LINA, MAYA], 5));
  vi.mocked(removeStudentFromRoute).mockResolvedValue(route([MAYA], 5));
  await renderPage();

  drop(LINA_DRAG, "unassigned");

  expect(removeStudentFromRoute).toHaveBeenCalledWith("r-1", "s-1");
  expect(reorderStops).not.toHaveBeenCalled();
  expect(await screen.findByText("1 of 5 seats")).toBeInTheDocument();
});
