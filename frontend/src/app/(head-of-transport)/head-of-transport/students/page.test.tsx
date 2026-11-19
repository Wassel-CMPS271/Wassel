import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getParents, type Parent } from "@/lib/api/parents";
import { getRouteAssignments, type RouteAssignment, type RouteAssignments } from "@/lib/api/routes";
import {
  addStudentWithAddress,
  getStudents,
  setStudentLocation,
  updateStudentAddress,
  type Student,
} from "@/lib/api/students";
import StudentsPage from "./page";

vi.mock("@/lib/api/students", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/students")>()),
  getStudents: vi.fn(),
  addStudentWithAddress: vi.fn(),
  updateStudentAddress: vi.fn(),
  setStudentLocation: vi.fn(),
}));

vi.mock("@/lib/api/parents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/parents")>()),
  getParents: vi.fn(),
}));

vi.mock("@/lib/api/routes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/routes")>()),
  getRouteAssignments: vi.fn(),
}));

vi.mock("./AddressRequestsSection", () => ({
  AddressRequestsSection: ({ onApproved }: { onApproved: (studentId: string) => void }) => (
    <button type="button" onClick={() => onApproved("st-1")}>
      Simulate address approval
    </button>
  ),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function LeafletMapStub({ onPinChange }: { onPinChange?: (latitude: number, longitude: number) => void }) {
      return (
        <button type="button" onClick={() => onPinChange?.(33.9001, 35.5102)}>
          Stub map click
        </button>
      );
    },
}));

const LINA: Student = {
  id: "st-1",
  firstName: "Lina",
  lastName: "Daher",
  grade: "Grade 4",
  guardianName: "Rami Daher",
  guardianPhone: "+961 3 123 456",
  status: "active",
  address: "Hamra Street, Beirut",
  latitude: null,
  longitude: null,
  route: null,
  parentUserId: null,
  createdAt: "",
};
const HADI: Student = { ...LINA, id: "st-2", firstName: "Hadi", lastName: "Rizk", latitude: 33.886, longitude: 35.485 };
// Active, pinned, on no route: the one shape that offers Find a route.
const NORA: Student = { ...LINA, id: "st-4", firstName: "Nora", lastName: "Fakhoury", latitude: 33.9, longitude: 35.5 };

const RAMI_PARENT: Parent = { id: "p-1", email: "rami@example.com", status: "active", createdAt: "" };
const REVOKED_PARENT: Parent = { id: "p-2", email: "nour@example.com", status: "revoked", createdAt: "" };

const HAMRA_ROUTE = { id: "route-1", name: "Hamra morning run" };
const VERDUN_ROUTE = { id: "route-2", name: "Verdun morning run" };
const ON_HAMRA: RouteAssignment = { routeId: HAMRA_ROUTE.id, routeName: HAMRA_ROUTE.name };

function routeData(byStudent: [string, RouteAssignment][] = [[HADI.id, ON_HAMRA]]): RouteAssignments {
  return { routes: [HAMRA_ROUTE, VERDUN_ROUTE], byStudent: new Map(byStudent) };
}

beforeEach(() => {
  vi.mocked(getStudents).mockReset().mockResolvedValue([LINA, HADI]);
  vi.mocked(addStudentWithAddress).mockReset();
  vi.mocked(updateStudentAddress).mockReset();
  vi.mocked(setStudentLocation).mockReset();
  vi.mocked(getRouteAssignments).mockReset().mockResolvedValue(routeData());
  vi.mocked(getParents).mockReset().mockResolvedValue([RAMI_PARENT, REVOKED_PARENT]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function row(name: string) {
  return screen.getByText(name).closest("li")!;
}

// StudentStatusControl and BestRoutePanel call the real roster API
// (request() under them), so these stub the actual fetch instead of mocking
// the roster module, the same pattern as roster.test.ts and the two
// components' own test files.
function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function stubFetch(...answers: (Response | Promise<Response> | Error)[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) {
    if (answer instanceof Error) fetchMock.mockRejectedValueOnce(answer);
    else fetchMock.mockReturnValueOnce(Promise.resolve(answer));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("shows a loading status while the students load", () => {
  vi.mocked(getStudents).mockReturnValue(new Promise(() => {}));
  render(<StudentsPage />);

  expect(screen.getByText("Loading students…")).toHaveAttribute("role", "status");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows the empty state when there are no students", async () => {
  vi.mocked(getStudents).mockResolvedValue([]);
  render(<StudentsPage />);

  expect(await screen.findByText("No students yet")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows an error when the students fail to load", async () => {
  vi.mocked(getStudents).mockRejectedValue(new Error("down"));
  render(<StudentsPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load students. Please try again.");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("reloads the roster when Try again is pressed after a failed load", async () => {
  vi.mocked(getStudents).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([LINA]);
  render(<StudentsPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load students. Please try again.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Lina Daher")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(getStudents).toHaveBeenCalledTimes(2);
});

it("keeps the error and the Try again button when the retry fails too", async () => {
  vi.mocked(getStudents).mockRejectedValue(new Error("down"));
  render(<StudentsPage />);

  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

  await waitFor(() => expect(getStudents).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load students. Please try again.");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});

// NOT BUILT (SCRUM-223), a design observation rather than a bug: search,
// status and grade filter the roster loaded once on mount, in memory
// (matchesFilters), and never ask the backend, although getStudents() already
// takes filters and builds the query string. SCRUM-223's criteria don't
// require backend filtering, but SCRUM-66 (filter students by route) will.
it.skip("asks the backend for filtered results instead of filtering the loaded roster in memory", async () => {
  vi.mocked(getStudents).mockResolvedValueOnce([LINA, HADI]).mockResolvedValueOnce([HADI]);
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Hadi" } });

  await waitFor(() =>
    expect(getStudents).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "Hadi" }),
    ),
  );
  expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument();
});

function addStudentThroughTheDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Add student" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("First name"), { target: { value: "Maya" } });
  fireEvent.change(within(dialog).getByLabelText("Last name"), { target: { value: "Saad" } });
  fireEvent.change(within(dialog).getByLabelText("Grade"), { target: { value: "Grade 2" } });
  fireEvent.change(within(dialog).getByLabelText("Guardian name"), { target: { value: "Nour Saad" } });
  fireEvent.change(within(dialog).getByLabelText("Guardian phone"), { target: { value: "+961 70 234 567" } });
  fireEvent.change(within(dialog).getByLabelText("Pickup address"), { target: { value: "Verdun, Beirut" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add student" }));
}

const MAYA: Student = {
  ...LINA,
  id: "st-3",
  firstName: "Maya",
  lastName: "Saad",
  grade: "Grade 2",
  guardianName: "Nour Saad",
  guardianPhone: "+961 70 234 567",
  address: "Verdun, Beirut",
};

it("adds a student to the roster and confirms the pickup address was saved", async () => {
  vi.mocked(addStudentWithAddress).mockResolvedValue({ student: MAYA, addressSaved: true });
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  addStudentThroughTheDialog();

  expect(await screen.findByText("Maya Saad")).toBeInTheDocument();
  expect(addStudentWithAddress).toHaveBeenCalledWith({
    firstName: "Maya",
    lastName: "Saad",
    grade: "Grade 2",
    guardianName: "Nour Saad",
    guardianPhone: "+961 70 234 567",
    address: "Verdun, Beirut",
  });
  const toast = await screen.findByText("Maya Saad added with pickup address.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("says so when the student was created but the address was not saved", async () => {
  vi.mocked(addStudentWithAddress).mockResolvedValue({ student: { ...MAYA, address: null }, addressSaved: false });
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  addStudentThroughTheDialog();

  expect(await screen.findByText("Maya Saad")).toBeInTheDocument();
  expect(
    await screen.findByText(
      "Maya Saad was created, but the address was not saved. Use Edit pickup details to retry.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("Maya Saad added with pickup address.")).not.toBeInTheDocument();
});

it("narrows the roster as the user searches, and shows a no-match message", async () => {
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "hadi" } });
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "nobody" } });
  expect(await screen.findByText("No students match your search.")).toBeInTheDocument();
  expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument();
});

it("filters the roster by status", async () => {
  vi.mocked(getStudents).mockResolvedValue([LINA, { ...HADI, status: "inactive" }]);
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  fireEvent.click(screen.getByRole("button", { name: "Archived" }));

  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
});

it("offers All, Active, Paused and Archived as the status filters", async () => {
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  const group = screen.getByRole("group", { name: "Filter by status" });
  expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
    "All",
    "Active",
    "Paused",
    "Archived",
  ]);
  expect(within(group).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
});

it("labels each row Active, Paused or Archived", async () => {
  vi.mocked(getStudents).mockResolvedValue([
    LINA,
    { ...HADI, status: "paused" },
    { ...LINA, id: "st-3", firstName: "Maya", lastName: "Saad", status: "inactive" },
  ]);
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  expect(within(row("Lina Daher")).getByText("Active")).toBeInTheDocument();
  expect(within(row("Hadi Rizk")).getByText("Paused")).toBeInTheDocument();
  expect(within(row("Maya Saad")).getByText("Archived")).toBeInTheDocument();
  expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
});

it("filters the roster to paused students, apart from active and archived ones", async () => {
  vi.mocked(getStudents).mockResolvedValue([
    LINA,
    { ...HADI, status: "paused" },
    { ...LINA, id: "st-3", firstName: "Maya", lastName: "Saad", status: "inactive" },
  ]);
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  fireEvent.click(screen.getByRole("button", { name: "Paused" }));
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
  expect(screen.queryByText("Maya Saad")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Paused" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "Archived" }));
  await waitFor(() => expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument());
  expect(screen.getByText("Maya Saad")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Active" }));
  await waitFor(() => expect(screen.queryByText("Maya Saad")).not.toBeInTheDocument());
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
  expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument();
});

it("flags students without coordinates as needing a pin", async () => {
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  expect(within(row("Lina Daher")).getByText("Needs pin")).toBeInTheDocument();
  expect(within(row("Hadi Rizk")).queryByText("Needs pin")).not.toBeInTheDocument();
});

it("saves a pin, clears the flag and announces it", async () => {
  vi.mocked(setStudentLocation).mockResolvedValue({ ...LINA, latitude: 33.9001, longitude: 35.5102 });
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  fireEvent.click(screen.getByRole("button", { name: "Edit pickup details for Lina Daher" }));
  const dialog = screen.getByRole("dialog", { name: "Edit pickup details" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  const toast = await screen.findByText("Pickup location updated for Lina Daher.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
  expect(setStudentLocation).toHaveBeenCalledWith("st-1", 33.9001, 35.5102);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(within(row("Lina Daher")).queryByText("Needs pin")).not.toBeInTheDocument();
});

it("keeps the saved address in the list when the pin fails", async () => {
  vi.mocked(updateStudentAddress).mockResolvedValue({ ...LINA, address: "Verdun, Beirut" });
  vi.mocked(setStudentLocation).mockRejectedValue(new Error("network down"));
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  fireEvent.click(screen.getByRole("button", { name: "Edit pickup details for Lina Daher" }));
  const dialog = screen.getByRole("dialog", { name: "Edit pickup details" });
  fireEvent.change(within(dialog).getByLabelText("Pickup address"), { target: { value: "Verdun, Beirut" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "The pickup address was saved, but the pin was not.",
  );
  expect(await screen.findByText("Pickup address updated for Lina Daher.")).toBeInTheDocument();
  expect(screen.queryByText("Pickup location updated for Lina Daher.")).not.toBeInTheDocument();
  expect(within(row("Lina Daher")).getByText("Pickup address: Verdun, Beirut")).toBeInTheDocument();
  expect(within(row("Lina Daher")).getByText("Needs pin")).toBeInTheDocument();
});

// Waits until the roster and the route filter have both loaded.
async function renderLoaded() {
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");
  await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());
}

it("shows each student's route, or 'No route' when they're on none", async () => {
  await renderLoaded();

  expect(within(row("Hadi Rizk")).getByText("Route: Hamra morning run")).toBeInTheDocument();
  expect(within(row("Lina Daher")).getByText("No route")).toBeInTheDocument();
});

it("loads the routes in one call and offers each one, plus 'All routes' and 'No route'", async () => {
  await renderLoaded();

  const options = within(screen.getByLabelText("Route")).getAllByRole("option");
  expect(options.map((o) => o.textContent)).toEqual([
    "All routes",
    "No route",
    "Hamra morning run",
    "Verdun morning run",
  ]);
  expect(getRouteAssignments).toHaveBeenCalledTimes(1);
});

it("filters the roster by route", async () => {
  await renderLoaded();

  fireEvent.change(screen.getByLabelText("Route"), { target: { value: HAMRA_ROUTE.id } });

  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
});

it("filters the roster to students on no route", async () => {
  await renderLoaded();

  fireEvent.change(screen.getByLabelText("Route"), { target: { value: "none" } });

  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument());
});

it("shows the empty state for a route with no students, and Clear filters resets the route", async () => {
  await renderLoaded();

  fireEvent.change(screen.getByLabelText("Route"), { target: { value: VERDUN_ROUTE.id } });

  expect(await screen.findByText("No students match your search.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

  expect(await screen.findByText("Lina Daher")).toBeInTheDocument();
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
  expect(screen.getByLabelText("Route")).toHaveValue("all");
});

it("combines the route filter with search", async () => {
  vi.mocked(getStudents).mockResolvedValue([LINA, HADI, { ...HADI, id: "st-3", firstName: "Hana" }]);
  vi.mocked(getRouteAssignments).mockResolvedValue(routeData([[HADI.id, ON_HAMRA], ["st-3", ON_HAMRA]]));
  await renderLoaded();

  fireEvent.change(screen.getByLabelText("Route"), { target: { value: HAMRA_ROUTE.id } });
  expect(screen.getByText("Hana Rizk")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Hadi" } });

  await waitFor(() => expect(screen.queryByText("Hana Rizk")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
  expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument();
});

it("keeps the route filter disabled and the rows without a route line while routes load", async () => {
  vi.mocked(getRouteAssignments).mockReturnValue(new Promise(() => {}));
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  const select = screen.getByLabelText("Route");
  expect(select).toBeDisabled();
  expect(select).toHaveAccessibleDescription("Loading routes…");
  expect(screen.getByText("Loading routes…")).toHaveAttribute("role", "status");
  expect(within(row("Lina Daher")).queryByText("No route")).not.toBeInTheDocument();
});

it("says so when there are no routes yet", async () => {
  vi.mocked(getRouteAssignments).mockResolvedValue({ routes: [], byStudent: new Map() });
  await renderLoaded();

  expect(screen.getByLabelText("Route")).toHaveAccessibleDescription("No routes yet.");
  expect(within(row("Lina Daher")).getByText("No route")).toBeInTheDocument();
});

it("keeps the roster working, announces the failure and offers a retry when routes fail", async () => {
  vi.mocked(getRouteAssignments).mockRejectedValueOnce(new Error("down"));
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load routes.");
  const select = screen.getByLabelText("Route");
  expect(select).toBeDisabled();
  expect(select).toHaveAccessibleDescription(expect.stringContaining("Couldn't load routes."));
  // Unknown, not "No route": the data didn't load.
  expect(within(row("Hadi Rizk")).queryByText("No route")).not.toBeInTheDocument();

  const retry = screen.getByRole("button", { name: "Retry routes" });
  retry.focus();
  fireEvent.click(retry);

  await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());
  expect(screen.getByLabelText("Route")).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Retry routes" })).not.toBeInTheDocument();
  expect(within(row("Hadi Rizk")).getByText("Route: Hamra morning run")).toBeInTheDocument();
});

it("keeps focus on Retry and announces again when the retry fails too", async () => {
  let rejectRetry: (error: Error) => void = () => {};
  vi.mocked(getRouteAssignments)
    .mockRejectedValueOnce(new Error("down"))
    .mockReturnValueOnce(new Promise((_, reject) => { rejectRetry = reject; }));
  render(<StudentsPage />);
  await screen.findByRole("alert");

  const retry = screen.getByRole("button", { name: "Retry routes" });
  retry.focus();
  fireEvent.click(retry);

  const retrying = await screen.findByRole("button", { name: "Retrying…" });
  expect(retrying).toBe(retry);
  expect(retrying).toHaveAttribute("aria-disabled", "true");
  expect(retrying).toHaveFocus();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(retrying);
  expect(getRouteAssignments).toHaveBeenCalledTimes(2);

  rejectRetry(new Error("still down"));

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load routes.");
  expect(screen.getByRole("button", { name: "Retry routes" })).toHaveFocus();
});

it("still filters by search, status and grade as before", async () => {
  vi.mocked(getStudents).mockResolvedValue([
    LINA,
    { ...HADI, grade: "Grade 5" },
    { ...LINA, id: "st-3", firstName: "Maya", lastName: "Saad", status: "inactive", guardianName: "Nadia Saad" },
  ]);
  await renderLoaded();

  fireEvent.click(screen.getByRole("button", { name: "Archived" }));
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Maya Saad")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Archived" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "All" }));
  fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "Grade 5" } });
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
  expect(screen.queryByText("Maya Saad")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "all" } });
  // Search matches the guardian's name too.
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Nadia" } });
  await waitFor(() => expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument());
  expect(screen.getByText("Maya Saad")).toBeInTheDocument();
  expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument();
});

it("still filters by search, status and grade when the routes fail", async () => {
  vi.mocked(getRouteAssignments).mockRejectedValue(new Error("down"));
  vi.mocked(getStudents).mockResolvedValue([LINA, { ...HADI, status: "inactive" }]);
  render(<StudentsPage />);
  await screen.findByRole("alert");

  fireEvent.click(screen.getByRole("button", { name: "Archived" }));
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "All" }));
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Lina" } });
  await waitFor(() => expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument());
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
});

it("shows the linked parent's email and account status on each row", async () => {
  vi.mocked(getStudents).mockResolvedValue([
    { ...LINA, parentUserId: REVOKED_PARENT.id },
    { ...HADI, parentUserId: RAMI_PARENT.id },
  ]);
  render(<StudentsPage />);
  await screen.findByText("Hadi Rizk");

  expect(
    await within(row("Hadi Rizk")).findByText("Parent account: rami@example.com (active). Manage in Edit pickup details."),
  ).toBeInTheDocument();
  expect(
    within(row("Lina Daher")).getByText("Parent account: nour@example.com (revoked). Manage in Edit pickup details."),
  ).toBeInTheDocument();
  expect(getParents).toHaveBeenCalledTimes(1);
});

it("says 'Not assigned' for a student with no parent once the parents load", async () => {
  vi.mocked(getStudents).mockResolvedValue([LINA, { ...HADI, parentUserId: RAMI_PARENT.id }]);
  render(<StudentsPage />);
  await screen.findByText("Hadi Rizk");

  await within(row("Hadi Rizk")).findByText(/rami@example\.com/);
  expect(
    within(row("Lina Daher")).getByText("Parent account: Not assigned. Manage in Edit pickup details."),
  ).toBeInTheDocument();
});

it("falls back to 'Linked'/'Not assigned' and keeps the roster and routes when the parents fail", async () => {
  vi.mocked(getParents).mockRejectedValue(new Error("down"));
  vi.mocked(getStudents).mockResolvedValue([LINA, { ...HADI, parentUserId: RAMI_PARENT.id }]);
  await renderLoaded();

  await waitFor(() => expect(getParents).toHaveBeenCalled());
  expect(
    within(row("Hadi Rizk")).getByText("Parent account: Linked. Manage in Edit pickup details."),
  ).toBeInTheDocument();
  expect(
    within(row("Lina Daher")).getByText("Parent account: Not assigned. Manage in Edit pickup details."),
  ).toBeInTheDocument();
  expect(within(row("Hadi Rizk")).getByText("Route: Hamra morning run")).toBeInTheDocument();
  expect(within(row("Lina Daher")).getByText("No route")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText(/rami@example\.com/)).not.toBeInTheDocument();
});

it("refreshes the roster in the background after an address request is approved, without showing the loading skeleton", async () => {
  let resolveReload: (students: Student[]) => void = () => {};
  vi.mocked(getStudents)
    .mockResolvedValueOnce([LINA, HADI])
    .mockReturnValueOnce(new Promise((resolve) => { resolveReload = resolve; }));
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  fireEvent.click(screen.getByRole("button", { name: "Simulate address approval" }));

  // The reload is in flight: the roster stays as it was, no skeleton.
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
  expect(screen.queryByText("Loading students…")).not.toBeInTheDocument();

  resolveReload([{ ...LINA, address: "Verdun, Beirut" }, HADI]);

  await waitFor(() => expect(getStudents).toHaveBeenCalledTimes(2));
  expect(await within(row("Lina Daher")).findByText("Pickup address: Verdun, Beirut")).toBeInTheDocument();
});

it("keeps showing the roster and gives a toast notice if the background refresh after an approval fails", async () => {
  vi.mocked(getStudents)
    .mockResolvedValueOnce([LINA, HADI])
    .mockRejectedValueOnce(new Error("down"));
  render(<StudentsPage />);
  await screen.findByText("Lina Daher");

  fireEvent.click(screen.getByRole("button", { name: "Simulate address approval" }));

  await waitFor(() => expect(getStudents).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  const toast = await screen.findByText("Couldn't refresh the roster after the approval. Please reload the page.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

it("clears an earlier roster load error once the background refresh after an approval succeeds", async () => {
  vi.mocked(getStudents)
    .mockRejectedValueOnce(new Error("down"))
    .mockResolvedValueOnce([LINA, HADI]);
  render(<StudentsPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load students. Please try again.");

  fireEvent.click(screen.getByRole("button", { name: "Simulate address approval" }));

  await waitFor(() => expect(getStudents).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
});

it("says 'Linked' when the linked parent isn't in the parents list", async () => {
  vi.mocked(getStudents).mockResolvedValue([{ ...LINA, parentUserId: "p-unknown" }, HADI]);
  await renderLoaded();

  await waitFor(() => expect(getParents).toHaveBeenCalled());
  expect(
    within(row("Lina Daher")).getByText("Parent account: Linked. Manage in Edit pickup details."),
  ).toBeInTheDocument();
  expect(within(row("Hadi Rizk")).getByText("Route: Hamra morning run")).toBeInTheDocument();
});

// --- SCRUM-287: pause/archive/resume/restore and best-route placement -----
// StudentStatusControl and BestRoutePanel call the real roster API, so these
// stub fetch directly rather than mocking @/lib/api/roster.

it("pauses a routed student in place: Paused, No route, and no roster reload", async () => {
  const fetchMock = stubFetch(jsonResponse(200, { ...HADI, status: "paused" }));
  await renderLoaded();

  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Pause Hadi Rizk" }));
  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Confirm pause Hadi Rizk" }));

  await waitFor(() => expect(within(row("Hadi Rizk")).getByText("Paused")).toBeInTheDocument());
  expect(within(row("Hadi Rizk")).getByText("No route")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(getStudents).toHaveBeenCalledTimes(1);
});

it("archives a routed student in place: Archived, No route, and only a Restore button", async () => {
  stubFetch(jsonResponse(200, { ...HADI, status: "inactive" }));
  await renderLoaded();

  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Archive Hadi Rizk" }));
  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Confirm archive Hadi Rizk" }));

  await waitFor(() => expect(within(row("Hadi Rizk")).getByText("Archived")).toBeInTheDocument());
  expect(within(row("Hadi Rizk")).getByText("No route")).toBeInTheDocument();
  expect(within(row("Hadi Rizk")).getByRole("button", { name: "Restore Hadi Rizk" })).toBeInTheDocument();
  expect(within(row("Hadi Rizk")).queryByRole("button", { name: "Pause Hadi Rizk" })).not.toBeInTheDocument();
});

it("resumes a paused student back to active, with no route", async () => {
  vi.mocked(getStudents).mockResolvedValue([{ ...LINA, status: "paused" }, HADI]);
  stubFetch(jsonResponse(200, { ...LINA, status: "active" }));
  await renderLoaded();

  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Resume Lina Daher" }));

  await waitFor(() => expect(within(row("Lina Daher")).getByText("Active")).toBeInTheDocument());
  expect(within(row("Lina Daher")).getByText("No route")).toBeInTheDocument();
});

it("restores an archived student back to active", async () => {
  vi.mocked(getStudents).mockResolvedValue([{ ...LINA, status: "inactive" }, HADI]);
  stubFetch(jsonResponse(200, { ...LINA, status: "active" }));
  await renderLoaded();

  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Restore Lina Daher" }));

  await waitFor(() => expect(within(row("Lina Daher")).getByText("Active")).toBeInTheDocument());
});

it("hides a student from the current status filter once they change, and announces it", async () => {
  stubFetch(jsonResponse(200, { ...HADI, status: "paused" }));
  await renderLoaded();

  fireEvent.click(screen.getByRole("button", { name: "Active" }));
  await screen.findByText("Hadi Rizk");

  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Pause Hadi Rizk" }));
  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Confirm pause Hadi Rizk" }));

  await waitFor(() => expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk is now Paused and is hidden by the current filter.")).toHaveAttribute(
    "role",
    "status",
  );
  // The row that had focus is gone: focus is on the selected status filter, not <body>.
  const statusFilters = screen.getByRole("group", { name: "Filter by status" });
  await waitFor(() => expect(within(statusFilters).getByRole("button", { name: "Active" })).toHaveFocus());
});

it("leaves focus in the row when the student still matches the filter", async () => {
  stubFetch(jsonResponse(200, { ...HADI, status: "paused" }));
  await renderLoaded();

  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Pause Hadi Rizk" }));
  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Confirm pause Hadi Rizk" }));

  await waitFor(() => expect(within(row("Hadi Rizk")).getByRole("button", { name: "Resume Hadi Rizk" })).toHaveFocus());
  expect(screen.queryByText(/is hidden by the current filter/)).not.toBeInTheDocument();
});

it("keeps the old status and shows the bus-today 409 message, leaving the route line untouched", async () => {
  const busToday = "Hadi Rizk is on Hamra morning run (A 123456 07:10). Move them after the run ends.";
  stubFetch(jsonResponse(409, { status: 409, detail: busToday }));
  await renderLoaded();

  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Pause Hadi Rizk" }));
  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Confirm pause Hadi Rizk" }));

  expect(await within(row("Hadi Rizk")).findByRole("alert")).toHaveTextContent(busToday);
  expect(within(row("Hadi Rizk")).getByText("Active")).toBeInTheDocument();
  expect(within(row("Hadi Rizk")).getByText("Route: Hamra morning run")).toBeInTheDocument();
});

it("returns focus to the Pause button after Cancel", async () => {
  await renderLoaded();

  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Pause Hadi Rizk" }));
  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Cancel" }));

  expect(within(row("Hadi Rizk")).getByRole("button", { name: "Pause Hadi Rizk" })).toHaveFocus();
});

it("offers Find a route only for an active, pinned student with no route", async () => {
  await renderLoaded();

  // Lina: active, no route, but unpinned.
  expect(within(row("Lina Daher")).queryByRole("button", { name: "Find a route" })).not.toBeInTheDocument();
  expect(within(row("Lina Daher")).getByText("Set a pin to find a route")).toBeInTheDocument();

  // Hadi: active and pinned, but already on a route.
  expect(within(row("Hadi Rizk")).queryByRole("button", { name: "Find a route" })).not.toBeInTheDocument();
});

it("shows Find a route for an active, pinned student with no route", async () => {
  vi.mocked(getStudents).mockResolvedValue([NORA]);
  vi.mocked(getRouteAssignments).mockResolvedValue({ routes: [HAMRA_ROUTE, VERDUN_ROUTE], byStudent: new Map() });
  render(<StudentsPage />);
  await screen.findByText("Nora Fakhoury");
  await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());

  expect(screen.getByRole("button", { name: "Find a route" })).toBeInTheDocument();
});

it("does not offer Find a route for a paused student, even when pinned and unrouted", async () => {
  vi.mocked(getStudents).mockResolvedValue([{ ...NORA, status: "paused" }]);
  vi.mocked(getRouteAssignments).mockResolvedValue({ routes: [HAMRA_ROUTE, VERDUN_ROUTE], byStudent: new Map() });
  render(<StudentsPage />);
  await screen.findByText("Nora Fakhoury");
  await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());

  expect(screen.queryByRole("button", { name: "Find a route" })).not.toBeInTheDocument();
});

// Nora's best-route answer (GET) and her placement on Hamra (POST).
const NORA_RECOMMENDED = {
  routeId: HAMRA_ROUTE.id,
  routeName: HAMRA_ROUTE.name,
  position: 1,
  extraMinutes: 2,
  arrivalTime: "07:15",
  seatsLeft: 3,
};
const NORA_BEST_ROUTE = { studentId: NORA.id, recommended: NORA_RECOMMENDED, options: [NORA_RECOMMENDED], skipped: [] };
const NORA_PLACED_ROUTE = {
  id: HAMRA_ROUTE.id,
  name: HAMRA_ROUTE.name,
  vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 12 },
  driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
  studentCount: 1,
  seatsLeft: 2,
  school: { latitude: 33.8938, longitude: 35.5018, arrivalTime: "07:30" },
  stops: [
    {
      studentId: NORA.id,
      position: 1,
      firstName: NORA.firstName,
      lastName: NORA.lastName,
      address: NORA.address,
      latitude: NORA.latitude,
      longitude: NORA.longitude,
      arrivalTime: "07:15",
    },
  ],
};
const NORA_PLACEMENT = { position: 1, extraMinutes: 2, arrivalTime: "07:15", route: NORA_PLACED_ROUTE };

it("places a student on the best route: updates the route line and filter, and toasts, without a reload", async () => {
  vi.mocked(getStudents).mockResolvedValue([NORA]);
  vi.mocked(getRouteAssignments).mockResolvedValue({ routes: [HAMRA_ROUTE, VERDUN_ROUTE], byStudent: new Map() });

  stubFetch(jsonResponse(200, NORA_BEST_ROUTE), jsonResponse(201, NORA_PLACEMENT));

  render(<StudentsPage />);
  await screen.findByText("Nora Fakhoury");
  await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());

  fireEvent.click(screen.getByRole("button", { name: "Find a route" }));
  const placeButton = await screen.findByRole("button", { name: `Place on ${HAMRA_ROUTE.name}` });
  fireEvent.click(placeButton);

  await waitFor(() => expect(within(row("Nora Fakhoury")).getByText(`Route: ${HAMRA_ROUTE.name}`)).toBeInTheDocument());
  const toast = await screen.findByText(`Placed on ${HAMRA_ROUTE.name} as stop 1, pickup 07:15.`);
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
  expect(getStudents).toHaveBeenCalledTimes(1);

  // The route filter is consistent with the placement: filtering by Hamra still shows her.
  fireEvent.change(screen.getByLabelText("Route"), { target: { value: HAMRA_ROUTE.id } });
  expect(screen.getByText("Nora Fakhoury")).toBeInTheDocument();
});

// A promise the test settles when it wants, to hold a request in flight.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it("takes a paused student off the route that loaded while the PUT was in flight", async () => {
  const routes = deferred<RouteAssignments>();
  vi.mocked(getRouteAssignments).mockReturnValue(routes.promise);
  const put = deferred<Response>();
  stubFetch(put.promise);
  render(<StudentsPage />);
  await screen.findByText("Hadi Rizk");

  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Pause Hadi Rizk" }));
  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Confirm pause Hadi Rizk" }));

  // The routes arrive first, still listing Hadi on Hamra.
  routes.resolve(routeData());
  await waitFor(() => expect(within(row("Hadi Rizk")).getByText("Route: Hamra morning run")).toBeInTheDocument());

  put.resolve(jsonResponse(200, { ...HADI, status: "paused" }));

  await waitFor(() => expect(within(row("Hadi Rizk")).getByText("Paused")).toBeInTheDocument());
  expect(within(row("Hadi Rizk")).getByText("No route")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Route"), { target: { value: HAMRA_ROUTE.id } });
  await waitFor(() => expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument());
});

it("keeps a placement on another row that lands together with a status change", async () => {
  vi.mocked(getStudents).mockResolvedValue([HADI, NORA]);
  const put = deferred<Response>();
  const post = deferred<Response>();
  stubFetch(jsonResponse(200, NORA_BEST_ROUTE), put.promise, post.promise);
  render(<StudentsPage />);
  await screen.findByText("Nora Fakhoury");
  await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());

  fireEvent.click(within(row("Nora Fakhoury")).getByRole("button", { name: "Find a route" }));
  const placeButton = await screen.findByRole("button", { name: `Place on ${HAMRA_ROUTE.name}` });

  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Pause Hadi Rizk" }));
  fireEvent.click(within(row("Hadi Rizk")).getByRole("button", { name: "Confirm pause Hadi Rizk" }));
  fireEvent.click(placeButton);

  // The placement lands, then the pause answer right behind it.
  post.resolve(jsonResponse(201, NORA_PLACEMENT));
  put.resolve(jsonResponse(200, { ...HADI, status: "paused" }));

  await waitFor(() => expect(within(row("Hadi Rizk")).getByText("Paused")).toBeInTheDocument());
  await waitFor(() => expect(within(row("Nora Fakhoury")).getByText(`Route: ${HAMRA_ROUTE.name}`)).toBeInTheDocument());
  expect(within(row("Hadi Rizk")).getByText("No route")).toBeInTheDocument();
});

it("closes the best-route panel when the student is paused from the same row, and resuming doesn't reopen it", async () => {
  vi.mocked(getStudents).mockResolvedValue([NORA]);
  vi.mocked(getRouteAssignments).mockResolvedValue({ routes: [HAMRA_ROUTE, VERDUN_ROUTE], byStudent: new Map() });
  stubFetch(
    jsonResponse(200, NORA_BEST_ROUTE),
    jsonResponse(200, { ...NORA, status: "paused" }),
    jsonResponse(200, NORA),
  );
  render(<StudentsPage />);
  await screen.findByText("Nora Fakhoury");
  await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());

  fireEvent.click(screen.getByRole("button", { name: "Find a route" }));
  await screen.findByRole("button", { name: `Place on ${HAMRA_ROUTE.name}` });

  fireEvent.click(screen.getByRole("button", { name: "Pause Nora Fakhoury" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm pause Nora Fakhoury" }));

  await waitFor(() => expect(within(row("Nora Fakhoury")).getByText("Paused")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: `Place on ${HAMRA_ROUTE.name}` })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Best route for Nora Fakhoury" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Hide best route|Find a route/ })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Resume Nora Fakhoury" })).toHaveFocus());

  fireEvent.click(screen.getByRole("button", { name: "Resume Nora Fakhoury" }));

  const findRoute = await screen.findByRole("button", { name: "Find a route" });
  expect(findRoute).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("heading", { name: "Best route for Nora Fakhoury" })).not.toBeInTheDocument();
});

