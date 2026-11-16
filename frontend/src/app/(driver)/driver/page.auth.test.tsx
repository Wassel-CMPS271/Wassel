// The driver Today screen's 401 handling with GPS sharing on (SCRUM-273): only the
// queue's own 401 pauses the queue before /me has answered, a 401 from any other call
// leaves it running unless /me confirms the session is gone, and a confirmed sign-out
// sends no location-sharing request on the way to /login. page.queue.test.tsx covers
// the queue's side with GPS unavailable; useGpsSharing.test.ts the hook on its own.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { me } from "@/lib/api/auth";
import type { ConfirmationReplayInput } from "@/lib/api/confirmationReplay";
import { ApiError } from "@/lib/api/errors";
import { getDriverToday, type DriverDay, type Run } from "@/lib/api/runs";
import { todayInBeirut } from "@/lib/offline/queue";
import sample from "../../../../../docs/contracts/samples/runs/driver-today.json";
import DriverTodayPage from "./page";

vi.mock("@/lib/api/runs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDriverToday: vi.fn(),
  startRun: vi.fn(),
  endRun: vi.fn(),
  confirmStudent: vi.fn(),
}));

const confirm = vi.fn();
vi.mock("@/lib/api/confirmationReplay", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmationReplayApi: { confirm: (...args: [ConfirmationReplayInput]) => confirm(...args) },
}));

const setSharing = vi.fn();
const sendPosition = vi.fn();
vi.mock("@/lib/api/driverGps", () => ({
  driverGpsApi: {
    setSharing: (...args: unknown[]) => setSharing(...args),
    sendPosition: (...args: unknown[]) => sendPosition(...args),
  },
}));

vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  me: vi.fn(),
}));

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

vi.mock("@/components/auth/RoleGuard", () => ({
  useCurrentUser: () => ({ id: "driver-1", email: "karim@wassel.local", role: "DRIVER", schoolId: "s-1" }),
}));

const TODAY = todayInBeirut();
const DAY: DriverDay = {
  ...(sample as unknown as DriverDay),
  date: TODAY,
  runs: (sample as unknown as DriverDay).runs.map((run) => ({ ...run, date: TODAY, locationSharing: false })),
};
const MORNING = DAY.runs[0];
const SIGNED_IN = { id: "driver-1", email: "karim@wassel.local", role: "DRIVER" as const, schoolId: "s-1" };

function runFor(input: ConfirmationReplayInput): Run {
  return {
    ...MORNING,
    stops: MORNING.stops.map((stop) =>
      stop.studentId === input.studentId
        ? { ...stop, confirmation: { status: input.status, at: "2026-10-21T05:00:00Z" } }
        : stop,
    ),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function card(name: string) {
  return screen.getByText(name).closest("li")!;
}

function sharingCalls(): boolean[] {
  return setSharing.mock.calls.map((call) => (call[1] as { enabled: boolean }).enabled);
}

let watchers: PositionCallback[] = [];

beforeEach(() => {
  watchers = [];
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success: PositionCallback) => watchers.push(success)),
      clearWatch: vi.fn(),
    },
  });
  vi.mocked(getDriverToday).mockReset().mockResolvedValue(DAY);
  vi.mocked(me).mockReset();
  confirm.mockReset();
  replace.mockReset();
  setSharing.mockReset().mockImplementation(async (_runId: string, { enabled }: { enabled: boolean }) => ({
    ...MORNING,
    locationSharing: enabled,
  }));
  sendPosition.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete (navigator as { geolocation?: unknown }).geolocation;
  delete (window as { isSecureContext?: unknown }).isSecureContext;
});

// Renders the page, opts in to sharing and waits until the server has confirmed it.
async function renderSharing() {
  render(<DriverTodayPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Share my location" }));
  await vi.waitFor(() => expect(sharingCalls()).toEqual([true]));
  await act(async () => {});
}

function sendFix() {
  act(() =>
    watchers[0]({
      coords: { latitude: 33.89, longitude: 35.5, accuracy: 10 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
}

it("a stray second 401, from GPS, with the session still valid leaves the queue running and doesn't loop", async () => {
  vi.mocked(me).mockResolvedValue(SIGNED_IN);
  // The queue's own stray 401 first: /me says fine, and it resumes once. Its resend
  // is held, so nothing has synced yet when GPS gets its own 401.
  const resend = deferred<Run>();
  confirm.mockRejectedValueOnce(new ApiError(401)).mockReturnValueOnce(resend.promise);
  await renderSharing();

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  expect(me).toHaveBeenCalledTimes(1);

  sendPosition.mockRejectedValueOnce(new ApiError(401));
  sendFix();
  await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(2));
  await act(async () => {});

  // /me said 200: the queue isn't paused, and nothing claims the session expired.
  expect(screen.queryByText(/Sending is paused|Your session expired/)).not.toBeInTheDocument();
  resend.resolve(runFor(confirm.mock.calls[1][0]));
  await within(card("Dana Fares")).findByText("Done · Picked up");

  // A new tap still goes straight out.
  confirm.mockImplementation(async (input: ConfirmationReplayInput) => runFor(input));
  fireEvent.click(within(card("Rami Nasr")).getByRole("button", { name: "Dropped off" }));
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(3));
  expect(confirm.mock.calls[2][0]).toMatchObject({ studentId: MORNING.stops[0].studentId, status: "DROPPED_OFF" });

  // No loop: no further /me, no GPS retry, no redirect.
  await act(async () => {});
  expect(me).toHaveBeenCalledTimes(2);
  expect(sharingCalls()).toEqual([true]);
  expect(replace).not.toHaveBeenCalled();
});

it("a 401 from GPS that /me confirms pauses the queue and redirects to /login?expired=1", async () => {
  vi.mocked(me).mockRejectedValue(new ApiError(401));
  await renderSharing();

  sendPosition.mockRejectedValueOnce(new ApiError(401));
  sendFix();

  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login?expired=1"));
  expect(screen.getByText(/Your session expired/)).toBeInTheDocument();
  // A tap made now is saved, not sent: the queue is paused.
  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));
  await act(async () => {});
  expect(confirm).not.toHaveBeenCalled();
});

it("a queue 401 that /me confirms sends no location-sharing request on the way to /login, nor on unmount", async () => {
  vi.mocked(me).mockRejectedValue(new ApiError(401));
  confirm.mockRejectedValueOnce(new ApiError(401));
  await renderSharing();
  sendFix();
  await vi.waitFor(() => expect(sendPosition).toHaveBeenCalledTimes(1));

  fireEvent.click(within(card("Dana Fares")).getByRole("button", { name: "Picked up" }));

  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login?expired=1"));
  // The GPS card heard first, so it paused as signed out rather than turning sharing off.
  expect(screen.getByText(/Your session expired/)).toBeInTheDocument();
  expect(sharingCalls()).toEqual([true]);
  cleanup(); // The navigation to /login unmounts the page.
  await act(async () => {});
  expect(sharingCalls()).toEqual([true]);
  expect(sendPosition).toHaveBeenCalledTimes(1);
});
