import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  vi.mocked(addStudentWithAddress).mockReset();
  vi.mocked(updateStudentAddress).mockReset();
  vi.mocked(setStudentLocation).mockReset();
});

afterEach(() => {
  cleanup();
});

function row(name: string) {
  return screen.getByText(name).closest("li")!;
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

// BUG (SCRUM-223): the alert says "Please try again" but the page has no
// retry control and never calls getStudents() again; only a full page reload
// recovers. Same gap as the vehicles and drivers pages. To reproduce: make
// getStudents() reject once, render StudentsPage, and look for any control
// that reloads the roster: there is none.
it.skip("shows an error with a retry when the students fail to load", async () => {
  vi.mocked(getStudents).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([LINA]);
  render(<StudentsPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load students. Please try again.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Lina Daher")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getStudents).toHaveBeenCalledTimes(2);
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

  fireEvent.click(screen.getByRole("button", { name: "Inactive" }));

  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
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
