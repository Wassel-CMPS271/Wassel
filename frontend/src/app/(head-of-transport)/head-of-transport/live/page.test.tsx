// The live control screen (SCRUM-274), end to end against a stubbed fetch — the real request() runs, like
// runs.test.ts, rather than mocking the API modules — so these exercise useLivePolling, activeRunViews,
// RunControlRow, FreshnessStatus and ReassignDriverPanel together the way the browser would.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver } from "@/lib/api/drivers";
import type { RouteSummary } from "@/lib/api/routes";
import type { RunLocation, RunsDay, RunSummary } from "@/lib/api/runs";
import { LOCATIONS_POLL_MS } from "./useLivePolling";
import LiveRunsPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const BASE = "http://localhost:8080/api/head-of-transport";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
}

interface Backend {
  runsDay: { status: number; body: unknown };
  locations: { status: number; body: unknown };
  drivers: { status: number; body: unknown };
  routes: { status: number; body: unknown };
  reassign: { status: number; body: unknown };
  reassignments: { status: number; body: unknown };
}

function defaultBackend(): Backend {
  return {
    runsDay: { status: 200, body: { date: "2026-11-16", dayType: "SCHOOL_DAY", runs: [] } satisfies RunsDay },
    locations: { status: 200, body: [] },
    drivers: { status: 200, body: [] },
    routes: { status: 200, body: [] },
    reassign: { status: 500, body: {} },
    reassignments: { status: 200, body: [] },
  };
}

function stubBackend(backend: Backend) {
  const fetchMock = vi.fn((url: string, init?: { method?: string }) => {
    const path = url.replace(BASE, "");
    if (path === "/runs") return jsonResponse(backend.runsDay.status, backend.runsDay.body);
    if (path === "/runs/locations") return jsonResponse(backend.locations.status, backend.locations.body);
    if (path === "/drivers") return jsonResponse(backend.drivers.status, backend.drivers.body);
    if (path === "/routes") return jsonResponse(backend.routes.status, backend.routes.body);
    if (/^\/runs\/[^/]+\/reassignments$/.test(path)) {
      return (init?.method ?? "GET") === "POST"
        ? jsonResponse(backend.reassign.status, backend.reassign.body)
        : jsonResponse(backend.reassignments.status, backend.reassignments.body);
    }
    throw new Error(`Unhandled fetch in test: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    date: "2026-11-16",
    direction: "MORNING",
    state: "IN_PROGRESS",
    schoolTime: "07:30",
    startedAt: "2026-11-16T05:00:00Z",
    endedAt: null,
    route: { id: "route-1", name: "Hamra" },
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 14 },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    counts: { students: 5, absent: 0, pickedUp: 2, droppedOff: 0, notPresent: 0 },
    locationSharing: true,
    ...overrides,
  };
}

function location(overrides: Partial<RunLocation> = {}): RunLocation {
  return {
    runId: "run-1",
    status: "LIVE",
    position: { latitude: 33.89, longitude: 35.5, accuracyMeters: 10, receivedAt: "2026-11-16T05:20:00Z", ageSeconds: 8 },
    remainingStops: 2,
    nextStop: {
      studentId: "s-1",
      firstName: "Hadi",
      lastName: "Rizk",
      plannedTime: "07:18",
      estimate: { arrivesAt: "2026-11-16T05:22:00Z", secondsAway: 120 },
    },
    ...overrides,
  };
}

function driver(id: string, status: Driver["status"] = "active"): Driver {
  return {
    id,
    firstName: id,
    lastName: "x",
    phone: "+961 3 000 000",
    email: `${id}@example.com`,
    status,
    invitedAt: "2026-09-01T08:00:00Z",
    assignedVehicleId: null,
  };
}

function route(id: string, driverId: string): RouteSummary {
  return {
    id,
    name: id,
    vehicle: { id: `v-${id}`, plateNumber: "A 1", capacity: 14 },
    driver: { id: driverId, firstName: "x", lastName: "y" },
    studentCount: 3,
    seatsLeft: 11,
  };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Live runs page: loading and date", () => {
  it("shows a loading status before the first answer, then the date", async () => {
    const backend = defaultBackend();
    stubBackend(backend);
    render(<LiveRunsPage />);
    expect(screen.getByText("Loading live runs…")).toBeInTheDocument();
    await flush();
    expect(screen.getByText(/Monday 16 November 2026/)).toBeInTheDocument();
    expect(screen.queryByText("Loading live runs…")).not.toBeInTheDocument();
  });
});

describe("Live runs page: empty states", () => {
  it("says no runs are in progress on an ordinary school day with none active", async () => {
    stubBackend(defaultBackend());
    render(<LiveRunsPage />);
    await flush();
    expect(screen.getByText("No runs are in progress right now.")).toBeInTheDocument();
  });

  it("says the school is closed on a holiday", async () => {
    const backend = defaultBackend();
    backend.runsDay.body = { date: "2026-11-16", dayType: "HOLIDAY", runs: [] };
    stubBackend(backend);
    render(<LiveRunsPage />);
    await flush();
    expect(screen.getByText("School is closed today, so no runs are scheduled.")).toBeInTheDocument();
    expect(screen.queryByText("No runs are in progress right now.")).not.toBeInTheDocument();
  });
});

describe("Live runs page: rows", () => {
  it("renders LIVE, STALE and both UNAVAILABLE reasons, with planned and live-estimate as separate items, and never the word late", async () => {
    const backend = defaultBackend();
    backend.runsDay.body = {
      date: "2026-11-16",
      dayType: "SCHOOL_DAY",
      runs: [
        run({ id: "live-run", route: { id: "r1", name: "Hamra" } }),
        run({ id: "stale-run", route: { id: "r2", name: "Verdun" }, direction: "AFTERNOON" }),
        run({ id: "not-sharing-run", route: { id: "r3", name: "Achrafieh" }, locationSharing: false }),
        run({ id: "no-fix-run", route: { id: "r4", name: "Gemmayze" } }),
      ],
    };
    backend.locations.body = [
      location({ runId: "live-run" }),
      location({
        runId: "stale-run",
        status: "STALE",
        position: { latitude: 33.89, longitude: 35.5, accuracyMeters: 10, receivedAt: "2026-11-16T05:18:00Z", ageSeconds: 140 },
        nextStop: { studentId: "s-2", firstName: "Sara", lastName: "Khoury", plannedTime: null, estimate: null },
      }),
      location({ runId: "not-sharing-run", status: "UNAVAILABLE", position: null, nextStop: null }),
      location({ runId: "no-fix-run", status: "UNAVAILABLE", position: null, nextStop: null }),
    ];
    stubBackend(backend);
    render(<LiveRunsPage />);
    await flush();

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Last seen 2 min ago")).toBeInTheDocument();
    expect(screen.getByText("Driver is not sharing location")).toBeInTheDocument();
    expect(screen.getByText("No recent position")).toBeInTheDocument();

    expect(screen.queryByText(/late/i)).not.toBeInTheDocument();
  });
});

describe("Live runs page: errors", () => {
  it("first-load failure shows an alert with Retry and no data", async () => {
    const backend = defaultBackend();
    backend.runsDay.status = 500;
    backend.runsDay.body = {};
    backend.locations.status = 500;
    backend.locations.body = {};
    stubBackend(backend);
    render(<LiveRunsPage />);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load live runs.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("a later poll failure keeps the last good data and offers Retry; Retry recovers it", async () => {
    const backend = defaultBackend();
    backend.runsDay.body = {
      date: "2026-11-16",
      dayType: "SCHOOL_DAY",
      runs: [run()],
    };
    backend.locations.body = [location()];
    const fetchMock = stubBackend(backend);
    render(<LiveRunsPage />);
    await flush();
    expect(screen.getByText("Hamra")).toBeInTheDocument();

    backend.locations.status = 503;
    backend.locations.body = {};
    await advance(LOCATIONS_POLL_MS);
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't refresh\. Showing data from/);
    expect(screen.getByText("Hamra")).toBeInTheDocument();

    backend.locations.status = 200;
    backend.locations.body = [location()];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("a 403 mid-session shows the wrong-role message", async () => {
    const backend = defaultBackend();
    backend.runsDay.body = { date: "2026-11-16", dayType: "SCHOOL_DAY", runs: [run()] };
    backend.locations.body = [location()];
    stubBackend(backend);
    render(<LiveRunsPage />);
    await flush();

    backend.locations.status = 403;
    backend.locations.body = { detail: "Access denied" };
    await advance(LOCATIONS_POLL_MS);
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have permission to view live runs.");
  });
});

describe("Live runs page: opening the reassign panel", () => {
  it("opens the dialog from a row's Reassign driver button, with the eligible drivers and history loaded", async () => {
    const backend = defaultBackend();
    backend.runsDay.body = { date: "2026-11-16", dayType: "SCHOOL_DAY", runs: [run()] };
    backend.locations.body = [location()];
    backend.drivers.body = [driver("d-1"), driver("d-2")];
    backend.routes.body = [route("route-1", "d-1")];
    stubBackend(backend);
    render(<LiveRunsPage />);
    await flush();

    const reassignButton = screen.getByRole("button", { name: "Reassign driver for Hamra" });
    // A real click focuses the button before the click handler runs (so openReassign's
    // document.activeElement capture is the button); fireEvent.click alone doesn't move focus in jsdom.
    reassignButton.focus();
    fireEvent.click(reassignButton);
    await flush();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Reassign driver — Hamra/)).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "New driver" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "d-2 x" })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(reassignButton).toHaveFocus();
    await advance(500); // lets the exit animation finish unmounting the dialog
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
