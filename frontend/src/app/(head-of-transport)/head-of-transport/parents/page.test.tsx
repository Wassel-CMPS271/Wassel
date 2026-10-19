import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ParentsPage from "./page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const parent = { id: "p1", email: "parent@example.com", status: "invited", createdAt: "2026-10-19" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

it("loads real parents, invites with trimmed email, and refreshes the list", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json(parent, 201)).mockResolvedValueOnce(json([parent]));
  vi.stubGlobal("fetch", fetch);
  render(<ParentsPage />);
  expect(screen.getByText("Loading parents…")).toBeInTheDocument();
  await screen.findByText(/No parents yet/);
  fireEvent.change(screen.getByLabelText("Parent email"), { target: { value: " parent@example.com " } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await screen.findByText("parent@example.com");
  expect(screen.getByText("Invitation sent to parent@example.com.")).toBeInTheDocument();
  expect(screen.getByText("Invited")).toBeInTheDocument();
  expect(fetch.mock.calls[1][0]).toMatch(/\/api\/head-of-transport\/parents$/);
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "include", body: JSON.stringify({ email: parent.email }) });
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("validates email without making an invitation request", async () => {
  const fetch = vi.fn().mockResolvedValue(json([])); vi.stubGlobal("fetch", fetch);
  render(<ParentsPage />); await screen.findByText(/No parents yet/);
  fireEvent.change(screen.getByLabelText("Parent email"), { target: { value: "invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Parent email")).toHaveFocus();
});

it("shows the backend duplicate email field error and preserves input", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json({ errors: { email: "An account with this email already exists." } }, 409)));
  render(<ParentsPage />); await screen.findByText(/No parents yet/);
  fireEvent.change(screen.getByLabelText("Parent email"), { target: { value: parent.email } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
  expect(screen.getByLabelText("Parent email")).toHaveValue(parent.email);
});

it("retries a failed list and displays active accounts", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(json([{ ...parent, status: "active" }])));
  render(<ParentsPage />); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry parent list" }));
  await screen.findByText(parent.email); expect(screen.getByText("Active")).toBeInTheDocument();
});

it("keeps invitation success distinct from a failed refresh", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json(parent, 201)).mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetch); render(<ParentsPage />); await screen.findByText(/No parents yet/);
  fireEvent.change(screen.getByLabelText("Parent email"), { target: { value: parent.email } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Invitation sent to parent@example.com.")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Send invitation" })).toBeEnabled());
});
