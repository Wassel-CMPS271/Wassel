import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inviteHeadOfTransport } from "@/lib/api/headOfTransport";
import { ApiValidationError } from "@/lib/api/errors";
import HeadOfTransportPage from "./page";

vi.mock("@/lib/api/headOfTransport", () => ({
  inviteHeadOfTransport: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(inviteHeadOfTransport).mockReset();
});

afterEach(() => {
  cleanup();
});

it("shows an inline error and doesn't call the API for a blank email", async () => {
  render(<HeadOfTransportPage />);

  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

  const emailInput = screen.getByLabelText("Email address");
  await waitFor(() => expect(emailInput).toHaveAccessibleDescription("Email is required"));
  expect(emailInput).toHaveAttribute("aria-invalid", "true");
  expect(inviteHeadOfTransport).not.toHaveBeenCalled();
});

it("shows an inline error and doesn't call the API for a malformed email", async () => {
  render(<HeadOfTransportPage />);

  const emailInput = screen.getByLabelText("Email address");
  fireEvent.change(emailInput, { target: { value: "not-an-email" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

  await waitFor(() => expect(emailInput).toHaveAccessibleDescription("Enter a valid email address"));
  expect(emailInput).toHaveAttribute("aria-invalid", "true");
  expect(inviteHeadOfTransport).not.toHaveBeenCalled();
});

// The backend's duplicate-email message always arrives inside an `errors` map
// (EmailAlreadyInUseException, via GlobalExceptionHandler), so request() in
// client.ts always turns it into an ApiValidationError before an ApiError is
// ever thrown. The message here is deliberately different from the hardcoded
// string the old, dead `ApiError && status === 409` branch used to show
// ("An account with this email already exists."): if that branch ever ran
// instead of the ApiValidationError one, this assertion would fail, which is
// what proves the test exercises the real path and isn't passing by
// coincidence of matching text.
it("shows the backend's duplicate-email message next to the field", async () => {
  vi.mocked(inviteHeadOfTransport).mockRejectedValue(
    new ApiValidationError({ email: "That email is already registered to another account." }),
  );
  render(<HeadOfTransportPage />);

  const emailInput = screen.getByLabelText("Email address");
  fireEvent.change(emailInput, { target: { value: "nour.saad@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

  await waitFor(() =>
    expect(emailInput).toHaveAccessibleDescription("That email is already registered to another account."),
  );
  expect(emailInput).toHaveAttribute("aria-invalid", "true");
  expect(emailInput).toHaveValue("nour.saad@example.com");
});

it("clears the form and shows a toast after a successful invite", async () => {
  vi.mocked(inviteHeadOfTransport).mockResolvedValue({
    id: "a-1",
    email: "nour.saad@example.com",
    status: "invited",
    createdAt: "2026-01-01T00:00:00Z",
  });
  render(<HeadOfTransportPage />);

  const emailInput = screen.getByLabelText("Email address");
  fireEvent.change(emailInput, { target: { value: "nour.saad@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

  const toast = await screen.findByText("Invite sent.");
  expect(toast.closest('[role="status"]')).toBeInTheDocument();
  expect(inviteHeadOfTransport).toHaveBeenCalledWith("nour.saad@example.com");
  await waitFor(() => expect(emailInput).toHaveValue(""));
});
