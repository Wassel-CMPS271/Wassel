// SCRUM-229: screen-to-HTTP tests independent of feature-author API mocks.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DndContextProps, DragEndEvent } from "@dnd-kit/core";
import RoutesPage from "./page";
import RouteDetailPage from "./[routeId]/page";
import { DETAIL, OPT, PID, RID, ROUTES, httpFixture, json, proposal, route, stop, student, studentId } from "@/test-support/routingContract";

const dnd = vi.hoisted(() => ({ props: undefined as DndContextProps | undefined }));
vi.mock("next/navigation", () => ({ useParams: () => ({ routeId: "00000229-0000-0000-0000-000000000001" }) }));
vi.mock("next/dynamic", async () => {
  const { BrowserMap } = await import("@/test-support/routingContract");
  return { default: () => BrowserMap };
});
vi.mock("@dnd-kit/core", async (original) => {
  const real = await original<typeof import("@dnd-kit/core")>();
  return { ...real, DndContext: (props: DndContextProps) => { dnd.props = props; return <real.DndContext {...props} />; } };
});
let api: ReturnType<typeof httpFixture>;
beforeEach(() => { api = httpFixture(); dnd.props = undefined; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const onRoute = () => screen.getByRole("region", { name: "On this route" });
const waiting = () => screen.getByRole("region", { name: "Not on a route" });
const row = (region: HTMLElement, n: number) => within(region).getByText(`Student${n} Independent`).closest("li")!;
const order = () => within(onRoute()).getAllByRole("listitem").map(li => within(li).getByText(/Student\d+ Independent/).textContent);
const names = (ns: number[]) => ns.map(n => `Student${n} Independent`);
async function detail() {
  render(<RouteDetailPage />);
  await screen.findByRole("heading", { name: "Independent morning" });
  await within(waiting()).findByText("Student4 Independent");
}
async function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Create route" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("option", { name: "T 229" });
  return dialog;
}
function fill(dialog: HTMLElement, name: string) {
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(within(dialog).getByLabelText("Vehicle"), { target: { value: "v229" } });
  fireEvent.change(within(dialog).getByLabelText("Driver"), { target: { value: "d229" } });
}
function drop(first: number, target: number) {
  const s = api.state.saved.stops.find(s => s.studentId === studentId(first))!;
  act(() => dnd.props?.onDragEnd?.({
    active: { id: `student-${s.studentId}`, data: { current: { from: "on-route", name: `Student${first} Independent`, stop: s } } },
    over: { id: `student-${studentId(target)}`, data: { current: { from: "on-route", stop: api.state.saved.stops.find(s => s.studentId === studentId(target)) } } },
  } as unknown as DragEndEvent));
}
async function optimize() {
  fireEvent.click(screen.getByRole("button", { name: /^Optimize/ }));
  return screen.findByRole("region", { name: "Optimization proposal" });
}

it("creates then edits through real HTTP clients and uses the server response in the list", async () => {
  api.state.listed = false;
  api.state.handler = (m, p, b) => {
    if (m === "POST" && p === ROUTES) return json({ ...route(0), name: (b as { name: string }).name }, 201);
    if (m === "PUT" && p === DETAIL) return json({ ...route(0), name: "Server normalized route" });
  };
  render(<RoutesPage />);
  await screen.findByText("No routes yet");
  const dialog = await openForm();
  fill(dialog, "  Independent morning  ");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));
  const link = await screen.findByRole("link", { name: "Independent morning" });
  expect(link).toHaveAttribute("href", `/head-of-transport/routes/${RID}`);
  expect(api.mutations()[0]).toEqual({ method: "POST", path: ROUTES, body: { name: "Independent morning", vehicleId: "v229", driverId: "d229" } });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  const edit = await screen.findByRole("dialog");
  await within(edit).findByRole("option", { name: "T 229" });
  fill(edit, "Changed name");
  fireEvent.click(within(edit).getByRole("button", { name: /Save/ }));
  expect(await screen.findByRole("link", { name: "Server normalized route" })).toBeInTheDocument();
  expect(api.mutations()[1]).toEqual({ method: "PUT", path: DETAIL, body: { name: "Changed name", vehicleId: "v229", driverId: "d229" } });
  expect(api.fetch.mock.calls.every(([, init]) => init?.credentials === "include")).toBe(true);
});

it("does not POST invalid input, then maps a real ProblemDetail to the vehicle field and recovers", async () => {
  api.state.listed = false;
  let rejected = true;
  api.state.handler = (m, p) => m === "POST" && p === ROUTES
    ? rejected ? json({ status: 409, errors: { vehicleId: "Vehicle already assigned to another route." } }, 409) : json(route(0), 201)
    : undefined;
  render(<RoutesPage />);
  await screen.findByText("No routes yet");
  const dialog = await openForm();
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));
  expect(api.mutations()).toEqual([]);
  expect(within(dialog).getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  fill(dialog, "Independent morning");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));
  await within(dialog).findByText("Vehicle already assigned to another route.");
  expect(within(dialog).getByLabelText("Vehicle")).toHaveFocus();
  expect(screen.queryByRole("link", { name: "Independent morning" })).not.toBeInTheDocument();
  rejected = false;
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));
  expect(await screen.findByRole("link", { name: "Independent morning" })).toBeInTheDocument();
  expect(api.mutations()).toHaveLength(2);
});

it("keeps a failed create editable without adding a phantom route", async () => {
  api.state.listed = false;
  api.state.handler = (m, p) => { if (m === "POST" && p === ROUTES) throw new TypeError("offline"); };
  render(<RoutesPage />);
  await screen.findByText("No routes yet");
  const dialog = await openForm(); fill(dialog, "Not saved");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create route" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  expect(within(dialog).getByLabelText("Name")).toHaveValue("Not saved");
  expect(screen.queryByRole("link", { name: "Not saved" })).not.toBeInTheDocument();
});

it("recovers route-list loading and HTTP failure through retry and shows backend details", async () => {
  let release!: (r: Response) => void;
  api.state.handler = (m, p) => m === "GET" && p === ROUTES ? new Promise(resolve => { release = resolve; }) : undefined;
  render(<RoutesPage />);
  expect(screen.getByText("Loading routes…")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create route" })).toBeDisabled();
  await act(async () => release(json({ detail: "Temporary outage" }, 503)));
  await screen.findByRole("alert");
  api.state.handler = undefined;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: "Independent morning" });
  expect(screen.getByText("T 229")).toBeInTheDocument();
  expect(screen.getByText("Independent Driver")).toBeInTheDocument();
  expect(screen.getByText("11 seats left")).toBeInTheDocument();
});

it("fills seat 14, refuses student 15, then frees a seat using the returned route", async () => {
  api.state.saved = route(13);
  api.state.handler = (m, p) => {
    if (m === "POST" && p === `${DETAIL}/students`) { api.state.saved = route(14); return json(api.state.saved); }
    if (m === "DELETE" && p === `${DETAIL}/students/${studentId(14)}`) { api.state.saved = route(13); return json(api.state.saved); }
  };
  render(<RouteDetailPage />);
  await screen.findByText("13 of 14 seats");
  fireEvent.click(within(row(waiting(), 14)).getByRole("button", { name: "Add" }));
  await screen.findByText("14 of 14 seats");
  expect(api.mutations()[0]).toEqual({ method: "POST", path: `${DETAIL}/students`, body: { studentId: studentId(14) } });
  expect(within(onRoute()).getByText("Student14 Independent")).toBeInTheDocument();
  await waitFor(() => expect(within(waiting()).queryByText("Student14 Independent")).not.toBeInTheDocument());
  const fifteenth = within(row(waiting(), 15)).getByRole("button", { name: "Add" });
  expect(fifteenth).toBeDisabled();
  expect(screen.getByText(/This vehicle is full \(14 of 14 seats\)/)).toBeInTheDocument();
  fireEvent.click(fifteenth);
  expect(api.mutations()).toHaveLength(1);
  fireEvent.click(within(row(onRoute(), 14)).getByRole("button", { name: "Remove" }));
  await screen.findByText("13 of 14 seats");
  await waitFor(() => expect(within(row(waiting(), 15)).getByRole("button", { name: "Add" })).toBeEnabled());
  expect(api.mutations()[1]).toEqual({ method: "DELETE", path: `${DETAIL}/students/${studentId(14)}`, body: undefined });
});

it("resynchronizes a concurrent capacity conflict without falsely assigning the rejected student", async () => {
  api.state.saved = route(13);
  api.state.handler = (m, p) => {
    if (m === "POST" && p === `${DETAIL}/students`) {
      api.state.saved = { ...route(14), stops: [...route(13).stops, stop(16, 14)] };
      return json({ status: 409, detail: "The route has 14 students but the vehicle seats 14." }, 409);
    }
  };
  render(<RouteDetailPage />); await screen.findByText("13 of 14 seats");
  fireEvent.click(within(row(waiting(), 14)).getByRole("button", { name: "Add" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The route has 14 students but the vehicle seats 14.");
  await screen.findByText("14 of 14 seats");
  expect(within(onRoute()).queryByText("Student14 Independent")).not.toBeInTheDocument();
  expect(within(onRoute()).getByText("Student16 Independent")).toBeInTheDocument();
  expect(within(row(waiting(), 14)).getByRole("button", { name: "Add" })).toBeDisabled();
});

it("marks an over-capacity response and still allows removal", async () => {
  api.state.saved = route(15);
  render(<RouteDetailPage />); await screen.findByText("15 of 14 seats");
  expect(screen.getByText(/over capacity by 1 seat/)).toBeInTheDocument();
  expect(within(row(onRoute(), 15)).getByRole("button", { name: "Remove" })).toBeEnabled();
  expect(within(row(waiting(), 16)).getByRole("button", { name: "Add" })).toBeDisabled();
});

it("uses persisted assignments from all routes, and marks a waiting student without coordinates", async () => {
  api.state.roster = [student(1), student(4, false), { ...student(5), status: "inactive" }];
  await detail();
  expect(within(waiting()).queryByText("Student1 Independent")).not.toBeInTheDocument();
  expect(within(waiting()).queryByText("Student5 Independent")).not.toBeInTheDocument();
  expect(within(row(waiting(), 4)).getByText(/Needs pin/)).toBeInTheDocument();
  expect(api.calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: "GET", path: ROUTES }), expect.objectContaining({ method: "GET", path: DETAIL }),
  ]));
});

it("reorders with the full UUID list and redraws numbered map stops from the server", async () => {
  api.state.handler = (m, p) => {
    if (m === "PUT" && p === `${DETAIL}/stops`) {
      api.state.saved = { ...route(), stops: [stop(2, 1), stop(3, 2), stop(1, 3)] };
      return json(api.state.saved);
    }
  };
  await detail(); drop(1, 3);
  await waitFor(() => expect(api.mutations()).toHaveLength(1));
  expect(api.mutations()[0]).toEqual({ method: "PUT", path: `${DETAIL}/stops`, body: { studentIds: [studentId(2), studentId(3), studentId(1)] } });
  await waitFor(() => expect(order()).toEqual(names([2, 3, 1])));
  const markers = screen.getByRole("list", { name: "Browser markers" });
  expect(within(markers).getAllByRole("listitem").map(li => li.getAttribute("aria-label"))).toEqual([
    "Stop 1: Student2 Independent", "Stop 2: Student3 Independent", "Stop 3: Student1 Independent",
  ]);
  expect(screen.getByLabelText("Browser school")).toHaveTextContent("Arrival 08:00");
});

it("preserves order after a rejected reorder and displays errors.studentIds from HTTP", async () => {
  api.state.handler = (m, p) => m === "PUT" && p === `${DETAIL}/stops`
    ? json({ status: 400, errors: { studentIds: "The order must contain every current student exactly once." } }, 400) : undefined;
  await detail(); drop(1, 3);
  expect(await screen.findByRole("alert")).toHaveTextContent("The order must contain every current student exactly once.");
  expect(order()).toEqual(names([1, 2, 3]));
});

it("cancels a real keyboard drag without sending a reorder", async () => {
  await detail();
  const handle = screen.getByRole("button", { name: "Move Student1 Independent" });
  const listener = vi.spyOn(document, "addEventListener");
  handle.focus();
  fireEvent.keyDown(handle, { code: "Space", key: " " });
  await screen.findByText("Picked up Student1 Independent from On this route.");
  // The sensor attaches keydown asynchronously; observe readiness before sending Escape.
  await waitFor(() => expect(listener.mock.calls.some(([type]) => type === "keydown")).toBe(true));
  listener.mockRestore();
  fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
  await screen.findByText("Moving Student1 Independent was cancelled. They stay in On this route.");
  expect(order()).toEqual(names([1, 2, 3]));
  expect(api.mutations()).toEqual([]);
});

it("previews through HTTP without changing saved stops, then applies and permits manual reorder", async () => {
  api.state.handler = (m, p) => {
    if (m === "POST" && p === OPT) return json(proposal(), 201);
    if (m === "POST" && p === `${OPT}/${PID}/apply`) { api.state.saved = { ...route(), stops: proposal().proposed!.stops }; return json(api.state.saved); }
    if (m === "PUT" && p === `${DETAIL}/stops`) { api.state.saved = { ...route(), stops: [stop(1, 1), stop(2, 2), stop(3, 3)] }; return json(api.state.saved); }
  };
  await detail(); await optimize();
  expect(order()).toEqual(names([1, 2, 3]));
  expect(api.mutations()).toEqual([{ method: "POST", path: OPT, body: undefined }]);
  expect(within(screen.getByRole("region", { name: "Current order" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Student1 Independent")]));
  const proposed = screen.getByRole("region", { name: "Proposed order" });
  expect(within(proposed).getAllByRole("listitem").map(li => li.textContent)).toEqual([
    expect.stringContaining("Student3 Independent"), expect.stringContaining("Student1 Independent"), expect.stringContaining("Student2 Independent"),
  ]);
  expect(within(proposed).getAllByText(/07:30/)).toHaveLength(3);
  expect(within(screen.getByRole("region", { name: "Optimization proposal" })).getByText("Saves 8 min")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(order()).toEqual(names([3, 1, 2])));
  expect(api.mutations()[1]).toEqual({ method: "POST", path: `${OPT}/${PID}/apply`, body: undefined });
  drop(3, 2);
  await waitFor(() => expect(order()).toEqual(names([1, 2, 3])));
  expect(api.mutations()[2]).toEqual({ method: "PUT", path: `${DETAIL}/stops`, body: { studentIds: [studentId(1), studentId(2), studentId(3)] } });
});

it("discards by DELETE, closes the comparison and leaves saved order unchanged", async () => {
  api.state.handler = (m, p) => m === "POST" && p === OPT ? json(proposal(), 201)
    : m === "DELETE" && p === `${OPT}/${PID}` ? json(null, 204) : undefined;
  await detail(); await optimize(); fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Optimization proposal" })).not.toBeInTheDocument());
  expect(order()).toEqual(names([1, 2, 3]));
  expect(api.mutations()).toEqual([{ method: "POST", path: OPT, body: undefined }, { method: "DELETE", path: `${OPT}/${PID}`, body: undefined }]);
});

it.each(["CAPACITY_EXCEEDED", "ARRIVAL_TIME_UNREACHABLE", "FUTURE_REASON"])("shows infeasible %s messages without an apply action", async code => {
  api.state.handler = (m, p) => m === "POST" && p === OPT ? json({ ...proposal(), id: null, feasible: false, proposed: null,
    reasons: [{ code, message: `Independent rejection: ${code}` }] }, 201) : undefined;
  await detail(); fireEvent.click(screen.getByRole("button", { name: /^Optimize/ }));
  await screen.findByText(`Independent rejection: ${code}`);
  expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  expect(order()).toEqual(names([1, 2, 3]));
});

it("shows a missing-pin 409 from the backend and preserves assignments", async () => {
  api.state.handler = (m, p) => m === "POST" && p === OPT ? json({ status: 409,
    detail: "Student1 Independent has no pickup pin.", studentIds: [studentId(1)] }, 409) : undefined;
  await detail(); fireEvent.click(screen.getByRole("button", { name: /^Optimize/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Student1 Independent has no pickup pin.");
  expect(screen.getByRole("link", { name: /Students/ })).toHaveAttribute("href", expect.stringContaining("/students"));
  expect(order()).toEqual(names([1, 2, 3]));
});

it.each(["network", "server"])("recovers from %s proposal failure without applying anything", async kind => {
  api.state.handler = (m, p) => { if (m === "POST" && p === OPT) { if (kind === "network") throw new TypeError("offline"); return json({ detail: "Backend failed" }, 500); } };
  await detail(); fireEvent.click(screen.getByRole("button", { name: /^Optimize/ }));
  await screen.findByRole("alert");
  expect(order()).toEqual(names([1, 2, 3]));
  expect(api.mutations()).toHaveLength(1);
  api.state.handler = (m, p) => m === "POST" && p === OPT ? json(proposal(), 201) : undefined;
  await optimize();
});

it.each(["apply", "discard"])("keeps the proposal and route after a failed %s request", async action => {
  api.state.handler = (m, p) => m === "POST" && p === OPT ? json(proposal(), 201)
    : p.startsWith(`${OPT}/${PID}`) ? json({ detail: "Temporary server failure" }, 500) : undefined;
  await detail(); await optimize();
  fireEvent.click(screen.getByRole("button", { name: action === "apply" ? "Apply" : "Discard" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("region", { name: "Optimization proposal" })).toBeInTheDocument();
  expect(order()).toEqual(names([1, 2, 3]));
  expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
});

it("keeps a failed removal on the route and resynchronizes the displayed seats", async () => {
  api.state.handler = (m, p) => m === "DELETE" && p === `${DETAIL}/students/${studentId(1)}`
    ? json({ status: 409, detail: "Assignment could not be removed." }, 409) : undefined;
  await detail();
  fireEvent.click(within(row(onRoute(), 1)).getByRole("button", { name: "Remove" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Assignment could not be removed.");
  await waitFor(() => expect(within(row(onRoute(), 1)).getByRole("button", { name: "Remove" })).toBeEnabled());
  expect(order()).toEqual(names([1, 2, 3]));
  expect(screen.getByText("3 of 14 seats")).toBeInTheDocument();
  expect(within(waiting()).queryByText("Student1 Independent")).not.toBeInTheDocument();
});

it("reloads a stale apply from HTTP 409 instead of presenting an uncommitted order", async () => {
  api.state.handler = (m, p) => {
    if (m === "POST" && p === OPT) return json(proposal(), 201);
    if (m === "POST" && p === `${OPT}/${PID}/apply`) {
      api.state.saved = { ...route(), stops: [stop(2, 1), stop(1, 2), stop(3, 3)] };
      return json({ status: 409, detail: "The route changed since the proposal." }, 409);
    }
  };
  await detail(); await optimize();
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(order()).toEqual(names([2, 1, 3])));
  expect(screen.queryByRole("region", { name: "Optimization proposal" })).not.toBeInTheDocument();
  expect(api.mutations()).toHaveLength(2);
  expect(screen.getByRole("button", { name: /^Optimize/ })).toBeEnabled();
});

it("shows route detail HTTP 404 distinctly from a retryable outage", async () => {
  api.state.handler = (m, p) => m === "GET" && p === DETAIL ? json({ detail: "Route not found." }, 404) : undefined;
  render(<RouteDetailPage />);
  await screen.findByRole("heading", { name: "Route not found" });
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(api.mutations()).toEqual([]);
});
