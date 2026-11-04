import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  addVehicle,
  deactivateVehicle,
  getVehicles,
  reactivateVehicle,
  setVehicleCapacity,
  type Vehicle,
} from "@/lib/api/vehicles";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import VehiclesPage from "./page";

vi.mock("@/lib/api/vehicles", () => ({
  getVehicles: vi.fn(),
  addVehicle: vi.fn(),
  setVehicleCapacity: vi.fn(),
  deactivateVehicle: vi.fn(),
  reactivateVehicle: vi.fn(),
}));

const CAR: Vehicle = { id: "v-1", plateNumber: "A 123456", capacity: 12, isActive: true, createdAt: "" };

beforeEach(() => {
  vi.mocked(getVehicles).mockReset();
  vi.mocked(addVehicle).mockReset();
  vi.mocked(setVehicleCapacity).mockReset();
  vi.mocked(deactivateVehicle).mockReset();
  vi.mocked(reactivateVehicle).mockReset();
});

afterEach(() => {
  cleanup();
});

function fillAddForm(plateNumber: string, capacity: string) {
  fireEvent.change(screen.getByLabelText("Plate number"), { target: { value: plateNumber } });
  fireEvent.change(screen.getByLabelText("Capacity"), { target: { value: capacity } });
  fireEvent.click(screen.getByRole("button", { name: "Add vehicle" }));
}

function row(plateNumber: string) {
  return screen.getByText(plateNumber).closest("li")!;
}

it("shows a loading status while the vehicles load", () => {
  vi.mocked(getVehicles).mockReturnValue(new Promise(() => {}));
  render(<VehiclesPage />);

  expect(screen.getByText("Loading vehicles…")).toHaveAttribute("role", "status");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows the empty state when there are no vehicles", async () => {
  vi.mocked(getVehicles).mockResolvedValue([]);
  render(<VehiclesPage />);

  expect(await screen.findByText("No vehicles yet")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows an error when the vehicles fail to load", async () => {
  vi.mocked(getVehicles).mockRejectedValue(new Error("down"));
  render(<VehiclesPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load vehicles. Please try again.");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

// BUG (SCRUM-223): the alert says "Please try again" but the page has no
// retry control and never calls getVehicles() again; only a full page reload
// recovers. The routes, school times and calendar pages do have a working
// "Try again". To reproduce: make getVehicles() reject once, render
// VehiclesPage, and look for any control that reloads the list: there is none.
it.skip("shows an error with a retry when the vehicles fail to load", async () => {
  vi.mocked(getVehicles).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([CAR]);
  render(<VehiclesPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load vehicles. Please try again.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("A 123456")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getVehicles).toHaveBeenCalledTimes(2);
});

it("adds a vehicle to the list, resets the form and confirms it", async () => {
  vi.mocked(getVehicles).mockResolvedValue([]);
  vi.mocked(addVehicle).mockResolvedValue(CAR);
  render(<VehiclesPage />);
  await screen.findByText("No vehicles yet");

  fillAddForm("A 123456", "12");

  expect(await screen.findByText("A 123456")).toBeInTheDocument();
  expect(addVehicle).toHaveBeenCalledWith({ plateNumber: "A 123456", capacity: 12 });
  expect(screen.getByLabelText("Plate number")).toHaveValue("");
  expect(screen.getByLabelText("Capacity")).toHaveValue(null);
  const toast = await screen.findByText("A 123456 added to your fleet.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

it("shows the backend's duplicate plate error next to the plate field and leaves the list unchanged", async () => {
  vi.mocked(getVehicles).mockResolvedValue([]);
  vi.mocked(addVehicle).mockRejectedValue(
    new ApiValidationError({ plateNumber: "A vehicle with that plate number already exists." }),
  );
  render(<VehiclesPage />);
  await screen.findByText("No vehicles yet");

  fillAddForm("A 123456", "12");

  const plateInput = await screen.findByLabelText("Plate number");
  await waitFor(() =>
    expect(plateInput).toHaveAccessibleDescription("A vehicle with that plate number already exists."),
  );
  expect(plateInput).toHaveAttribute("aria-invalid", "true");
  expect(plateInput).toHaveValue("A 123456");
  expect(screen.getByText("No vehicles yet")).toBeInTheDocument();
});

// BUG (SCRUM-223): an expired session shows "Request failed" instead of a
// sign-in message. The backend answers a 401 with an empty body
// (HttpStatusEntryPoint), so ApiError's message is the fallback "Request
// failed", and AddVehicleForm shows any status < 500 as error.message. The
// capacity editor and the drivers page's assign/unassign/resend do the same
// (AddDriverForm handles 401 itself). To reproduce: sign in, open Vehicles,
// let the session cookie expire (or delete wassel_token), add a vehicle.
it.skip("tells the user to sign in again when the session has expired", async () => {
  vi.mocked(getVehicles).mockResolvedValue([]);
  vi.mocked(addVehicle).mockRejectedValue(new ApiError(401));
  render(<VehiclesPage />);
  await screen.findByText("No vehicles yet");

  fillAddForm("A 123456", "12");

  expect(await screen.findByRole("alert")).toHaveTextContent(/sign in again/i);
});

it("edits a vehicle's capacity and confirms it", async () => {
  vi.mocked(getVehicles).mockResolvedValue([CAR]);
  vi.mocked(setVehicleCapacity).mockResolvedValue({ ...CAR, capacity: 20 });
  render(<VehiclesPage />);
  await screen.findByText(CAR.plateNumber);

  const vehicleRow = row(CAR.plateNumber);
  fireEvent.click(within(vehicleRow).getByRole("button", { name: `Edit capacity for ${CAR.plateNumber}` }));
  fireEvent.change(within(vehicleRow).getByLabelText("Capacity"), { target: { value: "20" } });
  fireEvent.click(within(vehicleRow).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(within(vehicleRow).getByText("Capacity: 20")).toBeInTheDocument());
  expect(setVehicleCapacity).toHaveBeenCalledWith("v-1", 20);
  const toast = await screen.findByText(`Capacity updated for ${CAR.plateNumber}.`);
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

it("shows a backend validation error when editing capacity fails, keeping the row editable", async () => {
  vi.mocked(getVehicles).mockResolvedValue([CAR]);
  vi.mocked(setVehicleCapacity).mockRejectedValue(
    new ApiValidationError({ capacity: "Capacity must be a positive whole number." }),
  );
  render(<VehiclesPage />);
  await screen.findByText(CAR.plateNumber);

  const vehicleRow = row(CAR.plateNumber);
  fireEvent.click(within(vehicleRow).getByRole("button", { name: `Edit capacity for ${CAR.plateNumber}` }));
  fireEvent.change(within(vehicleRow).getByLabelText("Capacity"), { target: { value: "99" } });
  fireEvent.click(within(vehicleRow).getByRole("button", { name: "Save" }));

  const capacityInput = await within(vehicleRow).findByLabelText("Capacity");
  expect(capacityInput).toHaveAccessibleDescription("Capacity must be a positive whole number.");
  expect(capacityInput).toHaveAttribute("aria-invalid", "true");
  expect(within(vehicleRow).getByRole("button", { name: "Save" })).toBeInTheDocument();
});

it("deactivates a vehicle after confirming, and announces it", async () => {
  vi.mocked(getVehicles).mockResolvedValue([CAR]);
  vi.mocked(deactivateVehicle).mockResolvedValue({ ...CAR, isActive: false });
  render(<VehiclesPage />);
  await screen.findByText(CAR.plateNumber);

  fireEvent.click(screen.getByRole("button", { name: `Deactivate ${CAR.plateNumber}` }));
  fireEvent.click(screen.getByRole("button", { name: `Confirm deactivate ${CAR.plateNumber}` }));

  expect(await screen.findByText("Inactive")).toBeInTheDocument();
  expect(deactivateVehicle).toHaveBeenCalledWith("v-1");
  const toast = await screen.findByText(`${CAR.plateNumber} deactivated.`);
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

it("does not deactivate a vehicle when the confirmation is cancelled", async () => {
  vi.mocked(getVehicles).mockResolvedValue([CAR]);
  render(<VehiclesPage />);
  await screen.findByText(CAR.plateNumber);

  fireEvent.click(screen.getByRole("button", { name: `Deactivate ${CAR.plateNumber}` }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(deactivateVehicle).not.toHaveBeenCalled();
});

it("reactivates a vehicle and announces it", async () => {
  const inactiveCar: Vehicle = { ...CAR, isActive: false };
  vi.mocked(getVehicles).mockResolvedValue([inactiveCar]);
  vi.mocked(reactivateVehicle).mockResolvedValue(CAR);
  render(<VehiclesPage />);
  await screen.findByText(CAR.plateNumber);

  fireEvent.click(screen.getByRole("button", { name: `Reactivate ${CAR.plateNumber}` }));

  expect(await screen.findByText("Active")).toBeInTheDocument();
  expect(reactivateVehicle).toHaveBeenCalledWith("v-1");
  const toast = await screen.findByText(`${CAR.plateNumber} reactivated.`);
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});
