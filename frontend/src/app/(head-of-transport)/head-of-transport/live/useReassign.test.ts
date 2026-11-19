// The reassign panel's logic (SCRUM-274): reassignFailure() for every answer of the contract's error table,
// and useReassign() with the drivers, routes and runs APIs mocked at the module boundary.

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDrivers, type Driver } from "@/lib/api/drivers";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { listRoutes, type RouteSummary } from "@/lib/api/routes";
import { getRunReassignments, reassignRun, type Reassignment, type RunSummary } from "@/lib/api/runs";
import {
  REASON_MAX_LENGTH,
  reassignFailure,
  reassignSuccessMessage,
  useReassign,
} from "./useReassign";

vi.mock("@/lib/api/runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/runs")>()),
  reassignRun: vi.fn(),
  getRunReassignments: vi.fn(),
}));
vi.mock("@/lib/api/drivers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/drivers")>()),
  getDrivers: vi.fn(),
}));
vi.mock("@/lib/api/routes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/routes")>()),
  listRoutes: vi.fn(),
}));

const reassign = vi.mocked(reassignRun);
const history = vi.mocked(getRunReassignments);
const drivers = vi.mocked(getDrivers);
const routes = vi.mocked(listRoutes);

const KARIM = { id: "d-karim", firstName: "Karim", lastName: "Haddad" };
const NADIM = { id: "d-nadim", firstName: "Nadim", lastName: "Khoury" };

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    date: "2026-11-16",
    direction: "MORNING",
    state: "IN_PROGRESS",
    schoolTime: "08:00",
    startedAt: "2026-11-16T05:00:00Z",
    endedAt: null,
    route: { id: "route-1", name: "Hamra" },
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 14 },
    driver: KARIM,
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

const entry: Reassignment = {
  id: "ra-1",
  runId: "run-1",
  direction: "MORNING",
  runState: "IN_PROGRESS",
  fromDriver: KARIM,
  toDriver: NADIM,
  changedBy: { id: "h-1", email: "head@example.com" },
  changedAt: "2026-11-16T05:30:00Z",
  reason: "Karim is sick",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

let refreshRuns: ReturnType<typeof vi.fn<() => Promise<void>>>;
let reportUnauthorized: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  reassign.mockReset().mockResolvedValue(run({ driver: NADIM }));
  history.mockReset().mockResolvedValue([]);
  drivers.mockReset().mockResolvedValue([driver(KARIM.id), driver(NADIM.id), driver("d-busy"), driver("d-new", "invited")]);
  routes.mockReset().mockResolvedValue([route("route-1", KARIM.id), route("route-2", "d-busy")]);
  refreshRuns = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  reportUnauthorized = vi.fn<() => void>();
});

async function renderPanel(summary = run()) {
  const hook = renderHook(({ current }) => useReassign(current, refreshRuns, reportUnauthorized), { initialProps: { current: summary } });
  await waitFor(() => expect(hook.result.current.candidates).not.toBeNull());
  await waitFor(() => expect(hook.result.current.history).not.toBeNull());
  return hook;
}

describe("reassignFailure: the contract's error table", () => {
  it("400 with errors: messages per field, no reload unless driverId", () => {
    const result = reassignFailure(new ApiValidationError({ reason: "size must be between 0 and 200" }));
    expect(result).toEqual({
      message: "Check the highlighted fields and try again.",
      fieldErrors: { reason: "size must be between 0 and 200" },
      reloadRuns: false,
      reloadDrivers: false,
    });
  });

  it("400 errors.fromDriverId: no field shows it, so it is the alert's message", () => {
    expect(reassignFailure(new ApiValidationError({ fromDriverId: "must not be null" }))).toEqual({
      message: "must not be null",
      fieldErrors: { fromDriverId: "must not be null" },
      reloadRuns: false,
      reloadDrivers: false,
    });
  });

  it("400 errors.driverId wins over errors.fromDriverId", () => {
    expect(
      reassignFailure(new ApiValidationError({ driverId: "must not be null", fromDriverId: "must not be null" })),
    ).toMatchObject({ message: "This driver can't take the route. Pick another driver.", reloadDrivers: true });
  });

  it("400 with only a detail (malformed body): the generic message", () => {
    expect(reassignFailure(new ApiError(400, "Malformed request body"))).toEqual({
      message: "Something went wrong. Please try again.",
      fieldErrors: {},
      reloadRuns: false,
      reloadDrivers: false,
    });
  });

  it("404 Run not found: banner and reload the runs", () => {
    expect(reassignFailure(new ApiError(404, "Run not found"))).toEqual({
      message: "This run no longer exists. The list has been refreshed.",
      fieldErrors: {},
      reloadRuns: true,
      reloadDrivers: false,
    });
  });

  it("404 Driver not found.: under the picker and reload the drivers", () => {
    expect(reassignFailure(new ApiError(404, "Driver not found."))).toEqual({
      message: "That driver no longer exists. Pick another driver.",
      fieldErrors: { driverId: "That driver no longer exists. Pick another driver." },
      reloadRuns: false,
      reloadDrivers: true,
    });
  });

  it.each(["Run not found.", "run not found", "Driver not found", "Driver does not exist"])(
    "404 with wording the panel doesn't know (%s): shown as sent, never \"run no longer exists\"",
    (detail) => {
      expect(reassignFailure(new ApiError(404, detail))).toEqual({
        message: detail,
        fieldErrors: {},
        reloadRuns: true,
        reloadDrivers: false,
      });
    },
  );

  it("409 detail, not today's run", () => {
    expect(reassignFailure(new ApiError(409, "Only today's runs can be reassigned."))).toMatchObject({
      message: "Only today's runs can be reassigned.",
      fieldErrors: {},
      reloadRuns: true,
    });
  });

  it("409 detail, run FINISHED", () => {
    expect(reassignFailure(new ApiError(409, "Run is FINISHED, so it cannot be reassigned"))).toMatchObject({
      message: "This run has already finished, so its driver can't be changed.",
      fieldErrors: {},
      reloadRuns: true,
      reloadDrivers: false,
    });
  });

  it("409 detail, stale fromDriverId: names the current driver, reloads runs and drivers", () => {
    expect(
      reassignFailure(new ApiError(409, "The driver of this run is now Walid Saad. Reload and try again.")),
    ).toEqual({
      message:
        "Someone else already changed this run's driver to Walid Saad. The list has been refreshed; check it before trying again.",
      fieldErrors: {},
      reloadRuns: true,
      reloadDrivers: true,
    });
  });

  it("409 with an unknown detail: shown as sent, with a reload", () => {
    expect(reassignFailure(new ApiError(409, "Something new"))).toMatchObject({
      message: "Something new",
      reloadRuns: true,
    });
  });

  it.each([
    "Cannot put a deactivated driver on a route.",
    "Driver has not set up their account yet.",
    'Driver is already on route "Verdun".',
    "Driver is already on another route.",
  ])("409 errors.driverId %s: under the picker and reload the eligible list", (message) => {
    expect(reassignFailure(new ApiValidationError({ driverId: message }))).toEqual({
      message: "This driver can't take the route. Pick another driver.",
      fieldErrors: { driverId: message },
      reloadRuns: false,
      reloadDrivers: true,
    });
  });

  it("401 and 403", () => {
    expect(reassignFailure(new ApiError(401)).message).toBe("Your session has expired. Please sign in again.");
    expect(reassignFailure(new ApiError(403, "Access denied")).message).toBe(
      "You don't have permission to reassign drivers.",
    );
  });

  it.each([new TypeError("Failed to fetch"), new ApiError(500), new ApiError(503), new ApiError(429)])(
    "network, 5xx and 429 (%s): the generic message, nothing reloaded",
    (error) => {
      expect(reassignFailure(error)).toEqual({
        message: "Something went wrong. Please try again.",
        fieldErrors: {},
        reloadRuns: false,
        reloadDrivers: false,
      });
    },
  );
});

describe("reassignSuccessMessage", () => {
  it("says the change applies from now on, to both of today's runs", () => {
    expect(reassignSuccessMessage(run({ driver: NADIM }))).toBe(
      "Nadim Khoury now drives Hamra, from now on, for both of today's runs.",
    );
  });
});

describe("useReassign: loading", () => {
  it("loads the eligible drivers and the run's history", async () => {
    history.mockResolvedValue([entry]);
    const { result } = await renderPanel();
    expect(result.current.candidates?.map((d) => d.id)).toEqual([NADIM.id]);
    expect(result.current.history).toEqual([entry]);
    expect(history).toHaveBeenCalledWith("run-1");
    expect(result.current.candidatesFailed).toBe(false);
    expect(result.current.historyFailed).toBe(false);
  });

  it("reports failed loads separately, and reloads on request", async () => {
    drivers.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    history.mockRejectedValueOnce(new ApiError(500));
    const { result } = renderHook(() => useReassign(run(), refreshRuns, reportUnauthorized));
    await waitFor(() => expect(result.current.candidatesFailed).toBe(true));
    await waitFor(() => expect(result.current.historyFailed).toBe(true));
    expect(result.current.candidates).toBeNull();
    expect(result.current.history).toBeNull();

    await act(() => result.current.reloadCandidates());
    await act(() => result.current.reloadHistory());
    expect(result.current.candidates?.map((d) => d.id)).toEqual([NADIM.id]);
    expect(result.current.history).toEqual([]);
  });

  it("an older load answering last doesn't overwrite a newer one", async () => {
    const { result } = await renderPanel();
    const slow = deferred<Reassignment[]>();
    history.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([entry]);
    let first!: Promise<void>;
    act(() => {
      first = result.current.reloadHistory();
    });
    await act(() => result.current.reloadHistory());
    await act(async () => {
      slow.resolve([]);
      await first;
    });
    expect(result.current.history).toEqual([entry]);
  });

  it("another run reloads the history for that run", async () => {
    const { rerender } = await renderPanel();
    rerender({ current: run({ id: "run-2" }) });
    await waitFor(() => expect(history).toHaveBeenLastCalledWith("run-2"));
  });
});

describe("useReassign: submit", () => {
  it("success: sends driverId and the driver the head saw, then refetches runs, history and the eligible list", async () => {
    const { result } = await renderPanel();
    history.mockResolvedValue([entry]);
    routes.mockResolvedValue([route("route-1", NADIM.id), route("route-2", "d-busy")]);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.submit(NADIM.id, "  Karim is sick  ");
    });
    expect(ok).toBe(true);
    expect(reassign).toHaveBeenCalledWith("run-1", {
      driverId: NADIM.id,
      fromDriverId: KARIM.id,
      reason: "Karim is sick",
    });
    expect(refreshRuns).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(2);
    expect(drivers).toHaveBeenCalledTimes(2);
    expect(result.current.reassigned).toEqual(run({ driver: NADIM }));
    expect(result.current.history).toEqual([entry]);
    expect(result.current.failure).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it("takes counts, state and startedAt from the server's answer, not recomputed from the run it was given (S7)", async () => {
    // Different from run()'s own counts/state/startedAt, so an equal result can only have come from the
    // server's response — proving the hook doesn't substitute or reset these from the `run` prop it holds.
    const serverAnswer = run({
      driver: NADIM,
      counts: { students: 5, absent: 1, pickedUp: 4, droppedOff: 1, notPresent: 0 },
      state: "IN_PROGRESS",
      startedAt: "2026-11-16T05:05:00Z",
    });
    reassign.mockResolvedValueOnce(serverAnswer);
    const { result } = await renderPanel();
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.reassigned).toEqual(serverAnswer);
    expect(result.current.reassigned?.counts).not.toEqual(run().counts);
    expect(result.current.reassigned?.startedAt).not.toBe(run().startedAt);
  });

  it("currentDriver starts as the run's driver and becomes the server's after a successful change (S4)", async () => {
    const { result } = await renderPanel();
    expect(result.current.currentDriver).toEqual(KARIM);
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.currentDriver).toEqual(NADIM);
  });

  it("a blank reason is left out of the body", async () => {
    const { result } = await renderPanel();
    await act(async () => {
      await result.current.submit(NADIM.id, "   ");
    });
    expect(reassign).toHaveBeenCalledWith("run-1", { driverId: NADIM.id, fromDriverId: KARIM.id });
    // The first POST made Nadim the driver, so he is the one the second replaces.
    await act(async () => {
      await result.current.submit("d-walid");
    });
    expect(reassign).toHaveBeenLastCalledWith("run-1", { driverId: "d-walid", fromDriverId: NADIM.id });
  });

  it("a reason over 200 characters is refused before sending", async () => {
    const { result } = await renderPanel();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.submit(NADIM.id, "x".repeat(REASON_MAX_LENGTH + 1));
    });
    expect(ok).toBe(false);
    expect(reassign).not.toHaveBeenCalled();
    expect(result.current.failure?.fieldErrors.reason).toBe("Keep the reason to 200 characters or fewer.");
    await act(async () => {
      ok = await result.current.submit(NADIM.id, "x".repeat(REASON_MAX_LENGTH));
    });
    expect(ok).toBe(true);
  });

  it("guards against a double submit while one is pending", async () => {
    const { result } = await renderPanel();
    const pending = deferred<RunSummary>();
    reassign.mockReturnValueOnce(pending.promise);
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.submit(NADIM.id);
      second = result.current.submit(NADIM.id);
    });
    expect(await second).toBe(false);
    expect(reassign).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(true);
    await act(async () => {
      pending.resolve(run({ driver: NADIM }));
      await first;
    });
    expect(await first).toBe(true);
    expect(result.current.submitting).toBe(false);
    // Free again once it answered.
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(reassign).toHaveBeenCalledTimes(2);
  });

  it("is free again after a failure", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.submitting).toBe(false);
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(reassign).toHaveBeenCalledTimes(2);
    expect(result.current.failure).toBeNull();
  });

  it("a 404 Run not found reloads the runs and the history, not the drivers", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new ApiError(404, "Run not found"));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.submit(NADIM.id);
    });
    expect(ok).toBe(false);
    expect(result.current.failure?.message).toBe("This run no longer exists. The list has been refreshed.");
    expect(refreshRuns).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(2);
    expect(drivers).toHaveBeenCalledTimes(1);
    expect(result.current.reassigned).toBeNull();
  });

  it("a 404 Driver not found reloads the eligible list only", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new ApiError(404, "Driver not found."));
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.failure?.fieldErrors.driverId).toBe("That driver no longer exists. Pick another driver.");
    expect(refreshRuns).not.toHaveBeenCalled();
    await waitFor(() => expect(drivers).toHaveBeenCalledTimes(2));
  });

  it("a 409 errors.driverId shows under the picker and reloads the eligible list", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new ApiValidationError({ driverId: 'Driver is already on route "Verdun".' }));
    routes.mockResolvedValue([route("route-1", KARIM.id), route("route-2", "d-busy"), route("Verdun", NADIM.id)]);
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.failure?.fieldErrors.driverId).toBe('Driver is already on route "Verdun".');
    await waitFor(() => expect(result.current.candidates).toEqual([]));
    expect(refreshRuns).not.toHaveBeenCalled();
  });

  it("a 409 stale driver reloads the runs, the history and the eligible list", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new ApiError(409, "The driver of this run is now Walid Saad. Reload and try again."));
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.failure?.message).toMatch(/already changed this run's driver to Walid Saad/);
    expect(refreshRuns).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(drivers).toHaveBeenCalledTimes(2));
  });

  it("a 409 FINISHED and a 409 not today's both reload the runs", async () => {
    const { result } = await renderPanel();
    reassign
      .mockRejectedValueOnce(new ApiError(409, "Run is FINISHED, so it cannot be reassigned"))
      .mockRejectedValueOnce(new ApiError(409, "Only today's runs can be reassigned."));
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.failure?.message).toBe("This run has already finished, so its driver can't be changed.");
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.failure?.message).toBe("Only today's runs can be reassigned.");
    expect(refreshRuns).toHaveBeenCalledTimes(2);
  });

  it("a 400 with errors keeps the field message, nothing reloaded", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new ApiValidationError({ reason: "size must be between 0 and 200" }));
    await act(async () => {
      await result.current.submit(NADIM.id, "ok");
    });
    expect(result.current.failure?.fieldErrors).toEqual({ reason: "size must be between 0 and 200" });
    expect(refreshRuns).not.toHaveBeenCalled();
    expect(drivers).toHaveBeenCalledTimes(1);
  });

  it("a network failure gives the generic message and reloads nothing", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.failure?.message).toBe("Something went wrong. Please try again.");
    expect(refreshRuns).not.toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(1);
  });

  it("keeps sending the driver the head saw when a poll changes the run's driver", async () => {
    const { result, rerender } = await renderPanel();
    rerender({ current: run({ driver: NADIM }) });
    await act(async () => {
      await result.current.submit("d-walid");
    });
    expect(reassign).toHaveBeenCalledWith("run-1", { driverId: "d-walid", fromDriverId: KARIM.id });
  });

  it("submit twice in one panel: the second sends the driver the first POST answered with", async () => {
    const { result } = await renderPanel();
    // After the first change Nadim is on route-1 and Karim is spare.
    drivers.mockResolvedValue([driver(KARIM.id), driver(NADIM.id), driver("d-walid"), driver("d-busy")]);
    routes.mockResolvedValue([route("route-1", NADIM.id), route("route-2", "d-busy")]);
    await act(async () => {
      expect(await result.current.submit(NADIM.id)).toBe(true);
    });

    reassign.mockResolvedValueOnce(run({ driver: { id: "d-walid", firstName: "Walid", lastName: "Saad" } }));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.submit("d-walid");
    });
    expect(ok).toBe(true);
    expect(reassign).toHaveBeenLastCalledWith("run-1", { driverId: "d-walid", fromDriverId: NADIM.id });
    expect(result.current.failure).toBeNull();
    expect(result.current.reassigned?.driver.id).toBe("d-walid");
  });

  it("after a reassignment the previous driver, now spare, can be picked again and the new one can't", async () => {
    const { result } = await renderPanel();
    expect(result.current.candidates?.map((d) => d.id)).not.toContain(KARIM.id);
    routes.mockResolvedValue([route("route-1", NADIM.id), route("route-2", "d-busy")]);
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(result.current.candidates?.map((d) => d.id)).toEqual([KARIM.id]);

    await act(async () => {
      await result.current.submit(KARIM.id);
    });
    expect(reassign).toHaveBeenLastCalledWith("run-1", { driverId: KARIM.id, fromDriverId: NADIM.id });
  });

  it("a failed POST leaves the driver the head saw unchanged", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new ApiError(500));
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(reassign).toHaveBeenLastCalledWith("run-1", { driverId: NADIM.id, fromDriverId: KARIM.id });
  });

  it("another run starts from that run's driver", async () => {
    const { result, rerender } = await renderPanel();
    rerender({ current: run({ id: "run-2", driver: NADIM }) });
    await act(async () => {
      await result.current.submit(KARIM.id);
    });
    expect(reassign).toHaveBeenLastCalledWith("run-2", { driverId: KARIM.id, fromDriverId: NADIM.id });
  });

  it("a 401 on the POST hands over to the polling hook's /me check", async () => {
    const { result } = await renderPanel();
    reassign.mockRejectedValueOnce(new ApiError(401));
    await act(async () => {
      await result.current.submit(NADIM.id);
    });
    expect(reportUnauthorized).toHaveBeenCalledTimes(1);
    expect(result.current.failure?.message).toBe("Your session has expired. Please sign in again.");
  });

  it("other failures (403, 409, network) don't report a 401", async () => {
    const { result } = await renderPanel();
    reassign
      .mockRejectedValueOnce(new ApiError(403, "Access denied"))
      .mockRejectedValueOnce(new ApiError(409, "Only today's runs can be reassigned."))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.submit(NADIM.id);
      });
    }
    expect(reportUnauthorized).not.toHaveBeenCalled();
  });

  it("an answer after unmount changes nothing and doesn't refetch", async () => {
    const { result, unmount } = await renderPanel();
    const pending = deferred<RunSummary>();
    reassign.mockReturnValueOnce(pending.promise);
    let submitted!: Promise<boolean>;
    act(() => {
      submitted = result.current.submit(NADIM.id);
    });
    unmount();
    pending.resolve(run({ driver: NADIM }));
    expect(await submitted).toBe(true);
    expect(refreshRuns).not.toHaveBeenCalled();
  });
});
