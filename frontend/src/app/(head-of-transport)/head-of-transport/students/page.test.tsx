import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStudents, setStudentLocation, updateStudentAddress, type Student } from "@/lib/api/students";
import StudentsPage from "./page";

vi.mock("@/lib/api/students", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/students")>()),
  getStudents: vi.fn(),
  updateStudentAddress: vi.fn(),
  setStudentLocation: vi.fn(),
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

beforeEach(() => {
  vi.mocked(getStudents).mockReset().mockResolvedValue([LINA, HADI]);
  vi.mocked(updateStudentAddress).mockReset();
  vi.mocked(setStudentLocation).mockReset();
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
