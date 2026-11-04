import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MapViewProps } from "@/components/map/MapView";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import type { Student } from "@/lib/api/students";
import { EditStudentAddressForm, FALLBACK_MAP_CENTER, FALLBACK_MAP_ZOOM } from "./EditStudentAddressForm";

// The real MapView decides whether to show a map; only the Leaflet part it
// loads with next/dynamic is replaced, by a stub that shows the pin and the
// view and can "click" the map.
vi.mock("next/dynamic", () => ({
  default: () =>
    function LeafletMapStub({ pin, center, zoom, onPinChange }: Omit<MapViewProps, "label">) {
      return (
        <div
          data-testid="leaflet-map"
          data-pin={pin ? `${pin.latitude},${pin.longitude}` : "none"}
          data-center={center ? `${center.latitude},${center.longitude}` : "none"}
          data-zoom={String(zoom)}
        >
          <button type="button" onClick={() => onPinChange?.(33.9001, 35.5102)}>
            Stub map click
          </button>
        </div>
      );
    },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const UNPINNED: Student = {
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
const PINNED: Student = { ...UNPINNED, latitude: 33.8961, longitude: 35.4823 };

it("includes parent linking in the existing editor without saving pickup details", async () => {
  const parent = { id: "p1", email: "parent@example.com", status: "active", createdAt: "" };
  const updated = { ...PINNED, parentUserId: parent.id };
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([parent])))
    .mockResolvedValueOnce(new Response(JSON.stringify(updated)));
  vi.stubGlobal("fetch", fetch);
  const onLinked = vi.fn();
  const { props } = setup(PINNED, { onLinked });
  await screen.findByLabelText("Parent");
  fireEvent.change(screen.getByLabelText("Parent"), { target: { value: parent.id } });
  fireEvent.click(screen.getByRole("button", { name: "Save parent" }));
  await screen.findByText("Parent relationship saved.");
  expect(onLinked).toHaveBeenCalledWith(updated);
  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.onSaveLocation).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

function setup(student: Student, overrides: Partial<Parameters<typeof EditStudentAddressForm>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSaveLocation = vi.fn().mockResolvedValue(undefined);
  const props = { student, onSave, onSaveLocation, ...overrides };
  const view = render(<EditStudentAddressForm {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit pickup details for Lina Daher" }));
  const dialog = screen.getByRole("dialog", { name: "Edit pickup details" });
  return { ...view, dialog, props };
}

it("shows the current pin on the map, centred on it", () => {
  const { dialog } = setup(PINNED);

  expect(within(dialog).getByRole("region", { name: "Pickup location for Lina Daher" })).toBeInTheDocument();
  const map = within(dialog).getByTestId("leaflet-map");
  expect(map).toHaveAttribute("data-pin", "33.8961,35.4823");
  expect(map).toHaveAttribute("data-center", "33.8961,35.4823");
});

it("shows an empty map over Beirut when the student has no pin", () => {
  const { dialog } = setup(UNPINNED);

  const map = within(dialog).getByTestId("leaflet-map");
  expect(map).toHaveAttribute("data-pin", "none");
  expect(map).toHaveAttribute("data-center", `${FALLBACK_MAP_CENTER.latitude},${FALLBACK_MAP_CENTER.longitude}`);
  expect(map).toHaveAttribute("data-zoom", String(FALLBACK_MAP_ZOOM));
  expect(FALLBACK_MAP_CENTER.latitude).toBeCloseTo(33.89, 1);
  expect(FALLBACK_MAP_CENTER.longitude).toBeCloseTo(35.5, 1);
});

it("saves a pin placed on the map", async () => {
  const { dialog, props } = setup(UNPINNED);

  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  expect(within(dialog).getByTestId("leaflet-map")).toHaveAttribute("data-pin", "33.9001,35.5102");
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(props.onSaveLocation).toHaveBeenCalledWith("st-1", 33.9001, 35.5102);
  expect(props.onSave).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Edit pickup details for Lina Daher" })).toHaveFocus();
});

it("doesn't save the pin when it didn't move", async () => {
  const { dialog, props } = setup(PINNED);

  fireEvent.change(within(dialog).getByLabelText("Pickup address"), { target: { value: "  Verdun, Beirut " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(props.onSave).toHaveBeenCalledWith("st-1", "Verdun, Beirut");
  expect(props.onSaveLocation).not.toHaveBeenCalled();
});

it("shows a location save error, keeps the dialog open and returns focus to Save", async () => {
  const onSaveLocation = vi.fn().mockRejectedValue(new ApiError(500, "boom"));
  const { dialog, props } = setup(PINNED, { onSaveLocation });

  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "The pin was not saved. Something went wrong. Please try again.",
  );
  expect(props.onSave).not.toHaveBeenCalled();
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save" })).toHaveFocus());
  expect(within(dialog).getByTestId("leaflet-map")).toHaveAttribute("data-pin", "33.9001,35.5102");
});

it("shows the backend's message when it rejects the pin", async () => {
  const onSaveLocation = vi.fn().mockRejectedValue(new ApiValidationError({ latitude: "Latitude must be between -90 and 90." }));
  const { dialog } = setup(PINNED, { onSaveLocation });

  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Latitude must be between -90 and 90.");
});

it("says the address was saved when only the pin failed, and retries only the pin", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSaveLocation = vi.fn().mockRejectedValueOnce(new ApiError(503, "down")).mockResolvedValueOnce(undefined);
  const { dialog, rerender, props } = setup(UNPINNED, { onSave, onSaveLocation });

  fireEvent.change(within(dialog).getByLabelText("Pickup address"), { target: { value: " Verdun, Beirut " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "The pickup address was saved, but the pin was not. Something went wrong. Please try again.",
  );
  expect(within(dialog).getByLabelText("Pickup address")).toHaveValue("Verdun, Beirut");
  expect(within(dialog).getByLabelText("Pickup address")).not.toHaveAttribute("aria-invalid", "true");

  // The page swaps in the saved student, here with the address stored differently.
  rerender(<EditStudentAddressForm {...props} student={{ ...UNPINNED, address: "Verdun Beirut" }} />);
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith("st-1", "Verdun, Beirut");
  expect(onSaveLocation).toHaveBeenCalledTimes(2);
  expect(onSaveLocation).toHaveBeenLastCalledWith("st-1", 33.9001, 35.5102);
});

it("doesn't save the pin when the address fails, and focuses the address", async () => {
  const onSave = vi.fn().mockRejectedValue(new ApiValidationError({ address: "Address is too long." }));
  const { dialog, props } = setup(UNPINNED, { onSave });

  fireEvent.change(within(dialog).getByLabelText("Pickup address"), { target: { value: "Verdun" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Address is too long.");
  expect(props.onSaveLocation).not.toHaveBeenCalled();
  expect(within(dialog).getByLabelText("Pickup address")).toHaveFocus();
});

it("requires an address and focuses it", () => {
  const { dialog, props } = setup(UNPINNED);

  fireEvent.change(within(dialog).getByLabelText("Pickup address"), { target: { value: "  " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  expect(within(dialog).getByRole("alert")).toHaveTextContent("Pickup address is required.");
  expect(within(dialog).getByLabelText("Pickup address")).toHaveFocus();
  expect(props.onSave).not.toHaveBeenCalled();
});

it("saves only once when Save is pressed twice", async () => {
  const onSaveLocation = vi.fn().mockReturnValue(new Promise(() => {}));
  const { dialog } = setup(UNPINNED, { onSaveLocation });

  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  const form = within(dialog).getByLabelText("Pickup address").closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(await within(dialog).findByRole("button", { name: "Saving..." })).toBeDisabled();
  expect(onSaveLocation).toHaveBeenCalledTimes(1);
});

it("closes on Escape and returns focus to the trigger", async () => {
  const { dialog } = setup(PINNED);

  fireEvent.keyDown(within(dialog).getByLabelText("Pickup address"), { key: "Escape" });

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Edit pickup details for Lina Daher" })).toHaveFocus();
});

it("doesn't close on Escape while saving, and keeps Tab inside", async () => {
  const { dialog } = setup(UNPINNED, { onSaveLocation: vi.fn().mockReturnValue(new Promise(() => {})) });
  fireEvent.click(within(dialog).getByRole("button", { name: "Stub map click" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByRole("button", { name: "Saving..." });

  fireEvent.keyDown(within(dialog).getByLabelText("Pickup address"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  // Save and Cancel are disabled, so the map is the last control.
  const address = within(dialog).getByLabelText("Pickup address");
  address.focus();
  fireEvent.keyDown(address, { key: "Tab", shiftKey: true });
  expect(within(dialog).getByRole("button", { name: "Stub map click" })).toHaveFocus();
});

it("wraps Tab between the address and Cancel", () => {
  const { dialog } = setup(PINNED);
  const address = within(dialog).getByLabelText("Pickup address");
  const cancel = within(dialog).getByRole("button", { name: "Cancel" });
  expect(address).toHaveFocus();

  fireEvent.keyDown(address, { key: "Tab", shiftKey: true });
  expect(cancel).toHaveFocus();

  fireEvent.keyDown(cancel, { key: "Tab" });
  expect(address).toHaveFocus();
});
