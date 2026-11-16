// SCRUM-287. The real getBestRoute()/placeStudentOnBestRoute() and request()
// run; only fetch is stubbed, with the contract's samples and the answers
// docs/contracts/roster.md lists.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { BestRoute, BestRoutePlacement } from "@/lib/api/roster";
import type { Route } from "@/lib/api/routes";
import type { Student } from "@/lib/api/students";
import bestRouteFixture from "@/lib/api/__fixtures__/roster/best-route.json";
import bestRouteNoneFixture from "@/lib/api/__fixtures__/roster/best-route-none.json";
import studentPausedFixture from "@/lib/api/__fixtures__/roster/student-paused.json";
import { BestRoutePanel } from "./BestRoutePanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BEST_ROUTE: BestRoute = bestRouteFixture;
const BEST_ROUTE_NONE: BestRoute = bestRouteNoneFixture;
const STUDENT: Student = { ...(studentPausedFixture as Student), status: "active" };
const NAME = `${STUDENT.firstName} ${STUDENT.lastName}`;
const BEST_ROUTE_URL = `http://localhost:8080/api/head-of-transport/students/${STUDENT.id}/best-route`;
const RECOMMENDED = BEST_ROUTE.recommended!;

const ROUTE: Route = {
  id: RECOMMENDED.routeId,
  name: RECOMMENDED.routeName,
  vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 12 },
  driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
  studentCount: 8,
  seatsLeft: 4,
  school: { latitude: 33.8938, longitude: 35.5018, arrivalTime: "07:30" },
  stops: [
    {
      studentId: STUDENT.id,
      position: 2,
      firstName: STUDENT.firstName,
      lastName: STUDENT.lastName,
      address: STUDENT.address,
      latitude: STUDENT.latitude,
      longitude: STUDENT.longitude,
      arrivalTime: "07:20",
    },
  ],
};
const PLACEMENT: BestRoutePlacement = { position: 2, extraMinutes: 1, arrivalTime: "07:20", route: ROUTE };

const LOADING_TEXT = `Finding the best route for ${NAME}. This can take a few seconds while each route's driving time is checked.`;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function stubFetch(...answers: (Response | Promise<Response> | Error)[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) {
    if (answer instanceof Error) fetchMock.mockRejectedValueOnce(answer);
    else fetchMock.mockReturnValueOnce(Promise.resolve(answer));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup() {
  const onPlaced = vi.fn();
  render(<BestRoutePanel student={STUDENT} onPlaced={onPlaced} />);
  return { onPlaced };
}

const placeButton = () => screen.getByRole("button", { name: `Place on ${RECOMMENDED.routeName}` });

async function loaded() {
  return screen.findByRole("button", { name: `Place on ${RECOMMENDED.routeName}` });
}

// No lateness wording anywhere: the contract has no such field.
function expectNoLateWording() {
  expect(document.body.textContent).not.toMatch(/\blate\b/i);
}

it("shows a clear loading message and a skeleton while the ranking is worked out", async () => {
  const answer = deferred();
  const fetchMock = stubFetch(answer.promise);
  setup();

  expect(screen.getByRole("status")).toHaveTextContent(LOADING_TEXT);
  expect(screen.getByRole("heading", { name: `Best route for ${NAME}` })).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(BEST_ROUTE_URL);
  expect(init.method).toBe("GET");
  expect(init.body).toBeUndefined();

  answer.resolve(json(200, BEST_ROUTE));
  await loaded();
  expect(screen.getByRole("status")).toHaveTextContent("");
});

it("shows the recommended route with its stop, pickup time, extra minutes and seats", async () => {
  stubFetch(json(200, BEST_ROUTE));
  setup();
  await loaded();

  const card = screen.getByRole("heading", { name: RECOMMENDED.routeName }).parentElement!;
  expect(within(card).getByText("Recommended")).toBeInTheDocument();
  expect(within(card).getByText("Stop 2")).toBeInTheDocument();
  expect(within(card).getByText("Pickup at 07:20")).toBeInTheDocument();
  expect(within(card).getByText("+1 extra minute of driving")).toBeInTheDocument();
  expect(within(card).getByText("5 seats free before this student takes one")).toBeInTheDocument();
  expect(placeButton()).toHaveStyle({ minHeight: "44px" });
  expectNoLateWording();
});

it("lists the other options read-only, in the server's order, with no way to place on them", async () => {
  const third = { ...BEST_ROUTE.options[1], routeId: "r-3", routeName: "Ras Beirut morning run", extraMinutes: 14, seatsLeft: 1 };
  stubFetch(json(200, { ...BEST_ROUTE, options: [...BEST_ROUTE.options, third] }));
  setup();
  await loaded();

  const others = screen.getByRole("list", { name: "Other routes that could take them" });
  const items = within(others).getAllByRole("listitem").filter((item) => item.parentElement === others);
  expect(items.map((item) => item.firstElementChild!.textContent)).toEqual(["Verdun morning run", "Ras Beirut morning run"]);
  expect(within(items[0]).getByText("+9 extra minutes of driving")).toBeInTheDocument();
  expect(within(items[0]).getByText("Stop 1")).toBeInTheDocument();
  expect(within(items[0]).getByText("Pickup at 07:21")).toBeInTheDocument();
  expect(within(items[0]).getByText("12 seats free before this student takes one")).toBeInTheDocument();
  expect(within(items[1]).getByText("1 seat free before this student takes one")).toBeInTheDocument();
  expect(within(others).queryByText(RECOMMENDED.routeName)).not.toBeInTheDocument();

  // One action only: the recommended route.
  expect(screen.getAllByRole("button")).toEqual([placeButton()]);
  expect(screen.queryByRole("button", { name: /Verdun|Ras Beirut/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("explains each skipped route, with a neutral text for a reason it doesn't know", async () => {
  const skipped = [
    ...BEST_ROUTE_NONE.skipped,
    { routeId: "r-9", routeName: "Gemmayzeh morning run", reason: "DRIVER_ON_LEAVE" },
  ];
  stubFetch(json(200, { ...BEST_ROUTE, skipped }));
  setup();
  await loaded();

  const list = screen.getByRole("list", { name: "Routes that can't take them" });
  expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Achrafieh morning run: Full: no free seat",
    "Mar Mikhael morning run: Would have to start before 06:00 to fit this student in",
    "Gemmayzeh morning run: Can't take this student",
  ]);
  expect(screen.queryByText(/DRIVER_ON_LEAVE/)).not.toBeInTheDocument();
});

it("shows only what the server sent about a skipped route: no seats or minutes", async () => {
  stubFetch(json(200, BEST_ROUTE));
  setup();
  await loaded();

  const skippedItem = within(screen.getByRole("list", { name: "Routes that can't take them" })).getByRole("listitem");
  expect(skippedItem).toHaveTextContent("Achrafieh morning run: Full: no free seat");
  expect(skippedItem.textContent).not.toMatch(/\d+ seats?|minute|Stop|Pickup/);
});

it("explains clearly when no route can take the student, with nothing to place", async () => {
  stubFetch(json(200, BEST_ROUTE_NONE));
  setup();

  expect(await screen.findByText(`No route can take ${NAME} right now.`)).toBeInTheDocument();
  expect(screen.getByText(/the reason each one can't take them is listed below/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Other routes that could take them" })).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Routes that can't take them" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expectNoLateWording();
});

it("says so when the school has no routes at all", async () => {
  stubFetch(json(200, { studentId: STUDENT.id, recommended: null, options: [], skipped: [] }));
  setup();

  expect(await screen.findByText("The school has no routes yet. Add a route first.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows the student-not-active 409 as a message, without a retry", async () => {
  stubFetch(json(409, { errors: { studentId: "Only active students can be placed on a route." } }));
  setup();

  expect(await screen.findByRole("alert")).toHaveTextContent("Only active students can be placed on a route.");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it.each([
  "The student has no pin yet. Set their address or place the pin first.",
  "The student is already on a route. Take them off it first, or move them by hand.",
  "The school's arrival time is not set, so no pickup time can be worked out.",
])("shows a GET precondition 409 as the server wrote it, without a retry: %s", async (detail) => {
  stubFetch(json(409, { status: 409, detail }));
  setup();

  expect(await screen.findByRole("alert")).toHaveTextContent(detail);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it.each([
  [401, undefined, "Your session has expired. Please sign in again."],
  [403, { detail: "Access denied" }, "You do not have permission to place students on routes."],
  [404, { detail: "Student not found" }, "This student could not be found. They may have been removed; refresh the list."],
])("maps a GET %i like the other students screens, without a retry", async (status, body, message) => {
  stubFetch(json(status, body));
  setup();

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
});

it("offers Retry after a 5xx, focuses it, and loads on retry", async () => {
  const fetchMock = stubFetch(json(503, { detail: "Service Unavailable" }), json(200, BEST_ROUTE));
  setup();

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't work out the best route. Please try again.");
  const retry = screen.getByRole("button", { name: "Retry" });
  expect(retry).toHaveFocus();
  expect(retry).toHaveStyle({ minHeight: "44px" });

  fireEvent.click(retry);
  expect(screen.getByRole("status")).toHaveTextContent(LOADING_TEXT);

  await loaded();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("offers Retry after a network failure", async () => {
  stubFetch(new TypeError("Failed to fetch"), json(200, BEST_ROUTE_NONE));
  setup();

  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

  expect(await screen.findByText(`No route can take ${NAME} right now.`)).toBeInTheDocument();
});

it("places on the recommended route with one click, announces it and reports the route", async () => {
  const fetchMock = stubFetch(json(200, BEST_ROUTE), json(201, PLACEMENT));
  const { onPlaced } = setup();

  fireEvent.click(await loaded());

  await waitFor(() => expect(onPlaced).toHaveBeenCalledWith(ROUTE, PLACEMENT));
  expect(onPlaced).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[1];
  expect(url).toBe(BEST_ROUTE_URL);
  expect(init.method).toBe("POST");
  expect(init.body).toBeUndefined();
  expect(init.headers).toBeUndefined();

  expect(screen.getByRole("status")).toHaveTextContent(`${NAME} is on Hamra morning run as stop 2, pickup at 07:20.`);
  expect(screen.getByText("Placed on Hamra morning run as stop 2, pickup at 07:20.")).toBeInTheDocument();
  // Placing again would be a 409 (already on a route), so the button goes, and focus stays in the panel.
  expect(screen.queryByRole("button", { name: /^Place on/ })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: `Best route for ${NAME}` })).toHaveFocus();
  expectNoLateWording();
});

it("sends one POST however often Place is pressed, and disables it while in flight", async () => {
  const answer = deferred();
  const fetchMock = stubFetch(json(200, BEST_ROUTE), answer.promise);
  const { onPlaced } = setup();

  const place = await loaded();
  fireEvent.click(place);
  fireEvent.click(place);

  await waitFor(() => expect(place).toBeDisabled());
  expect(place).toHaveTextContent("Placing…");
  expect(screen.getByRole("status")).toHaveTextContent(`Placing ${NAME} on Hamra morning run…`);

  answer.resolve(json(201, PLACEMENT));
  await waitFor(() => expect(onPlaced).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([
  "No route has a free seat and a schedule that can be driven for this student.",
  "The student is already on a route. Take them off it first, or move them by hand.",
  "The student has no pin yet. Set their address or place the pin first.",
  "The school's arrival time is not set, so no pickup time can be worked out.",
  "The route filled up or changed while it was being chosen. Try again.",
])("shows a POST 409's detail and keeps the panel usable: %s", async (detail) => {
  const fetchMock = stubFetch(json(200, BEST_ROUTE), json(409, { status: 409, detail }), json(200, BEST_ROUTE_NONE));
  const { onPlaced } = setup();

  fireEvent.click(await loaded());

  expect(await screen.findByRole("alert")).toHaveTextContent(detail);
  expect(onPlaced).not.toHaveBeenCalled();
  const place = placeButton();
  expect(place).toBeEnabled();
  await waitFor(() => expect(place).toHaveFocus());
  expect(place).toHaveAccessibleDescription(detail);
  // The ranking is still shown.
  expect(screen.getByRole("list", { name: "Other routes that could take them" })).toBeInTheDocument();

  // Check again asks for a fresh ranking.
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(await screen.findByText(`No route can take ${NAME} right now.`)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[2][1].method).toBe("GET");
});

it("shows a POST student-not-active 409 (errors.studentId) as a message", async () => {
  stubFetch(json(200, BEST_ROUTE), json(409, { errors: { studentId: "Only active students can be placed on a route." } }));
  const { onPlaced } = setup();

  fireEvent.click(await loaded());

  expect(await screen.findByRole("alert")).toHaveTextContent("Only active students can be placed on a route.");
  expect(onPlaced).not.toHaveBeenCalled();
});

it("shows the generic message when the POST fails on the server, and lets it be tried again", async () => {
  const fetchMock = stubFetch(json(200, BEST_ROUTE), json(500, { detail: "Internal Server Error" }), json(201, PLACEMENT));
  const { onPlaced } = setup();

  fireEvent.click(await loaded());
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");

  fireEvent.click(placeButton());
  await waitFor(() => expect(onPlaced).toHaveBeenCalledWith(ROUTE, PLACEMENT));
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
