import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import type { RouteSummary } from "@/lib/api/routes";
import { EditRouteForm } from "./EditRouteForm";

vi.mock("@/lib/api/vehicles", () => ({
  getVehicles: vi.fn().mockResolvedValue([
    { id: "v-1", plateNumber: "D 456789", capacity: 10, isActive: true, createdAt: "" },
    { id: "v-hamra", plateNumber: "A 123456", capacity: 14, isActive: false, createdAt: "" },
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
    {
      id: "d-hamra",
      firstName: "Karim",
      lastName: "Haddad",
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
  vehicle: { id: "v-hamra", plateNumber: "A 123456", capacity: 14 },
  driver: { id: "d-hamra", firstName: "Karim", lastName: "Haddad" },
  studentCount: 4,
  seatsLeft: 10,
};

afterEach(() => {
  cleanup();
});

async function open(onEdit = vi.fn().mockResolvedValue(undefined)) {
  render(<EditRouteForm route={HAMRA} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Hamra morning run" }));
  const dialog = await screen.findByRole("dialog", { name: "Edit route" });
  await within(dialog).findByRole("option", { name: "D 456789" });
  return { dialog, onEdit };
}

function save(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
}

it("opens filled in with the route, keeping its inactive vehicle selectable", async () => {
  const { dialog } = await open();

  expect(within(dialog).getByLabelText("Name")).toHaveValue("Hamra morning run");
  expect(within(dialog).getByLabelText("Name")).toHaveFocus();
  expect(within(dialog).getByLabelText("Vehicle")).toHaveValue("v-hamra");
  expect(within(dialog).getByLabelText("Driver")).toHaveValue("d-hamra");
  expect(within(dialog).getAllByRole("option", { name: "A 123456" })).toHaveLength(1);
  expect(within(dialog).getAllByRole("option", { name: "Karim Haddad" })).toHaveLength(1);
});

it("saves the changes for this route, closes and returns focus to Edit", async () => {
  const { dialog, onEdit } = await open();
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: " Hamra early run " } });
  fireEvent.change(within(dialog).getByLabelText("Vehicle"), { target: { value: "v-1" } });
  save(dialog);

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(onEdit).toHaveBeenCalledWith("r-1", {
    name: "Hamra early run",
    vehicleId: "v-1",
    driverId: "d-hamra",
  });
  expect(screen.getByRole("button", { name: "Edit Hamra morning run" })).toHaveFocus();
});

it("shows a backend field error under the right input and focuses it", async () => {
  const onEdit = vi
    .fn()
    .mockRejectedValue(new ApiValidationError({ driverId: "This driver is already on Verdun morning run." }));
  const { dialog } = await open(onEdit);
  save(dialog);

  const driver = within(dialog).getByLabelText("Driver");
  await waitFor(() =>
    expect(driver).toHaveAccessibleDescription("This driver is already on Verdun morning run."),
  );
  expect(driver).toHaveAttribute("aria-invalid", "true");
  expect(driver).toHaveFocus();
  expect(within(dialog).getByLabelText("Vehicle")).toHaveAttribute("aria-invalid", "false");
});

it("shows the generic message when the save fails otherwise", async () => {
  const { dialog } = await open(vi.fn().mockRejectedValue(new ApiError(404, "Route not found.")));
  save(dialog);

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Something went wrong. Please try again.",
  );
  expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
});

it("validates on the client without calling onEdit", async () => {
  const { dialog, onEdit } = await open();
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "" } });
  save(dialog);

  expect(within(dialog).getByLabelText("Name")).toHaveAccessibleDescription("Name is required.");
  expect(within(dialog).getByLabelText("Name")).toHaveFocus();
  expect(within(dialog).getByLabelText("Vehicle")).toHaveAttribute("aria-invalid", "false");
  expect(onEdit).not.toHaveBeenCalled();
});

it("drops unsaved changes when cancelled", async () => {
  const { dialog, onEdit } = await open();
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Changed" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: "Edit Hamra morning run" }));
  const reopened = await screen.findByRole("dialog", { name: "Edit route" });
  expect(within(reopened).getByLabelText("Name")).toHaveValue("Hamra morning run");
  expect(onEdit).not.toHaveBeenCalled();
});
