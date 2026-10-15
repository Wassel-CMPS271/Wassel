import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

it("links the login page to password recovery and recovery back to login", () => {
  const login = render(<LoginForm />);
  expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  login.unmount();
  render(<ForgotPasswordForm />);
  expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
});

it.each(["", "   ", "invalid", "parent@", "parent @example.com"])("rejects invalid email %j without a request", (email) => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<ForgotPasswordForm />);
  submit(email);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Email")).toHaveFocus();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("shows identical neutral confirmation for existing and unknown emails through the real API client", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const confirmations: string[] = [];
  for (const email of ["parent@example.com", "unknown@example.com"]) {
    const view = render(<ForgotPasswordForm />);
    submit(`  ${email}  `);
    confirmations.push((await screen.findByRole("status")).textContent!);
    expect(screen.getByRole("status")).toHaveFocus();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/auth\/forgot-password$/),
      expect.objectContaining({ method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }),
    );
    expect(screen.getByRole("button", { name: "Request submitted" })).toBeDisabled();
    view.unmount();
  }
  expect(confirmations[0]).toBe(confirmations[1]);
  expect(confirmations[0]).toMatch(/If an account with that email exists/);
});

it("disables the form and prevents duplicate submissions while loading", async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ForgotPasswordForm />);
  submit("parent@example.com");
  expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
  expect(screen.getByLabelText("Email")).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolve(new Response(null, { status: 204 }));
  await screen.findByRole("status");
});

it.each([400, 404, 429, 500, "network"])("handles %s errors privately and allows retry", async (status) => {
  const fetchMock = vi.fn();
  if (status === "network") fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  else fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Account does not exist", errors: status === 400 ? { email: "Unknown account" } : undefined }), { status: Number(status) }));
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ForgotPasswordForm />);
  submit("parent@example.com");
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  expect(screen.queryByText(/Unknown account|Account does not exist/)).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  await screen.findByRole("status");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
