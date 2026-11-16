import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UserBlock } from "./UserBlock";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const logout = vi.fn();
vi.mock("@/lib/api/auth", () => ({ logout: (...args: unknown[]) => logout(...args) }));

vi.mock("@/components/auth/RoleGuard", () => ({
  useCurrentUser: () => ({ id: "u-1", email: "karim@wassel.local", role: "DRIVER", schoolId: "s-1" }),
}));

afterEach(() => {
  cleanup();
  replace.mockClear();
  logout.mockReset();
});

it("signs out at once with nothing to confirm", async () => {
  logout.mockResolvedValue(undefined);
  render(<UserBlock />);

  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  expect(replace).toHaveBeenCalledWith("/login");
});

it("shows the warning instead of signing out when confirmSignOut returns one", () => {
  logout.mockResolvedValue(undefined);
  const confirmSignOut = vi.fn(() => "2 confirmations haven't been sent yet.");
  render(<UserBlock confirmSignOut={confirmSignOut} />);

  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

  expect(screen.getByText("2 confirmations haven't been sent yet.")).toBeInTheDocument();
  expect(logout).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Sign out anyway" })).toHaveFocus();
});

it("signs out anyway once confirmed, and cancel returns focus without signing out", async () => {
  logout.mockResolvedValue(undefined);
  const confirmSignOut = () => "Unsent confirmations.";
  render(<UserBlock confirmSignOut={confirmSignOut} />);

  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  // Swapping back to the plain button mounts a new element (same role/name);
  // the focus restoration is on *that* one, so it's re-queried, not reused.
  expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
  expect(logout).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign out anyway" }));

  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  expect(replace).toHaveBeenCalledWith("/login");
});

it("cancels the confirm step on Escape", () => {
  const confirmSignOut = () => "Unsent confirmations.";
  render(<UserBlock confirmSignOut={confirmSignOut} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

  fireEvent.keyDown(screen.getByRole("button", { name: "Sign out anyway" }), { key: "Escape" });

  expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
  expect(logout).not.toHaveBeenCalled();
});

it("shows an error and stays signed in when logout fails, with nothing to confirm", async () => {
  logout.mockRejectedValue(new Error("down"));
  render(<UserBlock />);

  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't sign out");
  expect(replace).not.toHaveBeenCalled();
});

it("calls confirmSignOut fresh each click, so a cleared warning signs out at once next time", async () => {
  logout.mockResolvedValue(undefined);
  let unsent = true;
  render(<UserBlock confirmSignOut={() => (unsent ? "Unsent confirmations." : null)} />);

  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.getByText("Unsent confirmations.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  unsent = false;
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
});
