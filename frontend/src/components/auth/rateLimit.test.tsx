// SCRUM-288: the screens of the six limited endpoints show "too many attempts, try again in N seconds" when the
// backend answers 429 with Retry-After, through the real request() client. The one other 429 of the sign-in
// flow (a code sent under a minute ago) has no Retry-After and keeps its own wording.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { PasswordForm } from "./PasswordForm";
import { TwoFactorForm } from "./TwoFactorForm";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.push.mockClear();
  router.replace.mockClear();
});

function tooManyRequests(retryAfter?: string) {
  const headers = new Headers({ "Content-Type": "application/problem+json" });
  if (retryAfter !== undefined) headers.set("Retry-After", retryAfter);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 429, detail: "Too many attempts. Try again in 42 seconds." }), {
        status: 429,
        headers,
      }),
    ),
  );
}

const WAIT = "Too many attempts. Try again in 42 seconds.";

describe("login", () => {
  function signIn() {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "parent@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-enough-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("shows the wait and no link to a code that was never sent", async () => {
    tooManyRequests("42");
    signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(WAIT);
    expect(screen.queryByRole("link", { name: "Enter the code you were sent" })).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("keeps the code-cooldown wording for a 429 without Retry-After", async () => {
    tooManyRequests();
    signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("A sign-in code was sent less than a minute ago.");
    expect(screen.getByRole("link", { name: "Enter the code you were sent" })).toBeInTheDocument();
  });

  it("says 1 second, not 1 seconds", async () => {
    tooManyRequests("1");
    signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 1 second.");
  });
});

describe("two-factor code", () => {
  it("shows the wait on verify", async () => {
    tooManyRequests("42");
    render(<TwoFactorForm />);
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(WAIT);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("forgot password", () => {
  it("shows the wait, and nothing about the account", async () => {
    tooManyRequests("42");
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "parent@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(WAIT);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });
});

describe("set password", () => {
  it("shows the wait and does not leave the page", async () => {
    tooManyRequests("42");
    render(<PasswordForm mode="reset" token="t" />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-long-enough-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "a-long-enough-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(WAIT);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
