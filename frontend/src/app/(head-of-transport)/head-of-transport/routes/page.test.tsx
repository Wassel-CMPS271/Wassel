import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoute, listRoutes, updateRoute, type RouteSummary } from "@/lib/api/routes";
import RoutesPage from "./page";

vi.mock("@/lib/api/routes", () => ({
  listRoutes: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
}));

vi.mock("@/lib/api/vehicles", () => ({
  getVehicles: vi.fn().mockResolvedValue([
    { id: "v-1", plateNumber: "D 456789", capacity: 10, isActive: true, createdAt: "" },
  ]),
}));

vi.mock("@/lib/api/drivers", () => ({
  getDrivers: vi.fn().mockResolvedValue([
    {
      id: "d-1",
      firstName: "Rania",
      lastName: "Khalil",
      phone: "",
      email: "",
      status: "active",
      invitedAt: "",
      assignedVehicleId: null,
    },
  ]),
}));

const HAMRA: RouteSummary = {
  id: "r-1",
  name: "Hamra morning run",
  vehicle: { id: "v-9", plateNumber: "A 123456", capacity: 14 },
  driver: { id: "d-9", firstName: "Karim", lastName: "Haddad" },
  studentCount: 12,
  seatsLeft: 2,
};

beforeEach(() => {
  vi.mocked(listRoutes).mockReset();
  vi.mocked(createRoute).mockReset();
  vi.mocked(updateRoute).mockReset();
});

afterEach(() => {
  cleanup();
});

it("shows a loading status while the routes load", () => {
  vi.mocked(listRoutes).mockReturnValue(new Promise(() => {}));
  render(<RoutesPage />);

  expect(screen.getByText("Loading routes…")).toHaveAttribute("role", "status");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows the empty state when there are no routes", async () => {
  vi.mocked(listRoutes).mockResolvedValue([]);
  render(<RoutesPage />);

  expect(await screen.findByText("No routes yet")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows an error with a retry when the routes fail to load", async () => {
  vi.mocked(listRoutes).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([HAMRA]);
  render(<RoutesPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load routes. Please try again.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByRole("heading", { name: "Hamra morning run" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(listRoutes).toHaveBeenCalledTimes(2);
});

it("shows each route's name, vehicle, driver, student count and seats left", async () => {
  vi.mocked(listRoutes).mockResolvedValue([HAMRA]);
  render(<RoutesPage />);

  const row = (await screen.findByRole("heading", { name: "Hamra morning run" })).closest("li")!;
  expect(within(row).getByText("A 123456")).toBeInTheDocument();
  expect(within(row).getByText("Karim Haddad")).toBeInTheDocument();
  expect(within(row).getByText("12 students")).toBeInTheDocument();
  expect(within(row).getByText("2 seats left")).toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "Edit Hamra morning run" })).toBeInTheDocument();
});

it("warns when a route is over capacity, without an alert", async () => {
  vi.mocked(listRoutes).mockResolvedValue([
    { ...HAMRA, studentCount: 1, seatsLeft: 1 },
    { ...HAMRA, id: "r-2", name: "Achrafieh morning run", studentCount: 17, seatsLeft: -3 },
  ]);
  render(<RoutesPage />);

  const row = (await screen.findByRole("heading", { name: "Achrafieh morning run" })).closest("li")!;
  expect(within(row).getByText("Over capacity by 3 seats")).toBeInTheDocument();
  expect(within(row).queryByText(/seats? left/)).not.toBeInTheDocument();
  expect(screen.getByText("1 seat left")).toBeInTheDocument();
  expect(screen.getByText("1 student")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("adds a created route to the list and announces it", async () => {
  vi.mocked(listRoutes).mockResolvedValue([]);
  vi.mocked(createRoute).mockResolvedValue({
    ...HAMRA,
    id: "r-new",
    name: "Ras Beirut run",
    school: { latitude: 0, longitude: 0, arrivalTime: null },
    stops: [],
  });
  render(<RoutesPage />);
  await screen.findByText("No routes yet");

  fireEvent.click(screen.getByRole("button", { name: "Create route" }));
  const dialog = await screen.findByRole("dialog", { name: "Create route" });
  await within(dialog).findByRole("option", { name: "D 456789" });
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Ras Beirut run" } });
  fireEvent.change(within(dialog).getByLabelText("Vehicle"), { target: { value: "v-1" } });
  fireEvent.change(within(dialog).getByLabelText("Driver"), { target: { value: "d-1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));

  expect(await screen.findByRole("heading", { name: "Ras Beirut run" })).toBeInTheDocument();
  expect(createRoute).toHaveBeenCalledWith({ name: "Ras Beirut run", vehicleId: "v-1", driverId: "d-1" });
  expect(await screen.findByText("Ras Beirut run created.")).toBeInTheDocument();
  expect(screen.getByText("Ras Beirut run created.").closest('[role="status"]')).toBeInTheDocument();
});

it("keeps Create disabled while the routes load and after they fail to load", async () => {
  let rejectList!: (error: Error) => void;
  vi.mocked(listRoutes).mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectList = reject;
    }),
  );
  render(<RoutesPage />);

  const create = screen.getByRole("button", { name: "Create route" });
  expect(create).toBeDisabled();
  fireEvent.click(create);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await act(async () => rejectList(new Error("down")));

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load routes. Please try again.");
  expect(screen.getByRole("button", { name: "Create route" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Create route" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(createRoute).not.toHaveBeenCalled();
});

it("saves an edited route, updates its row and announces it", async () => {
  vi.mocked(listRoutes).mockResolvedValue([HAMRA]);
  vi.mocked(updateRoute).mockResolvedValue({
    ...HAMRA,
    name: "Hamra early run",
    vehicle: { id: "v-1", plateNumber: "D 456789", capacity: 10 },
    seatsLeft: -2,
    school: { latitude: 0, longitude: 0, arrivalTime: null },
    stops: [],
  });
  render(<RoutesPage />);
  await screen.findByRole("heading", { name: "Hamra morning run" });

  fireEvent.click(screen.getByRole("button", { name: "Edit Hamra morning run" }));
  const dialog = await screen.findByRole("dialog", { name: "Edit route" });
  await within(dialog).findByRole("option", { name: "D 456789" });
  expect(within(dialog).getByLabelText("Name")).toHaveValue("Hamra morning run");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Hamra early run" } });
  fireEvent.change(within(dialog).getByLabelText("Vehicle"), { target: { value: "v-1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const row = screen.getByRole("heading", { name: "Hamra early run" }).closest("li")!;
  expect(updateRoute).toHaveBeenCalledWith("r-1", {
    name: "Hamra early run",
    vehicleId: "v-1",
    driverId: "d-9",
  });
  expect(within(row).getByText("D 456789")).toBeInTheDocument();
  expect(within(row).getByText("Over capacity by 2 seats")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Hamra morning run" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(await screen.findByText("Hamra early run saved.")).toBeInTheDocument();
  expect(screen.getByText("Hamra early run saved.").closest('[role="status"]')).toBeInTheDocument();
});
