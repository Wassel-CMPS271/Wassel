import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectionBanner, type ConnectionBannerProps } from "./ConnectionBanner";

afterEach(() => {
  cleanup();
});

const BASE: ConnectionBannerProps = {
  state: "online",
  paused: false,
  savedCount: 0,
  replayAvailable: true,
  onSendNow: () => {},
};

it("renders nothing while online, not paused and with nothing saved", () => {
  render(<ConnectionBanner {...BASE} />);

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("renders nothing while online even with items saved (it's only about reachability)", () => {
  render(<ConnectionBanner {...BASE} savedCount={3} />);

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
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

  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send now" })).toBeInTheDocument();
});

it("says offline saving isn't available yet when replayAvailable is false, and offers no Send now", () => {
  render(<ConnectionBanner {...BASE} state="offline" replayAvailable={false} />);

  expect(screen.getByRole("status")).toHaveTextContent("Offline saving isn't available yet");
  expect(screen.queryByRole("button", { name: "Send now" })).not.toBeInTheDocument();
});

it("shows the signed-out notice when paused, even while online, with its own Send now", () => {
  const onSendNow = vi.fn();
  render(<ConnectionBanner {...BASE} paused={true} savedCount={1} onSendNow={onSendNow} />);

  const banner = screen.getByRole("status");
  expect(banner).toHaveTextContent("You're signed out.");
  fireEvent.click(within(banner).getByRole("button", { name: "Send now" }));
  expect(onSendNow).toHaveBeenCalledTimes(1);
});

it("the paused notice takes priority over the offline/unavailable wording", () => {
  render(<ConnectionBanner {...BASE} paused={true} state="offline" replayAvailable={false} />);

  expect(screen.getByRole("status")).toHaveTextContent("You're signed out.");
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
