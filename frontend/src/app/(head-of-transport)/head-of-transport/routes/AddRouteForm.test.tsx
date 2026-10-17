import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { AddRouteForm } from "./AddRouteForm";

vi.mock("@/lib/api/vehicles", () => ({
  getVehicles: vi.fn().mockResolvedValue([
    { id: "v-1", plateNumber: "D 456789", capacity: 10, isActive: true, createdAt: "" },
    { id: "v-off", plateNumber: "E 567890", capacity: 10, isActive: false, createdAt: "" },
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
      id: "d-off",
      firstName: "Omar",
      lastName: "Zein",
      phone: "",
      email: "",
      status: "deactivated",
      invitedAt: "",
      assignedVehicleId: null,
    },
  ]),
}));

afterEach(() => {
  cleanup();
});

async function open(onAdd = vi.fn().mockResolvedValue(undefined)) {
  render(<AddRouteForm onAdd={onAdd} />);
  fireEvent.click(screen.getByRole("button", { name: "Create route" }));
  const dialog = await screen.findByRole("dialog", { name: "Create route" });
  await within(dialog).findByRole("option", { name: "D 456789" });
  return { dialog, onAdd };
}

function fill(dialog: HTMLElement, name = "Ras Beirut run") {
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(within(dialog).getByLabelText("Vehicle"), { target: { value: "v-1" } });
  fireEvent.change(within(dialog).getByLabelText("Driver"), { target: { value: "d-1" } });
}

function submit(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));
}

it("opens with focus on the name and offers only active vehicles and drivers", async () => {
  const { dialog } = await open();

  expect(within(dialog).getByLabelText("Name")).toHaveFocus();
  expect(within(dialog).queryByRole("option", { name: "E 567890" })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("option", { name: "Rania Khalil" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("option", { name: "Omar Zein" })).not.toBeInTheDocument();
});

it("saves the trimmed input, closes and returns focus to the trigger", async () => {
  const { dialog, onAdd } = await open();
  fill(dialog, "  Ras Beirut run  ");
  submit(dialog);

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(onAdd).toHaveBeenCalledWith({ name: "Ras Beirut run", vehicleId: "v-1", driverId: "d-1" });
  expect(screen.getByRole("button", { name: "Create route" })).toHaveFocus();
});

it("shows a backend field error under the right input and focuses it", async () => {
  const onAdd = vi
    .fn()
    .mockRejectedValue(new ApiValidationError({ vehicleId: "This vehicle is already on Hamra morning run." }));
  const { dialog } = await open(onAdd);
  fill(dialog);
  submit(dialog);

  const vehicle = within(dialog).getByLabelText("Vehicle");
  await waitFor(() =>
    expect(vehicle).toHaveAccessibleDescription("This vehicle is already on Hamra morning run."),
  );
  expect(vehicle).toHaveAttribute("aria-invalid", "true");
  expect(vehicle).toHaveFocus();
  expect(within(dialog).getByLabelText("Name")).toHaveAttribute("aria-invalid", "false");
  expect(within(dialog).getByLabelText("Driver")).toHaveAttribute("aria-invalid", "false");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it.each([
  ["a server error", new ApiError(500, "boom")],
  ["a network failure", new TypeError("Failed to fetch")],
  ["a field this form doesn't have", new ApiValidationError({ schoolId: "Unknown school." })],
])("shows the generic message for %s", async (_label, error) => {
  const { dialog } = await open(vi.fn().mockRejectedValue(error));
  fill(dialog);
  submit(dialog);

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Something went wrong. Please try again.",
  );
  expect(within(dialog).getByRole("button", { name: "Create route" })).toBeEnabled();
});

it("validates on the client without calling onAdd", async () => {
  const { dialog, onAdd } = await open();
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "   " } });
  submit(dialog);

  expect(within(dialog).getByLabelText("Name")).toHaveAccessibleDescription("Name is required.");
  expect(within(dialog).getByLabelText("Vehicle")).toHaveAccessibleDescription("Vehicle is required.");
  expect(within(dialog).getByLabelText("Driver")).toHaveAccessibleDescription("Driver is required.");
  expect(within(dialog).getByLabelText("Name")).toHaveFocus();
  expect(onAdd).not.toHaveBeenCalled();
});

it("closes on Escape and returns focus to the trigger", async () => {
  const { dialog } = await open();
  fireEvent.keyDown(within(dialog).getByLabelText("Name"), { key: "Escape" });

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Create route" })).toHaveFocus();
});
