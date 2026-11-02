import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  addDriver,
  assignDriverToVehicle,
  getDrivers,
  resendInvite,
  restoreDriver,
  revokeDriver,
  unassignDriver,
  type Driver,
} from "@/lib/api/drivers";
import { getVehicles, type Vehicle } from "@/lib/api/vehicles";
import { ApiValidationError } from "@/lib/api/errors";
import DriversPage from "./page";

vi.mock("@/lib/api/drivers", () => ({
  getDrivers: vi.fn(),
  addDriver: vi.fn(),
  resendInvite: vi.fn(),
  revokeDriver: vi.fn(),
  restoreDriver: vi.fn(),
  assignDriverToVehicle: vi.fn(),
  unassignDriver: vi.fn(),
}));

vi.mock("@/lib/api/vehicles", () => ({
  getVehicles: vi.fn(),
}));

const INVITED_DRIVER: Driver = {
  id: "d-1",
  firstName: "Ahmad",
  lastName: "Khalil",
  phone: "+961 3 123 456",
  email: "ahmad.khalil@example.com",
  status: "invited",
  invitedAt: "2026-01-01T00:00:00Z",
  assignedVehicleId: null,
};

const ACTIVE_DRIVER: Driver = { ...INVITED_DRIVER, status: "active" };

const VEHICLE: Vehicle = { id: "v-1", plateNumber: "B 654321", capacity: 12, isActive: true, createdAt: "" };

beforeEach(() => {
  vi.mocked(getDrivers).mockReset();
  vi.mocked(addDriver).mockReset();
  vi.mocked(resendInvite).mockReset();
  vi.mocked(revokeDriver).mockReset();
  vi.mocked(restoreDriver).mockReset();
  vi.mocked(assignDriverToVehicle).mockReset();
  vi.mocked(unassignDriver).mockReset();
  vi.mocked(getVehicles).mockReset();
});

afterEach(() => {
  cleanup();
});

function openAddForm() {
  fireEvent.click(screen.getByRole("button", { name: "Add driver" }));
}

function fillAddForm(firstName: string, lastName: string, phone: string, email: string) {
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("First name"), { target: { value: firstName } });
  fireEvent.change(within(dialog).getByLabelText("Last name"), { target: { value: lastName } });
  fireEvent.change(within(dialog).getByLabelText("Phone"), { target: { value: phone } });
  fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add driver" }));
}

it("shows a loading status while the drivers load", () => {
  vi.mocked(getDrivers).mockReturnValue(new Promise(() => {}));
  vi.mocked(getVehicles).mockReturnValue(new Promise(() => {}));
  render(<DriversPage />);

  expect(screen.getByText("Loading drivers…")).toHaveAttribute("role", "status");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows the empty state when there are no drivers", async () => {
  vi.mocked(getDrivers).mockResolvedValue([]);
  vi.mocked(getVehicles).mockResolvedValue([]);
  render(<DriversPage />);

  expect(await screen.findByText("No drivers yet")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows an error when the drivers fail to load", async () => {
  vi.mocked(getDrivers).mockRejectedValue(new Error("down"));
  vi.mocked(getVehicles).mockResolvedValue([]);
  render(<DriversPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load drivers. Please try again.");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

// BUG (SCRUM-223): the alert says "Please try again" but the page has no
// retry control and never calls getDrivers()/getVehicles() again; only a full
// page reload recovers. Same gap as the vehicles and students pages. To
// reproduce: make getDrivers() reject once, render DriversPage, and look for
// any control that reloads the roster: there is none.
it.skip("shows an error with a retry when the drivers fail to load", async () => {
  vi.mocked(getDrivers).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([INVITED_DRIVER]);
  vi.mocked(getVehicles).mockResolvedValue([]);
  render(<DriversPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load drivers. Please try again.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Ahmad Khalil")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getDrivers).toHaveBeenCalledTimes(2);
});

it("adds a driver to the roster, resets and closes the form, and confirms the invite", async () => {
  vi.mocked(getDrivers).mockResolvedValue([]);
  vi.mocked(getVehicles).mockResolvedValue([]);
  vi.mocked(addDriver).mockResolvedValue(INVITED_DRIVER);
  render(<DriversPage />);
  await screen.findByText("No drivers yet");

  openAddForm();
  fillAddForm("Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");

  expect(await screen.findByText("Ahmad Khalil")).toBeInTheDocument();
  expect(addDriver).toHaveBeenCalledWith({
    firstName: "Ahmad",
    lastName: "Khalil",
    phone: "+961 3 123 456",
    email: "ahmad.khalil@example.com",
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const toast = await screen.findByText("Ahmad Khalil invited.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

it("shows the backend's duplicate email error next to the email field, leaving the roster unchanged", async () => {
  vi.mocked(getDrivers).mockResolvedValue([]);
  vi.mocked(getVehicles).mockResolvedValue([]);
  vi.mocked(addDriver).mockRejectedValue(
    new ApiValidationError({ email: "A driver with that email already exists." }),
  );
  render(<DriversPage />);
  await screen.findByText("No drivers yet");

  openAddForm();
  fillAddForm("Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");

  const dialog = await screen.findByRole("dialog");
  const emailInput = within(dialog).getByLabelText("Email");
  await waitFor(() =>
    expect(emailInput).toHaveAccessibleDescription("A driver with that email already exists."),
  );
  expect(emailInput).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("No drivers yet")).toBeInTheDocument();
});

it("assigns a vehicle to a driver and confirms it", async () => {
  vi.mocked(getDrivers).mockResolvedValue([ACTIVE_DRIVER]);
  vi.mocked(getVehicles).mockResolvedValue([VEHICLE]);
  vi.mocked(assignDriverToVehicle).mockResolvedValue({ ...ACTIVE_DRIVER, assignedVehicleId: VEHICLE.id });
  render(<DriversPage />);
  await screen.findByText("Ahmad Khalil");

  fireEvent.click(screen.getByRole("button", { name: "Assign vehicle for Ahmad Khalil" }));
  fireEvent.change(screen.getByLabelText("Assign to"), { target: { value: VEHICLE.id } });
  fireEvent.click(screen.getByRole("button", { name: "Assign" }));

  // The picker and the newly-shown plate both briefly carry "B 654321" (the
  // <option> unmounts in the same update that renders the plate), so wait
  // for the settled idle state (the "Reassign" trigger) before asserting on
  // the plate text itself.
  await screen.findByRole("button", { name: "Reassign vehicle for Ahmad Khalil" });
  expect(screen.getByText(VEHICLE.plateNumber)).toBeInTheDocument();
  expect(assignDriverToVehicle).toHaveBeenCalledWith(ACTIVE_DRIVER.id, VEHICLE.id);
  const toast = await screen.findByText(`Ahmad Khalil assigned to ${VEHICLE.plateNumber}.`);
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

it("shows the backend's message when assigning a vehicle is refused, leaving the driver unassigned", async () => {
  vi.mocked(getDrivers).mockResolvedValue([ACTIVE_DRIVER]);
  vi.mocked(getVehicles).mockResolvedValue([VEHICLE]);
  // The backend's shape for this conflict: a 409 with an errors map keyed by vehicleId.
  vi.mocked(assignDriverToVehicle).mockRejectedValue(
    new ApiValidationError({ vehicleId: "Vehicle is already assigned to Sara Haddad." }),
  );
  render(<DriversPage />);
  await screen.findByText("Ahmad Khalil");

  fireEvent.click(screen.getByRole("button", { name: "Assign vehicle for Ahmad Khalil" }));
  fireEvent.change(screen.getByLabelText("Assign to"), { target: { value: VEHICLE.id } });
  fireEvent.click(screen.getByRole("button", { name: "Assign" }));

  const toast = await screen.findByText("Vehicle is already assigned to Sara Haddad.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
  expect(screen.queryByText(VEHICLE.plateNumber)).not.toBeInTheDocument();
  expect(screen.getByText("Unassigned")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Assign vehicle for Ahmad Khalil" })).toBeInTheDocument();
});

it("unassigns a driver after confirming, and announces it", async () => {
  const assignedDriver: Driver = { ...ACTIVE_DRIVER, assignedVehicleId: VEHICLE.id };
  vi.mocked(getDrivers).mockResolvedValue([assignedDriver]);
  vi.mocked(getVehicles).mockResolvedValue([VEHICLE]);
  vi.mocked(unassignDriver).mockResolvedValue({ ...assignedDriver, assignedVehicleId: null });
  render(<DriversPage />);
  await screen.findByText("Ahmad Khalil");
  expect(screen.getByText(VEHICLE.plateNumber)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Unassign Ahmad Khalil" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  expect(await screen.findByText("Unassigned")).toBeInTheDocument();
  expect(unassignDriver).toHaveBeenCalledWith(assignedDriver.id);
  const toast = await screen.findByText("Ahmad Khalil unassigned.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
});

// SCRUM-98: revoking a driver's access. The backend answers with the driver as "deactivated" (and without
// the vehicle), which the roster shows as "Revoked".
const ASSIGNED_DRIVER: Driver = { ...ACTIVE_DRIVER, assignedVehicleId: "v-1" };

it("revokes a driver after confirming, shows them as revoked and releases the vehicle", async () => {
  vi.mocked(getDrivers).mockResolvedValue([ASSIGNED_DRIVER]);
  vi.mocked(getVehicles).mockResolvedValue([VEHICLE]);
  vi.mocked(revokeDriver).mockResolvedValue({ ...ASSIGNED_DRIVER, status: "deactivated", assignedVehicleId: null });
  render(<DriversPage />);
  await screen.findByText("Ahmad Khalil");
  expect(screen.getByText(VEHICLE.plateNumber)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" }));
  expect(revokeDriver).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm revoke access for Ahmad Khalil" }));

  expect(await screen.findByText("Revoked")).toBeInTheDocument();
  expect(revokeDriver).toHaveBeenCalledWith(ASSIGNED_DRIVER.id);
  expect(screen.queryByText(VEHICLE.plateNumber)).not.toBeInTheDocument();
  expect(screen.getByText("Unassigned")).toBeInTheDocument();
  const toast = await screen.findByText("Ahmad Khalil's access revoked.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Restore access for Ahmad Khalil" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Assign vehicle|Reassign/ })).not.toBeInTheDocument();
});

it("does not revoke when the confirmation is cancelled", async () => {
  vi.mocked(getDrivers).mockResolvedValue([ACTIVE_DRIVER]);
  vi.mocked(getVehicles).mockResolvedValue([]);
  render(<DriversPage />);
  await screen.findByText("Ahmad Khalil");

  fireEvent.click(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(revokeDriver).not.toHaveBeenCalled();
  expect(screen.getByText("Active")).toBeInTheDocument();
});

it("lets an invited driver be revoked too", async () => {
  vi.mocked(getDrivers).mockResolvedValue([INVITED_DRIVER]);
  vi.mocked(getVehicles).mockResolvedValue([]);
  vi.mocked(revokeDriver).mockResolvedValue({ ...INVITED_DRIVER, status: "deactivated" });
  render(<DriversPage />);
  await screen.findByText("Ahmad Khalil");

  fireEvent.click(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm revoke access for Ahmad Khalil" }));

  expect(await screen.findByText("Revoked")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Resend invite/ })).not.toBeInTheDocument();
});

it("restores a revoked driver after confirming", async () => {
  vi.mocked(getDrivers).mockResolvedValue([{ ...ACTIVE_DRIVER, status: "deactivated" }]);
  vi.mocked(getVehicles).mockResolvedValue([]);
  vi.mocked(restoreDriver).mockResolvedValue(ACTIVE_DRIVER);
  render(<DriversPage />);
  expect(await screen.findByText("Revoked")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Restore access for Ahmad Khalil" }));
  expect(restoreDriver).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm restore access for Ahmad Khalil" }));

  expect(await screen.findByText("Active")).toBeInTheDocument();
  expect(restoreDriver).toHaveBeenCalledWith(ACTIVE_DRIVER.id);
  expect(await screen.findByText("Ahmad Khalil's access restored.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" })).toBeInTheDocument();
});

it("tells the user when revoking fails and leaves the driver as they were", async () => {
  vi.mocked(getDrivers).mockResolvedValue([ACTIVE_DRIVER]);
  vi.mocked(getVehicles).mockResolvedValue([]);
  vi.mocked(revokeDriver).mockRejectedValue(new Error("offline"));
  render(<DriversPage />);
  await screen.findByText("Ahmad Khalil");

  fireEvent.click(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm revoke access for Ahmad Khalil" }));

  expect(await screen.findByText("Couldn't revoke access. Please try again.")).toBeInTheDocument();
  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Revoke access for Ahmad Khalil" })).toBeEnabled();
});
