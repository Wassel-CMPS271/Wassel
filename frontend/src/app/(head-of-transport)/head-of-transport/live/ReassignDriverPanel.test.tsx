// ReassignDriverPanel (SCRUM-274), against a stubbed fetch — the real request() runs (like runs.test.ts),
// not a module mock of the API — so these exercise useReassign and the dialog together.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver } from "@/lib/api/drivers";
import type { RouteSummary } from "@/lib/api/routes";
import type { Reassignment, RunSummary } from "@/lib/api/runs";
import { ReassignDriverPanel } from "./ReassignDriverPanel";
import { REASON_MAX_LENGTH } from "./useReassign";

const BASE = "http://localhost:8080/api/head-of-transport";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
}

interface Backend {
  drivers: { status: number; body: unknown };
  routes: { status: number; body: unknown };
  reassign: { status: number; body: unknown };
  reassignments: { status: number; body: unknown };
}

function defaultBackend(): Backend {
  return {
    drivers: {
      status: 200,
      body: [driver("d-nadim"), driver("d-busy"), driver("d-invited", "invited"), driver("d-karim")] satisfies Driver[],
    },
    routes: { status: 200, body: [route("route-1", "d-karim"), route("route-2", "d-busy")] satisfies RouteSummary[] },
    reassign: { status: 201, body: run({ driver: { id: "d-nadim", firstName: "Nadim", lastName: "Khoury" } }) },
    reassignments: { status: 200, body: [] },
  };
}

function stubBackend(backend: Backend) {
  const fetchMock = vi.fn((url: string, init?: { method?: string }) => {
    const path = url.replace(BASE, "");
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
    driver: { id: "d-karim", firstName: "Karim", lastName: "Haddad" },
    counts: { students: 5, absent: 1, pickedUp: 2, droppedOff: 0, notPresent: 0 },
    locationSharing: true,
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

function entry(overrides: Partial<Reassignment> = {}): Reassignment {
  return {
    id: "ra-1",
    runId: "run-1",
    direction: "MORNING",
    runState: "IN_PROGRESS",
    fromDriver: { id: "d-old", firstName: "Walid", lastName: "Saad" },
    toDriver: { id: "d-karim", firstName: "Karim", lastName: "Haddad" },
    changedBy: { id: "h-1", email: "head@example.com" },
    changedAt: "2026-11-16T05:30:00Z",
    reason: "Walid is sick",
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function renderPanel(backend: Backend = defaultBackend(), run_ = run()) {
  stubBackend(backend);
  const onClose = vi.fn();
  const refreshRuns = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  render(<ReassignDriverPanel run={run_} refreshRuns={refreshRuns} onClose={onClose} />);
  await flush();
  const dialog = screen.getByRole("dialog");
  return { dialog, onClose, refreshRuns };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ReassignDriverPanel: loading", () => {
  it("lists eligible drivers (active, not on a route, not the current driver) and focuses the picker", async () => {
    const { dialog } = await renderPanel();
    const select = within(dialog).getByRole("combobox", { name: "New driver" });
    expect(within(select).queryByRole("option", { name: "d-karim x" })).not.toBeInTheDocument(); // current driver
    expect(within(select).queryByRole("option", { name: "d-busy x" })).not.toBeInTheDocument(); // on a route
    expect(within(select).queryByRole("option", { name: "d-invited x" })).not.toBeInTheDocument(); // not active
    expect(within(select).getByRole("option", { name: "d-nadim x" })).toBeInTheDocument();
    expect(select).toHaveFocus();
  });

  it("says so and disables Submit when there are no eligible drivers", async () => {
    const backend = defaultBackend();
    backend.drivers.body = [driver("d-karim")];
    const { dialog } = await renderPanel(backend);
    expect(within(dialog).getByText(/No eligible drivers are available right now/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("shows a short history list (who, when, reason)", async () => {
    const backend = defaultBackend();
    backend.reassignments.body = [entry()];
    const { dialog } = await renderPanel(backend);
    const history = within(dialog).getByRole("list");
    expect(within(history).getByText(/Karim Haddad replaced Walid Saad/)).toBeInTheDocument();
    expect(within(history).getByText(/head@example.com/)).toBeInTheDocument();
    expect(within(history).getByText(/Walid is sick/)).toBeInTheDocument();
  });

  it("says when there are no changes yet", async () => {
    const { dialog } = await renderPanel();
    expect(within(dialog).getByText("No changes yet today.")).toBeInTheDocument();
  });

  it("reports a failed drivers/routes load and reloads on request", async () => {
    const backend = defaultBackend();
    backend.drivers.status = 500;
    backend.drivers.body = {};
    const { dialog } = await renderPanel(backend);
    expect(within(dialog).getByText(/Couldn't load eligible drivers/)).toBeInTheDocument();

    backend.drivers.status = 200;
    backend.drivers.body = [driver("d-nadim"), driver("d-karim")];
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    await flush();
    expect(within(dialog).getByRole("combobox", { name: "New driver" })).toBeInTheDocument();
  });
});

describe("ReassignDriverPanel: accessibility", () => {
  it("has a status live region for updates and an alert region reserved for errors", async () => {
    const { dialog } = await renderPanel();
    // The status region stays mounted even with nothing to say.
    expect(within(dialog).getByRole("status")).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("labels the reason field and its character counter", async () => {
    const { dialog } = await renderPanel();
    const reason = within(dialog).getByLabelText("Reason (optional)");
    fireEvent.change(reason, { target: { value: "Flat tyre" } });
    expect(within(dialog).getByText(`9/${REASON_MAX_LENGTH}`)).toBeInTheDocument();
  });
});

describe("ReassignDriverPanel: submit", () => {
  async function pickAndSubmit(dialog: HTMLElement, driverId = "d-nadim", reason?: string) {
    fireEvent.change(within(dialog).getByRole("combobox", { name: "New driver" }), { target: { value: driverId } });
    if (reason !== undefined) {
      fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), { target: { value: reason } });
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit" }));
    await flush();
  }

  it("success: shows the message, both of today's runs note stays visible, and the history refreshes", async () => {
    const backend = defaultBackend();
    const { dialog, refreshRuns } = await renderPanel(backend);
    backend.reassignments.body = [entry({ toDriver: { id: "d-nadim", firstName: "Nadim", lastName: "Khoury" } })];

    await pickAndSubmit(dialog, "d-nadim", "Karim is sick");

    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Nadim Khoury now drives Hamra, from now on, for both of today's runs.",
    );
    expect(refreshRuns).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText(/Nadim Khoury replaced Walid Saad/)).toBeInTheDocument();
  });

  it("guards against a double submit: the button disables and only one request is sent", async () => {
    const backend = defaultBackend();
    let resolveReassign!: (value: Response | PromiseLike<Response>) => void;
    const { dialog } = await renderPanel(backend);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveReassign = resolve)),
    );

    fireEvent.change(within(dialog).getByRole("combobox", { name: "New driver" }), { target: { value: "d-nadim" } });
    const submit = within(dialog).getByRole("button", { name: "Submit" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await flush();
    expect(submit).toBeDisabled();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Saving…");

    await act(async () => {
      const body = run({ driver: { id: "d-nadim", firstName: "Nadim", lastName: "Khoury" } });
      resolveReassign({ ok: true, status: 201, json: () => Promise.resolve(body) } as unknown as Response);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("a reason over 200 characters is truncated as typed, with the counter pinned at the max", async () => {
    const { dialog } = await renderPanel();
    const reason = within(dialog).getByLabelText("Reason (optional)") as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "x".repeat(REASON_MAX_LENGTH + 50) } });
    expect(reason.value).toHaveLength(REASON_MAX_LENGTH);
    expect(within(dialog).getByText(`${REASON_MAX_LENGTH}/${REASON_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it("400/409 errors.driverId shows under the picker and reloads the eligible list", async () => {
    const backend = defaultBackend();
    backend.reassign = { status: 409, body: { errors: { driverId: 'Driver is already on route "Verdun".' } } };
    const { dialog } = await renderPanel(backend);

    await pickAndSubmit(dialog);
    // Both the banner and the field error announce via role="alert" — that's deliberate (per-field errors
    // and the general message are both required), so assert on text rather than a single role query.
    expect(within(dialog).getByText("This driver can't take the route. Pick another driver.")).toBeInTheDocument();
    expect(within(dialog).getByText('Driver is already on route "Verdun".')).toBeInTheDocument();
  });

  it("a reason field error (400) shows under the textarea", async () => {
    const backend = defaultBackend();
    backend.reassign = { status: 400, body: { errors: { reason: "size must be between 0 and 200" } } };
    const { dialog } = await renderPanel(backend);

    await pickAndSubmit(dialog, "d-nadim", "ok");
    expect(within(dialog).getByText("size must be between 0 and 200")).toBeInTheDocument();
  });

  it("404 Run not found shows a banner and refreshes the runs", async () => {
    const backend = defaultBackend();
    backend.reassign = { status: 404, body: { detail: "Run not found" } };
    const { dialog, refreshRuns } = await renderPanel(backend);

    await pickAndSubmit(dialog);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "This run no longer exists. The list has been refreshed.",
    );
    expect(refreshRuns).toHaveBeenCalledTimes(1);
  });

  it("409 stale driver shows a banner naming the current driver and reloads runs and drivers", async () => {
    const backend = defaultBackend();
    backend.reassign = {
      status: 409,
      body: { detail: "The driver of this run is now Walid Saad. Reload and try again." },
    };
    const { dialog, refreshRuns } = await renderPanel(backend);

    await pickAndSubmit(dialog);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/already changed this run's driver to Walid Saad/);
    expect(refreshRuns).toHaveBeenCalledTimes(1);
  });

  it("a network failure shows the generic message and nothing is reloaded", async () => {
    const backend = defaultBackend();
    const { dialog, refreshRuns } = await renderPanel(backend);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));

    await pickAndSubmit(dialog);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(refreshRuns).not.toHaveBeenCalled();
  });

  it("Cancel calls onClose without submitting", async () => {
    const { dialog, onClose } = await renderPanel();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
