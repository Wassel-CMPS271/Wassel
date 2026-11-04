import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { getDrivers } from "@/lib/api/drivers";
import { ApiError } from "@/lib/api/errors";
import { getVehicles } from "@/lib/api/vehicles";
import { RouteFormDialog, type RouteFormDialogProps } from "./RouteFormDialog";

vi.mock("@/lib/api/vehicles", () => ({ getVehicles: vi.fn() }));
vi.mock("@/lib/api/drivers", () => ({ getDrivers: vi.fn() }));

beforeEach(() => {
  vi.mocked(getVehicles).mockReset().mockResolvedValue([
    { id: "v-1", plateNumber: "D 456789", capacity: 10, isActive: true, createdAt: "" },
  ]);
  vi.mocked(getDrivers).mockReset().mockResolvedValue([
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
  ]);
});

afterEach(() => {
  cleanup();
});

function renderDialog({
  onSubmit = vi.fn<RouteFormDialogProps["onSubmit"]>().mockResolvedValue(undefined),
  onClose = vi.fn<RouteFormDialogProps["onClose"]>(),
}: {
  onSubmit?: Mock<RouteFormDialogProps["onSubmit"]>;
  onClose?: Mock<RouteFormDialogProps["onClose"]>;
} = {}) {
  render(
    <RouteFormDialog
      title="Create route"
      submitLabel="Create route"
      submittingLabel="Creating..."
      initial={{ name: "", vehicleId: "", driverId: "" }}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );
  return { dialog: screen.getByRole("dialog", { name: "Create route" }), onSubmit, onClose };
}

async function renderLoaded(props?: Parameters<typeof renderDialog>[0]) {
  const result = renderDialog(props);
  await within(result.dialog).findByRole("option", { name: "D 456789" });
  return result;
}

function fill(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Ras Beirut run" } });
  fireEvent.change(within(dialog).getByLabelText("Vehicle"), { target: { value: "v-1" } });
  fireEvent.change(within(dialog).getByLabelText("Driver"), { target: { value: "d-1" } });
}

it("wraps Tab from the last control to the first", async () => {
  const { dialog } = await renderLoaded();
  const cancel = within(dialog).getByRole("button", { name: "Cancel" });
  cancel.focus();

  fireEvent.keyDown(cancel, { key: "Tab" });

  expect(within(dialog).getByLabelText("Name")).toHaveFocus();
});

it("wraps Shift+Tab from the first control to the last", async () => {
  const { dialog } = await renderLoaded();
  const name = within(dialog).getByLabelText("Name");
  expect(name).toHaveFocus();

  fireEvent.keyDown(name, { key: "Tab", shiftKey: true });

  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
});

it("leaves Tab alone between the first and last controls", async () => {
  const { dialog } = await renderLoaded();
  const name = within(dialog).getByLabelText("Name");

  const notPrevented = fireEvent.keyDown(name, { key: "Tab" });

  expect(notPrevented).toBe(true);
  expect(name).toHaveFocus();
});

it("skips disabled controls while the options load", () => {
  vi.mocked(getVehicles).mockReturnValue(new Promise(() => {}));
  const { dialog } = renderDialog();
  const name = within(dialog).getByLabelText("Name");
  expect(within(dialog).getByRole("button", { name: "Create route" })).toBeDisabled();

  // Submit is disabled, so Cancel is the last control to wrap to.
  fireEvent.keyDown(name, { key: "Tab", shiftKey: true });
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
});

it("skips the disabled buttons while a save is in flight", async () => {
  const { dialog } = await renderLoaded({ onSubmit: vi.fn<RouteFormDialogProps["onSubmit"]>().mockReturnValue(new Promise(() => {})) });
  fill(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));
  expect(within(dialog).getByRole("button", { name: "Creating..." })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();

  // Both buttons are disabled, so Driver is the last control.
  const driver = within(dialog).getByLabelText("Driver");
  driver.focus();
  fireEvent.keyDown(driver, { key: "Tab" });
  expect(within(dialog).getByLabelText("Name")).toHaveFocus();

  fireEvent.keyDown(within(dialog).getByLabelText("Name"), { key: "Tab", shiftKey: true });
  expect(driver).toHaveFocus();
});

it("closes on Escape", async () => {
  const { dialog, onClose } = await renderLoaded();

  fireEvent.keyDown(within(dialog).getByLabelText("Name"), { key: "Escape" });

  expect(onClose).toHaveBeenCalledTimes(1);
});

it("doesn't close on Escape while a save is in flight", async () => {
  const { dialog, onClose } = await renderLoaded({
    onSubmit: vi.fn<RouteFormDialogProps["onSubmit"]>().mockReturnValue(new Promise(() => {})),
  });
  fill(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));
  await within(dialog).findByRole("button", { name: "Creating..." });

  fireEvent.keyDown(within(dialog).getByLabelText("Name"), { key: "Escape" });

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("moves focus to the name after a generic error", async () => {
  const { dialog } = await renderLoaded({ onSubmit: vi.fn<RouteFormDialogProps["onSubmit"]>().mockRejectedValue(new ApiError(500, "boom")) });
  fill(dialog);
  const submit = within(dialog).getByRole("button", { name: "Create route" });
  submit.focus();
  fireEvent.click(submit);

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Something went wrong. Please try again.",
  );
  expect(within(dialog).getByLabelText("Name")).toHaveFocus();
});

it("says when the vehicles and drivers couldn't load, and still closes", async () => {
  vi.mocked(getDrivers).mockRejectedValue(new Error("down"));
  const { dialog, onSubmit, onClose } = renderDialog();

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Couldn't load vehicles and drivers. Close this and try again.",
  );
  expect(within(dialog).queryByRole("option", { name: "D 456789" })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("option", { name: "Select a vehicle" })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Create route" })).toBeDisabled();
  fireEvent.submit(within(dialog).getByLabelText("Name").closest("form")!);
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Couldn't load vehicles and drivers.");
  expect(onSubmit).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});
