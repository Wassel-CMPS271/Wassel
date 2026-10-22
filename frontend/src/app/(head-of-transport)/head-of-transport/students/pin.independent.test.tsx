// SCRUM-229: real roster, pickup dialog and location API through mocked fetch.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StudentsPage from "./page";
import { ROOT, httpFixture, json, student, studentId } from "@/test-support/routingContract";
vi.mock("next/dynamic", async () => {
  const { BrowserMap } = await import("@/test-support/routingContract");
  return { default: () => BrowserMap };
});
let api: ReturnType<typeof httpFixture>;
beforeEach(() => { api = httpFixture(undefined, [student(1, false)]); api.state.listed = false; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function open() {
  render(<StudentsPage />);
  await screen.findByText("Student1 Independent");
  fireEvent.click(screen.getByRole("button", { name: "Edit pickup details for Student1 Independent" }));
  return screen.findByRole("dialog", { name: "Edit pickup details" });
}
const location = `${ROOT}/students/${studentId(1)}/location`;
const address = `${ROOT}/students/${studentId(1)}/address`;

it("sets a first pin through PATCH and removes the roster warning only after success", async () => {
  api.state.handler = (m, p, b) => m === "PATCH" && p === location
    ? json({ ...student(1), ...(b as object) }) : undefined;
  const dialog = await open();
  expect(screen.getByText("Needs pin")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Browser pin")).toHaveTextContent("null");
  fireEvent.click(within(dialog).getByRole("button", { name: "Select pickup point" }));
  expect(within(dialog).getByLabelText("Browser pin")).toHaveTextContent('"latitude":33.901');
  expect(api.mutations()).toEqual([]);
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.mutations()).toEqual([{ method: "PATCH", path: location, body: { latitude: 33.901, longitude: 35.511 } }]);
  expect(screen.queryByText("Needs pin")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit pickup details for Student1 Independent" }));
  expect(await screen.findByLabelText("Browser pin")).toHaveTextContent('"longitude":35.511');
});

it("moves an existing pin, then reopens using the server's canonical coordinates", async () => {
  api.state.roster = [student(1)];
  api.state.handler = (m, p) => m === "PATCH" && p === location ? json({ ...student(1), latitude: 33.90201, longitude: 35.51201 }) : undefined;
  const dialog = await open();
  expect(within(dialog).getByLabelText("Browser pin")).toHaveTextContent('"latitude":33.881');
  fireEvent.click(within(dialog).getByRole("button", { name: "Move pickup point" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.mutations()[0]).toEqual({ method: "PATCH", path: location, body: { latitude: 33.902, longitude: 35.512 } });
  fireEvent.click(screen.getByRole("button", { name: "Edit pickup details for Student1 Independent" }));
  expect(await screen.findByLabelText("Browser pin")).toHaveTextContent('"latitude":33.90201');
});

it.each(["latitude", "longitude"])("shows backend %s validation and preserves the unsaved pin for retry", async field => {
  let reject = true;
  api.state.handler = (m, p) => m === "PATCH" && p === location
    ? reject ? json({ status: 400, errors: { [field]: "Coordinate outside allowed range." } }, 400)
      : json({ ...student(1), latitude: 33.901, longitude: 35.511 }) : undefined;
  const dialog = await open();
  fireEvent.click(within(dialog).getByRole("button", { name: "Select pickup point" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Coordinate outside allowed range.");
  expect(screen.getByText("Needs pin")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Browser pin")).toHaveTextContent('"latitude":33.901');
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled());
  reject = false;
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.mutations()).toHaveLength(2);
  expect(screen.queryByText("Needs pin")).not.toBeInTheDocument();
});

it("retries only the failed pin after the address has committed", async () => {
  let pinAttempts = 0;
  api.state.handler = (m, p) => {
    if (m === "PATCH" && p === address) return json({ ...student(1, false), address: "New pickup" });
    if (m === "PATCH" && p === location) {
      if (++pinAttempts === 1) throw new TypeError("Network offline");
      return json({ ...student(1), address: "New pickup", latitude: 33.901, longitude: 35.511 });
    }
  };
  const dialog = await open();
  fireEvent.change(within(dialog).getByLabelText("Pickup address"), { target: { value: "  New pickup  " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Select pickup point" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("The pickup address was saved, but the pin was not.");
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.mutations().map(c => c.path)).toEqual([address, location, location]);
  expect(api.mutations()[0].body).toEqual({ address: "New pickup" });
  expect(screen.queryByText("Needs pin")).not.toBeInTheDocument();
});

it("cancelled pin movement sends no mutation and reopens at the original point", async () => {
  api.state.roster = [student(1)];
  const dialog = await open();
  const before = within(dialog).getByLabelText("Browser pin").textContent;
  fireEvent.click(within(dialog).getByRole("button", { name: "Move pickup point" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.mutations()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Edit pickup details for Student1 Independent" }));
  expect(await screen.findByLabelText("Browser pin")).toHaveTextContent(before!);
});
