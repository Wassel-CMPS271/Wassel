import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getRouteAssignments, type RouteAssignment, type RouteAssignments } from "@/lib/api/routes";
import { getStudents, setStudentLocation, updateStudentAddress, type Student } from "@/lib/api/students";
import StudentsPage from "./page";

vi.mock("@/lib/api/students", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/students")>()),
  getStudents: vi.fn(),
  updateStudentAddress: vi.fn(),
  setStudentLocation: vi.fn(),
}));

vi.mock("@/lib/api/routes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/routes")>()),
  getRouteAssignments: vi.fn(),
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

const HAMRA_ROUTE = { id: "route-1", name: "Hamra morning run" };
const VERDUN_ROUTE = { id: "route-2", name: "Verdun morning run" };
const ON_HAMRA: RouteAssignment = { routeId: HAMRA_ROUTE.id, routeName: HAMRA_ROUTE.name };

function routeData(byStudent: [string, RouteAssignment][] = [[HADI.id, ON_HAMRA]]): RouteAssignments {
  return { routes: [HAMRA_ROUTE, VERDUN_ROUTE], byStudent: new Map(byStudent) };
}

beforeEach(() => {
  vi.mocked(getStudents).mockReset().mockResolvedValue([LINA, HADI]);
  vi.mocked(updateStudentAddress).mockReset();
  vi.mocked(setStudentLocation).mockReset();
  vi.mocked(getRouteAssignments).mockReset().mockResolvedValue(routeData());
});

afterEach(() => {
  cleanup();
});

function row(name: string) {
  return screen.getByText(name).closest("li")!;
}

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

  fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Maya Saad")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Inactive" })).toHaveAttribute("aria-pressed", "true");

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

  fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "All" }));
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Lina" } });
  await waitFor(() => expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument());
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
});
