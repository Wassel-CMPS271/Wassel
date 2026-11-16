import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectionBanner, type ConnectionBannerProps } from "./ConnectionBanner";

afterEach(() => {
  cleanup();
});

const BASE: ConnectionBannerProps = {
  state: "online",
  paused: false,
  sessionExpired: false,
  savedCount: 0,
  canSave: true,
  onSendNow: () => {},
};

it("keeps the status wrapper mounted, empty, while online, not paused and with nothing saved", () => {
  render(<ConnectionBanner {...BASE} />);

  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("stays empty while online even with items saved (it's only about reachability)", () => {
  render(<ConnectionBanner {...BASE} savedCount={3} />);

  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("shows the offline notice with the saved count and a Send now button", () => {
  const onSendNow = vi.fn();
  render(<ConnectionBanner {...BASE} state="offline" savedCount={2} onSendNow={onSendNow} />);

  const banner = screen.getByRole("status");
  expect(banner).toHaveTextContent("You're offline.");
  expect(banner).toHaveTextContent("2 confirmations");

  fireEvent.click(screen.getByRole("button", { name: "Send now" }));
  expect(onSendNow).toHaveBeenCalledTimes(1);
});

it("shows an offline notice with no Send now when nothing is saved yet", () => {
  render(<ConnectionBanner {...BASE} state="offline" savedCount={0} />);

  expect(screen.getByRole("status")).toHaveTextContent("You're offline.");
  expect(screen.queryByRole("button", { name: "Send now" })).not.toBeInTheDocument();
});

it("shows an unknown-connectivity notice too, not just offline", () => {
  render(<ConnectionBanner {...BASE} state="unknown" savedCount={1} />);

  expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
  expect(screen.getByRole("button", { name: "Send now" })).toBeInTheDocument();
});

it("says taps can't be saved on this phone when canSave is false (storage failing), and offers no Send now", () => {
  render(<ConnectionBanner {...BASE} state="offline" canSave={false} />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "You're offline. Confirmations can't be saved on this phone right now",
  );
  expect(screen.queryByRole("button", { name: "Send now" })).not.toBeInTheDocument();
});

it("shows the storage error even while online (a corrupt queue shows nothing otherwise)", () => {
  render(<ConnectionBanner {...BASE} state="online" canSave={false} savedCount={0} />);

  const banner = screen.getByRole("status");
  expect(banner).toHaveTextContent("Confirmations can't be saved on this phone right now");
  expect(banner).not.toHaveTextContent("You're offline");
  expect(screen.queryByRole("button", { name: "Send now" })).not.toBeInTheDocument();
});

it("shows the session-expired notice once /me confirmed it, even while online, with a sign-in link and its own Send now", () => {
  const onSendNow = vi.fn();
  render(<ConnectionBanner {...BASE} paused={true} sessionExpired={true} savedCount={1} onSendNow={onSendNow} />);

  const banner = screen.getByRole("status");
  expect(banner).toHaveTextContent(
    "Your session expired. Sign in again, and the 1 confirmation saved on this phone will be sent.",
  );
  expect(within(banner).getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?expired=1");
  fireEvent.click(within(banner).getByRole("button", { name: "Send now" }));
  expect(onSendNow).toHaveBeenCalledTimes(1);
});

it("doesn't say the session expired while paused before /me has confirmed it", () => {
  render(<ConnectionBanner {...BASE} paused={true} savedCount={2} />);

  const banner = screen.getByRole("status");
  expect(banner).not.toHaveTextContent(/session expired/i);
  expect(banner).toHaveTextContent(
    "Sending is paused while your sign-in is checked. Once it is, the 2 confirmations saved on this phone will be sent.",
  );
  expect(within(banner).getByRole("link", { name: "Sign in again" })).toBeInTheDocument();
  expect(within(banner).getByRole("button", { name: "Send now" })).toBeInTheDocument();
});

it("the paused notice takes priority over the offline/unavailable wording", () => {
  render(<ConnectionBanner {...BASE} paused={true} sessionExpired={true} state="offline" canSave={false} />);

  expect(screen.getByRole("status")).toHaveTextContent("Your session expired.");
});

it('marks the banner aria-live="polite" so its wording changes are announced without stealing focus', () => {
  const { rerender } = render(<ConnectionBanner {...BASE} state="offline" savedCount={0} />);

  const banner = screen.getByRole("status");
  expect(banner).toHaveAttribute("aria-live", "polite");

  document.body.focus();
  rerender(<ConnectionBanner {...BASE} state="offline" savedCount={2} />);

  expect(screen.getByRole("status")).toHaveTextContent("2 confirmations");
  expect(document.activeElement).toBe(document.body);
});

it("keeps the same status element mounted across a state change (not a remount)", () => {
  const { rerender } = render(<ConnectionBanner {...BASE} state="offline" savedCount={0} />);
  const banner = screen.getByRole("status");

  rerender(<ConnectionBanner {...BASE} paused={true} sessionExpired={true} savedCount={1} />);

  expect(screen.getByRole("status")).toBe(banner);
});
