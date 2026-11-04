// The generate-all-routes page (SCRUM-224): progress while it runs, the
// proposal shown without changing anything, Apply (with its confirm),
// Discard, and every stale or conflicting answer.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  applyGeneration,
  discardGeneration,
  generateRoutes,
  type FleetProposal,
  type PlannedRoute,
  type RouteSummary,
  type Stop,
} from "@/lib/api/routes";
import fleetProposalSample from "@/lib/api/__fixtures__/routing/fleet-proposal.json";
import fleetProposalNothingSample from "@/lib/api/__fixtures__/routing/fleet-proposal-nothing.json";
import { mapTheme } from "@/styles/tokens";
import GenerateRoutesPage from "./page";

// Copies of docs/contracts/samples/routing/, so the screen is also checked
// against the contract's own example answers.
const SAMPLE = fleetProposalSample as FleetProposal;
const SAMPLE_NOTHING = fleetProposalNothingSample as FleetProposal;

vi.mock("@/lib/api/routes", () => ({
  generateRoutes: vi.fn(),
  applyGeneration: vi.fn(),
  discardGeneration: vi.fn(),
}));

function stop(studentId: string, name: string, position: number, arrivalTime: string): Stop {
  const [firstName, lastName] = name.split(" ");
  return { studentId, position, firstName, lastName, address: null, latitude: 33.9, longitude: 35.5, arrivalTime };
}

const UPDATED: PlannedRoute = {
  existingRouteId: "r-1",
  name: "Hamra morning run",
  vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 14 },
  driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
  drivingMinutes: 13,
  stops: [
    stop("s-1", "Rami Nasr", 1, "07:17"),
    stop("s-2", "Tarek Mansour", 2, "07:20"),
    stop("s-3", "Salma Khoury", 3, "07:26"),
  ],
  leaving: [{ studentId: "s-9", firstName: "Nour", lastName: "Fakhoury" }],
};

const CREATED: PlannedRoute = {
  existingRouteId: null,
  name: "Route B 654321",
  vehicle: { id: "v-2", plateNumber: "B 654321", capacity: 8 },
  driver: { id: "d-2", firstName: "Rania", lastName: "Khalil" },
  drivingMinutes: 9,
  stops: [stop("s-4", "Dana Aoun", 1, "07:21")],
  leaving: [],
};

const EMPTIED: PlannedRoute = {
  existingRouteId: "r-3",
  name: "Verdun run",
  vehicle: { id: "v-3", plateNumber: "C 111222", capacity: 10 },
  driver: { id: "d-3", firstName: "Omar", lastName: "Saleh" },
  drivingMinutes: 0,
  stops: [],
  leaving: [
    { studentId: "s-7", firstName: "Lina", lastName: "Saad" },
    { studentId: "s-8", firstName: "Hadi", lastName: "Rizk" },
  ],
};

function proposal(overrides: Partial<FleetProposal> = {}): FleetProposal {
  return {
    id: "g-1",
    routes: [UPDATED, CREATED, EMPTIED],
    unplaced: [
      { studentId: "u-1", firstName: "Ali", lastName: "Hamdan", address: null, reason: { code: "CAPACITY_EXCEEDED", message: "No seats left." } },
      { studentId: "u-2", firstName: "Maya", lastName: "Haddad", address: null, reason: { code: "ARRIVAL_TIME_UNREACHABLE", message: "Too far." } },
      { studentId: "u-3", firstName: "Jad", lastName: "Karam", address: null, reason: { code: "NO_PIN", message: "No pin." } },
      { studentId: "u-4", firstName: "Zein", lastName: "Badr", address: null, reason: { code: "SOMETHING_NEW", message: "A reason from the future." } },
    ],
    excludedVehicles: [
      { vehicle: { id: "v-4", plateNumber: "D 333444", capacity: 12 }, message: "No active driver is free for this vehicle." },
    ],
    school: { latitude: 33.9, longitude: 35.48, arrivalTime: "07:30" },
    ...overrides,
  };
}

const NOTHING: FleetProposal = proposal({ id: null, routes: [], excludedVehicles: [] });

function summary(id: string, planned: PlannedRoute): RouteSummary {
  return {
    id,
    name: planned.name,
    vehicle: planned.vehicle,
    driver: planned.driver,
    studentCount: planned.stops.length,
    seatsLeft: planned.vehicle.capacity - planned.stops.length,
  };
}

const APPLIED: RouteSummary[] = [summary("r-1", UPDATED), summary("r-2", CREATED), summary("r-3", EMPTIED)];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function showProposal(answer: FleetProposal = proposal()) {
  vi.mocked(generateRoutes).mockResolvedValueOnce(answer);
  render(<GenerateRoutesPage />);
  fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));
  const heading = await screen.findByRole("heading", {
    level: 2,
    name: answer.id === null ? "Nothing to apply" : "Proposed routes",
  });
  return heading;
}

function routeCard(name: string): HTMLElement {
  return screen.getByRole("heading", { level: 4, name }).closest("li") as HTMLElement;
}

async function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Apply all" }));
  return screen.getByRole("button", { name: "Confirm apply" });
}

beforeEach(() => {
  vi.mocked(generateRoutes).mockReset();
  vi.mocked(applyGeneration).mockReset();
  vi.mocked(discardGeneration).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

it("shows progress with a running elapsed time while generating", async () => {
  vi.useFakeTimers();
  vi.mocked(generateRoutes).mockReturnValue(new Promise(() => {}));
  render(<GenerateRoutesPage />);

  fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));

  expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  const status = screen
    .getAllByRole("status")
    .find((element) => element.textContent?.includes("up to about 20 seconds"));
  expect(status).toBeDefined();
  expect(status).toHaveTextContent("Elapsed: 0 s");

  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(status).toHaveTextContent("Elapsed: 3 s");
});

it("sends one request when Generate is clicked twice", async () => {
  vi.mocked(generateRoutes).mockReturnValue(new Promise(() => {}));
  render(<GenerateRoutesPage />);

  const button = screen.getByRole("button", { name: "Generate routes" });
  fireEvent.click(button);
  fireEvent.click(button);

  expect(generateRoutes).toHaveBeenCalledTimes(1);
});

it("shows the proposal without changing anything, and focuses its heading", async () => {
  const heading = await showProposal();

  await waitFor(() => expect(heading).toHaveFocus());
  expect(applyGeneration).not.toHaveBeenCalled();
  expect(discardGeneration).not.toHaveBeenCalled();
  expect(screen.getByText("3 routes, 4 students not placed. Nothing changes until you apply it.")).toBeInTheDocument();

  const card = routeCard("Hamra morning run");
  expect(within(card).getByText("A 123456")).toBeInTheDocument();
  expect(within(card).getByText("Karim Haddad")).toBeInTheDocument();
  expect(within(card).getByText("3 of 14 seats")).toBeInTheDocument();
  const stops = within(within(card).getByRole("list", { name: /in pickup order/ })).getAllByRole("listitem");
  expect(stops.map((item) => item.textContent)).toEqual([
    "1Stop 1: Rami NasrArrives 07:17",
    "2Stop 2: Tarek MansourArrives 07:20",
    "3Stop 3: Salma KhouryArrives 07:26",
  ]);
});

it("announces the proposal", async () => {
  await showProposal();

  expect(
    screen.getByText("Proposal ready: 3 routes, 4 students not placed. Nothing changes until you apply it."),
  ).toHaveAttribute("role", "status");
});

it("marks new routes and updates of existing routes", async () => {
  await showProposal();

  expect(within(routeCard("Hamra morning run")).getByText("Updates existing route")).toBeInTheDocument();
  expect(within(routeCard("Route B 654321")).getByText("New route")).toBeInTheDocument();
  expect(within(routeCard("Route B 654321")).queryByText("Updates existing route")).not.toBeInTheDocument();
});

it("shows an emptied route with its leaving students, and who leaves a changed route", async () => {
  await showProposal();

  const emptied = routeCard("Verdun run");
  expect(within(emptied).getByText("Emptied")).toBeInTheDocument();
  expect(within(emptied).getByText("0 of 10 seats")).toBeInTheDocument();
  const leaving = within(emptied).getByRole("list", { name: "Leaving Verdun run" });
  expect(within(leaving).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Lina Saad",
    "Hadi Rizk",
  ]);

  const changed = within(routeCard("Hamra morning run")).getByRole("list", { name: "Leaving Hamra morning run" });
  expect(changed).toHaveTextContent("Nour Fakhoury");
  expect(within(routeCard("Route B 654321")).queryByText("Leaving this route")).not.toBeInTheDocument();
});

it("lists the excluded vehicles with their message", async () => {
  await showProposal();

  const section = screen.getByRole("region", { name: "Vehicles not used" });
  expect(within(section).getByText("D 333444")).toBeInTheDocument();
  expect(within(section).getByText("No active driver is free for this vehicle.")).toBeInTheDocument();
});

it("explains each unplaced reason in plain words", async () => {
  await showProposal();

  const section = screen.getByRole("region", { name: "Students not placed (4)" });
  const items = within(section).getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("Ali Hamdan");
  expect(items[0]).toHaveTextContent(/Not enough seats/);
  expect(items[1]).toHaveTextContent("Maya Haddad");
  expect(items[1]).toHaveTextContent(/Too far to reach school on time/);
  expect(items[2]).toHaveTextContent("Jad Karam");
  expect(items[2]).toHaveTextContent(/No map pin/);
  expect(within(items[2]).getByRole("link", { name: "Add a pin on the Students page" })).toHaveAttribute(
    "href",
    "/head-of-transport/students",
  );
  expect(items[3]).toHaveTextContent("This student couldn't be placed.");
  expect(within(items[3]).getByText("A reason from the future.")).toBeInTheDocument();
});

it("has nothing to apply when the proposal has no id", async () => {
  const heading = await showProposal(NOTHING);

  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.getByText("No route could be planned, so there is nothing to apply. Nothing was changed.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Apply all" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Students not placed (4)" })).getAllByRole("listitem")).toHaveLength(4);

  vi.mocked(generateRoutes).mockResolvedValueOnce(proposal());
  fireEvent.click(screen.getByRole("button", { name: "Generate again" }));
  const next = await screen.findByRole("heading", { level: 2, name: "Proposed routes" });
  await waitFor(() => expect(next).toHaveFocus());
});

it("applies after the confirm and links to every route written", async () => {
  vi.mocked(applyGeneration).mockResolvedValue(APPLIED);
  await showProposal();

  const confirm = await openConfirm();
  expect(confirm).toHaveFocus();
  expect(screen.getByText("Apply 3 routes? This replaces the students on 2 existing routes and can't be undone.")).toBeInTheDocument();
  expect(applyGeneration).not.toHaveBeenCalled();

  fireEvent.click(confirm);

  const heading = await screen.findByRole("heading", { name: "3 routes written" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(applyGeneration).toHaveBeenCalledWith("g-1");
  expect(screen.getByText("3 routes written.")).toHaveAttribute("role", "status");
  expect(screen.getByRole("link", { name: "Hamra morning run" })).toHaveAttribute("href", "/head-of-transport/routes/r-1");
  expect(screen.getByRole("link", { name: "Route B 654321" })).toHaveAttribute("href", "/head-of-transport/routes/r-2");
  expect(screen.getByRole("link", { name: "Verdun run" })).toHaveAttribute("href", "/head-of-transport/routes/r-3");
  expect(screen.getByRole("link", { name: "Back to routes list" })).toHaveAttribute("href", "/head-of-transport/routes");
});

it("sends one apply when Confirm apply is clicked twice", async () => {
  vi.mocked(applyGeneration).mockReturnValue(new Promise(() => {}));
  await showProposal();

  const confirm = await openConfirm();
  fireEvent.click(confirm);
  fireEvent.click(confirm);

  expect(applyGeneration).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
});

it("applies nothing on Escape and returns focus to Apply", async () => {
  await showProposal();

  const confirm = await openConfirm();
  fireEvent.keyDown(confirm, { key: "Escape" });

  expect(applyGeneration).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Confirm apply" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply all" })).toHaveFocus();

  fireEvent.keyDown(screen.getByRole("button", { name: "Apply all" }), { key: "Escape" });
  expect(applyGeneration).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { level: 2, name: "Proposed routes" })).toBeInTheDocument();
});

it("discards and returns to the empty state", async () => {
  vi.mocked(discardGeneration).mockResolvedValue(undefined);
  await showProposal();

  fireEvent.click(screen.getByRole("button", { name: "Discard" }));

  const generate = await screen.findByRole("button", { name: "Generate routes" });
  expect(discardGeneration).toHaveBeenCalledWith("g-1");
  expect(applyGeneration).not.toHaveBeenCalled();
  await waitFor(() => expect(generate).toHaveFocus());
  expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  expect(screen.getByText("Proposal discarded. Nothing was changed.")).toBeInTheDocument();
});

it("shows the backend's reason on a generate 409 while another generation runs, and lets the user try again", async () => {
  vi.mocked(generateRoutes)
    .mockRejectedValueOnce(new ApiError(409, "A generation is already running for this school."))
    .mockResolvedValueOnce(proposal());
  render(<GenerateRoutesPage />);

  fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));

  const alert = await screen.findByRole("alert");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(alert).toHaveTextContent("Routes can't be generated right now.");
  expect(alert).toHaveTextContent("A generation is already running for this school.");

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Proposed routes" })).toBeInTheDocument();
  expect(generateRoutes).toHaveBeenCalledTimes(2);
});

it("shows the backend's reason on a generate 409 before the school's arrival time is set", async () => {
  vi.mocked(generateRoutes).mockRejectedValueOnce(
    new ApiError(409, "Set the school's arrival time before generating routes."),
  );
  render(<GenerateRoutesPage />);

  fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Routes can't be generated right now.");
  expect(alert).toHaveTextContent("Set the school's arrival time before generating routes.");
  expect(alert).not.toHaveTextContent(/already running/);
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});

it("shows the generic message when generating fails otherwise", async () => {
  vi.mocked(generateRoutes).mockRejectedValueOnce(new ApiError(500));
  render(<GenerateRoutesPage />);

  fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Something went wrong. Please try again.");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});

it("keeps the proposal on an apply 409 with the backend's detail, and offers Generate again but not Apply", async () => {
  vi.mocked(applyGeneration).mockRejectedValueOnce(
    new ApiError(409, "Since the proposal was made: a student was added."),
  );
  await showProposal();

  fireEvent.click(await openConfirm());

  const alert = await screen.findByRole("alert");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(alert).toHaveTextContent("nothing was applied");
  expect(alert).toHaveTextContent("Since the proposal was made: a student was added.");
  expect(screen.getByRole("heading", { level: 2, name: "Proposed routes" })).toBeInTheDocument();
  expect(routeCard("Hamra morning run")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Apply all" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();

  vi.mocked(generateRoutes).mockResolvedValueOnce(proposal({ id: "g-2" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate again" }));
  const next = await screen.findByRole("heading", { level: 2, name: "Proposed routes" });
  await waitFor(() => expect(next).toHaveFocus());
  expect(screen.getByRole("button", { name: "Apply all" })).toBeEnabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("can still discard the proposal after an apply 409", async () => {
  vi.mocked(applyGeneration).mockRejectedValueOnce(new ApiError(409, "A vehicle's capacity changed."));
  vi.mocked(discardGeneration).mockResolvedValue(undefined);
  await showProposal();
  fireEvent.click(await openConfirm());
  await screen.findByRole("alert");

  fireEvent.click(screen.getByRole("button", { name: "Discard" }));

  const generate = await screen.findByRole("button", { name: "Generate routes" });
  expect(discardGeneration).toHaveBeenCalledWith("g-1");
  await waitFor(() => expect(generate).toHaveFocus());
});

it("says the proposal is gone on an apply 404", async () => {
  vi.mocked(applyGeneration).mockRejectedValueOnce(new ApiError(404, "Not found"));
  await showProposal();

  fireEvent.click(await openConfirm());

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("This proposal is gone.");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(screen.getByRole("button", { name: "Generate again" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Apply all" })).not.toBeInTheDocument();
});

it("says the proposal is gone on a discard 404", async () => {
  vi.mocked(discardGeneration).mockRejectedValueOnce(new ApiError(404, "Not found"));
  await showProposal();

  fireEvent.click(screen.getByRole("button", { name: "Discard" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("This proposal is gone.");
  expect(screen.getByRole("button", { name: "Generate again" })).toBeInTheDocument();
});

it("keeps the proposal with the generic message when apply fails otherwise", async () => {
  vi.mocked(applyGeneration).mockRejectedValueOnce(new Error("network down"));
  await showProposal();

  fireEvent.click(await openConfirm());

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Something went wrong. Please try again.");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(screen.getByRole("button", { name: "Apply all" })).toBeEnabled();
});

it("ignores a generation that finishes after the page was left", async () => {
  const pending = deferred<FleetProposal>();
  vi.mocked(generateRoutes).mockReturnValue(pending.promise);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { unmount } = render(<GenerateRoutesPage />);

  fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));
  unmount();
  await act(async () => {
    pending.resolve(proposal());
    await pending.promise;
  });

  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

it("keeps the proposal with the generic message when discard fails otherwise", async () => {
  vi.mocked(discardGeneration).mockRejectedValueOnce(new ApiError(500));
  await showProposal();

  fireEvent.click(screen.getByRole("button", { name: "Discard" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Something went wrong. Please try again.");
  await waitFor(() => expect(alert).toHaveFocus());
  expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Apply all" })).toBeEnabled();
});

it("sends one discard when Discard is clicked twice", async () => {
  vi.mocked(discardGeneration).mockReturnValue(new Promise(() => {}));
  await showProposal();

  const discard = screen.getByRole("button", { name: "Discard" });
  fireEvent.click(discard);
  fireEvent.click(discard);

  expect(discardGeneration).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Discarding…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Apply all" })).toBeDisabled();
});

it("announces while applying", async () => {
  vi.mocked(applyGeneration).mockReturnValue(new Promise(() => {}));
  await showProposal();

  fireEvent.click(await openConfirm());

  expect(screen.getByText("Applying the proposal…")).toHaveAttribute("role", "status");
});

it("applies nothing on Cancel and returns focus to Apply", async () => {
  await showProposal();

  await openConfirm();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(applyGeneration).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Apply all" })).toHaveFocus();
});

it("tabs from Confirm to Cancel only, and Escape from Cancel backs out too", async () => {
  await showProposal();

  const confirm = await openConfirm();
  const group = screen.getByRole("group", { name: /^Apply 3 routes\?/ });
  const buttons = within(group).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual(["Confirm apply", "Cancel"]);
  expect(buttons[0]).toBe(confirm);
  // Apply all and Discard are gone while the confirm is open, so Tab can't reach them.
  expect(screen.queryByRole("button", { name: "Apply all" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();

  fireEvent.keyDown(buttons[1], { key: "Escape" });

  expect(screen.queryByRole("group", { name: /^Apply 3 routes\?/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply all" })).toHaveFocus();
  expect(applyGeneration).not.toHaveBeenCalled();
});

it("ignores an apply that finishes after the page was left", async () => {
  const pending = deferred<RouteSummary[]>();
  vi.mocked(applyGeneration).mockReturnValue(pending.promise);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(generateRoutes).mockResolvedValueOnce(proposal());
  const { unmount } = render(<GenerateRoutesPage />);
  fireEvent.click(screen.getByRole("button", { name: "Generate routes" }));
  await screen.findByRole("heading", { level: 2, name: "Proposed routes" });

  fireEvent.click(await openConfirm());
  unmount();
  await act(async () => {
    pending.resolve(APPLIED);
    await pending.promise;
  });

  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

it("colors each planned route's stop badges to match its line on the map", async () => {
  await showProposal();

  const badge = (name: string) =>
    within(within(routeCard(name)).getByRole("list", { name: /in pickup order/ })).getAllByRole("listitem")[0]
      .firstElementChild as HTMLElement;
  // jsdom reports colors as rgb(); convert the token the same way.
  const probe = document.createElement("span");
  const rgb = (hex: string) => {
    probe.style.backgroundColor = hex;
    return probe.style.backgroundColor;
  };
  expect(badge("Hamra morning run").style.backgroundColor).toBe(rgb(mapTheme.routeColors[0]));
  expect(badge("Route B 654321").style.backgroundColor).toBe(rgb(mapTheme.routeColors[1]));
});

it("shows the contract sample's vehicles, students in order, seats used and arrival times", async () => {
  await showProposal(SAMPLE);

  for (const planned of SAMPLE.routes) {
    const card = routeCard(planned.name);
    expect(within(card).getByText(planned.vehicle.plateNumber)).toBeInTheDocument();
    expect(within(card).getByText(`${planned.stops.length} of ${planned.vehicle.capacity} seats`)).toBeInTheDocument();
    if (planned.stops.length === 0) {
      expect(within(card).getByText("Emptied")).toBeInTheDocument();
      continue;
    }
    const items = within(within(card).getByRole("list", { name: /in pickup order/ })).getAllByRole("listitem");
    expect(items).toHaveLength(planned.stops.length);
    planned.stops.forEach((plannedStop, index) => {
      expect(items[index]).toHaveTextContent(
        `Stop ${plannedStop.position}: ${plannedStop.firstName} ${plannedStop.lastName}`,
      );
      if (plannedStop.arrivalTime) {
        expect(items[index]).toHaveTextContent(`Arrives ${plannedStop.arrivalTime.slice(0, 5)}`);
      }
    });
  }
  const unplaced = screen.getByRole("region", { name: `Students not placed (${SAMPLE.unplaced.length})` });
  for (const student of SAMPLE.unplaced) {
    expect(within(unplaced).getByText(`${student.firstName} ${student.lastName}`)).toBeInTheDocument();
  }
});

it("shows nothing to apply for the contract's nothing sample", async () => {
  await showProposal(SAMPLE_NOTHING);

  expect(screen.queryByRole("button", { name: "Apply all" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate again" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to routes list" })).toHaveAttribute("href", "/head-of-transport/routes");
});
