import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudentParentForm } from "./StudentParentForm";
import type { Student } from "@/lib/api/students";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const student: Student = { id: "s1", firstName: "Lina", lastName: "Daher", grade: "4", guardianName: "Rami", guardianPhone: "+961 3 123 456", status: "active", address: null, latitude: null, longitude: null, route: null, parentUserId: "p1", createdAt: "" };
const parents = [{ id: "p1", email: "first@example.com", status: "active" }, { id: "p2", email: "second@example.com", status: "invited" }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function Harness({ initial = student }: { initial?: Student }) {
  const [value, setValue] = useState(initial);
  return <StudentParentForm student={value} onLinked={setValue} onBusyChange={() => {}} />;
}

it("loads the assigned parent and saves another via PATCH, displaying the returned relationship", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json(parents)).mockResolvedValueOnce(json({ ...student, parentUserId: "p2" }));
  vi.stubGlobal("fetch", fetch); render(<Harness />);
  await screen.findByText("Current parent: first@example.com");
  expect(screen.getByLabelText("Parent")).toHaveValue("p1");
  expect(screen.getByRole("button", { name: "Save parent" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Parent"), { target: { value: "p2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save parent" }));
  await screen.findByText("Parent relationship saved.");
  expect(screen.getByText("Current parent: second@example.com")).toBeInTheDocument();
  expect(fetch.mock.calls[1][0]).toMatch(/\/students\/s1\/parent$/);
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: "PATCH", credentials: "include", body: JSON.stringify({ parentUserId: "p2" }) });
});

it("links the empty state to invitations and never offers unlinking", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([]))); render(<Harness initial={{ ...student, parentUserId: null }} />);
  expect(await screen.findByRole("link", { name: "Invite a parent" })).toHaveAttribute("href", "/head-of-transport/parents");
  expect(screen.queryByRole("button", { name: "Save parent" })).not.toBeInTheDocument();
});

it("requires a selection when the student has no parent", async () => {
  const fetch = vi.fn().mockResolvedValue(json(parents)); vi.stubGlobal("fetch", fetch);
  render(<Harness initial={{ ...student, parentUserId: null }} />); await screen.findByLabelText("Parent");
  fireEvent.click(screen.getByRole("button", { name: "Save parent" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Select an available parent");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  [400, { errors: { parentUserId: "Parent user id is required" } }, "Parent user id is required"],
  [404, { detail: "Missing parent" }, "no longer available"],
  [500, {}, "Something went wrong"],
])("preserves the existing relationship after backend error %s", async (status, body, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(parents)).mockResolvedValueOnce(json(body, status)));
  render(<Harness />); await screen.findByLabelText("Parent");
  fireEvent.change(screen.getByLabelText("Parent"), { target: { value: "p2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save parent" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByText("Current parent: first@example.com")).toBeInTheDocument();
});

it("retries parent loading without misrepresenting the current assignment", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(json(parents)));
  render(<Harness />); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry parents" }));
  await waitFor(() => expect(screen.getByLabelText("Parent")).toHaveValue("p1"));
});

it("prevents duplicate saves while a request is pending", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(json(parents)).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch); render(<Harness />); await screen.findByLabelText("Parent");
  fireEvent.change(screen.getByLabelText("Parent"), { target: { value: "p2" } });
  const form = screen.getByRole("form", { name: "Link parent" });
  fireEvent.submit(form); fireEvent.submit(form);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Saving parent…" })).toBeDisabled();
  finish(json({ ...student, parentUserId: "p2" }));
  await screen.findByText("Parent relationship saved.");
});
