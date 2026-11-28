// SCRUM-287. The real setStudentStatus() and request() run; only fetch is
// stubbed, with the answers docs/contracts/roster.md lists.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Student } from "@/lib/api/students";
import studentPausedFixture from "@/lib/api/__fixtures__/roster/student-paused.json";
import { StudentStatusControl } from "./StudentStatusControl";
import { colors } from "@/styles/tokens";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PAUSED = studentPausedFixture as Student;
const ACTIVE: Student = { ...PAUSED, status: "active" };
const ARCHIVED: Student = { ...PAUSED, status: "inactive" };
const NAME = `${PAUSED.firstName} ${PAUSED.lastName}`;
const STATUS_URL = `http://localhost:8080/api/head-of-transport/students/${PAUSED.id}/status`;
const BUS_TODAY = `${NAME} is on Hamra morning run (A 123456 07:10). Move them after the run ends.`;

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

function setup(student: Student) {
  const onChanged = vi.fn();
  render(<StudentStatusControl student={student} onChanged={onChanged} />);
  return { onChanged };
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, method: init.method, body: JSON.parse(init.body) };
}

it("offers Pause and Archive for an active student", () => {
  setup(ACTIVE);
  expect(screen.getByRole("button", { name: `Pause ${NAME}` })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Archive ${NAME}` })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^(Resume|Restore)/ })).not.toBeInTheDocument();
});

it("Confirm pause is not the danger color, because pause is reversible; Confirm archive is", () => {
  setup(ACTIVE);

  fireEvent.click(screen.getByRole("button", { name: `Pause ${NAME}` }));
  expect(screen.getByRole("button", { name: `Confirm pause ${NAME}` })).not.toHaveStyle({
    backgroundColor: colors.error[600],
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  fireEvent.click(screen.getByRole("button", { name: `Archive ${NAME}` }));
  expect(screen.getByRole("button", { name: `Confirm archive ${NAME}` })).toHaveStyle({
    backgroundColor: colors.error[600],
  });
});

it("offers Resume and Archive for a paused student", () => {
  setup(PAUSED);
  expect(screen.getByRole("button", { name: `Resume ${NAME}` })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Archive ${NAME}` })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^(Pause|Restore)/ })).not.toBeInTheDocument();
});

it("offers only Restore for an archived student: archived to paused is not allowed", () => {
  setup(ARCHIVED);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: `Restore ${NAME}` })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Pause/ })).not.toBeInTheDocument();
});

it("gives every button a 44px tap target", () => {
  setup(ACTIVE);
  for (const button of screen.getAllByRole("button")) expect(button).toHaveStyle({ minHeight: "44px" });
});

it("keeps a status live region mounted from the start", () => {
  setup(ACTIVE);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("asks before pausing, says what happens, and pauses on Confirm", async () => {
  const updated = { ...ACTIVE, status: "paused" };
  const fetchMock = stubFetch(json(200, updated));
  const { onChanged } = setup(ACTIVE);

  fireEvent.click(screen.getByRole("button", { name: `Pause ${NAME}` }));

  expect(fetchMock).not.toHaveBeenCalled();
  const confirm = screen.getByRole("button", { name: `Confirm pause ${NAME}` });
  expect(confirm).toHaveFocus();
  const question = screen.getByText(new RegExp(`^Pause ${NAME}\\?`));
  expect(question).toHaveTextContent("taken off their route");
  expect(question).toHaveTextContent("Past runs, confirmations and attendance are kept");
  expect(question).toHaveTextContent("on no route");
  expect(confirm).toHaveAccessibleDescription(question.textContent!);

  fireEvent.click(confirm);

  await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
  expect(sentBody(fetchMock)).toEqual({ url: STATUS_URL, method: "PUT", body: { status: "paused" } });
  expect(screen.getByRole("status")).toHaveTextContent(`${NAME} is paused and off their route.`);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("asks before archiving and sends inactive on Confirm", async () => {
  const updated = { ...PAUSED, status: "inactive" };
  const fetchMock = stubFetch(json(200, updated));
  const { onChanged } = setup(PAUSED);

  fireEvent.click(screen.getByRole("button", { name: `Archive ${NAME}` }));
  const question = screen.getByText(new RegExp(`^Archive ${NAME}\\?`));
  expect(question).toHaveTextContent("Past runs, confirmations and attendance are kept");
  fireEvent.click(screen.getByRole("button", { name: `Confirm archive ${NAME}` }));

  await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
  expect(sentBody(fetchMock).body).toEqual({ status: "inactive" });
  expect(screen.getByRole("status")).toHaveTextContent(`${NAME} is archived and off their route.`);
});

it("Cancel sends nothing and returns focus to the button that opened the question", () => {
  const fetchMock = stubFetch();
  const { onChanged } = setup(ACTIVE);

  fireEvent.click(screen.getByRole("button", { name: `Pause ${NAME}` }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(onChanged).not.toHaveBeenCalled();
  expect(screen.queryByText(/Past runs/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Pause ${NAME}` })).toHaveFocus();
});

it("Escape cancels too, and returns focus to Archive", () => {
  const fetchMock = stubFetch();
  setup(ACTIVE);

  fireEvent.click(screen.getByRole("button", { name: `Archive ${NAME}` }));
  fireEvent.keyDown(screen.getByRole("button", { name: `Confirm archive ${NAME}` }), { key: "Escape" });

  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: `Archive ${NAME}` })).toHaveFocus();
});

it.each([
  ["Resume", PAUSED],
  ["Restore", ARCHIVED],
])("%s goes straight back to active, without a question, and says they are on no route", async (label, student) => {
  const updated = { ...student, status: "active" };
  const fetchMock = stubFetch(json(200, updated));
  const { onChanged } = setup(student);

  fireEvent.click(screen.getByRole("button", { name: `${label} ${NAME}` }));

  await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
  expect(sentBody(fetchMock)).toEqual({ url: STATUS_URL, method: "PUT", body: { status: "active" } });
  expect(screen.getByRole("status")).toHaveTextContent(`${NAME} is active again. They are on no route yet.`);
});

it("shows the bus-today 409 exactly as the server wrote it and stays on the old status", async () => {
  stubFetch(json(409, { status: 409, detail: BUS_TODAY }));
  const { onChanged } = setup(ACTIVE);

  fireEvent.click(screen.getByRole("button", { name: `Pause ${NAME}` }));
  fireEvent.click(screen.getByRole("button", { name: `Confirm pause ${NAME}` }));

  expect(await screen.findByRole("alert")).toHaveTextContent(BUS_TODAY);
  expect(onChanged).not.toHaveBeenCalled();
  // Still the active student's buttons, enabled, with focus back on Pause.
  const pause = screen.getByRole("button", { name: `Pause ${NAME}` });
  expect(pause).toBeEnabled();
  await waitFor(() => expect(pause).toHaveFocus());
  expect(pause).toHaveAccessibleDescription(BUS_TODAY);
  expect(screen.getByRole("button", { name: `Archive ${NAME}` })).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent("");
});

it("shows the archived-to-paused 409 detail as it is", async () => {
  const detail = "An archived student can only be restored to active.";
  stubFetch(json(409, { detail }));
  setup(ACTIVE);

  fireEvent.click(screen.getByRole("button", { name: `Archive ${NAME}` }));
  fireEvent.click(screen.getByRole("button", { name: `Confirm archive ${NAME}` }));

  expect(await screen.findByRole("alert")).toHaveTextContent(detail);
});

it("shows a 400's errors.status message", async () => {
  stubFetch(json(400, { errors: { status: "Status must be active, paused or inactive." } }));
  const { onChanged } = setup(PAUSED);

  fireEvent.click(screen.getByRole("button", { name: `Resume ${NAME}` }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Status must be active, paused or inactive.");
  expect(onChanged).not.toHaveBeenCalled();
});

it.each([
  [401, undefined, "Your session has expired. Please sign in again."],
  [403, { detail: "Access denied" }, "You do not have permission to change this student's status."],
  [404, { detail: "Student not found" }, "This student could not be found. They may have been removed; refresh the list."],
  [500, { detail: "Internal Server Error" }, "Something went wrong. Please try again."],
])("maps a %i to the students screens' message", async (status, body, message) => {
  stubFetch(json(status, body));
  const { onChanged } = setup(ARCHIVED);

  fireEvent.click(screen.getByRole("button", { name: `Restore ${NAME}` }));

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(onChanged).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: `Restore ${NAME}` })).toBeEnabled();
});

it("shows the generic message on a network failure", async () => {
  stubFetch(new TypeError("Failed to fetch"));
  setup(PAUSED);

  fireEvent.click(screen.getByRole("button", { name: `Resume ${NAME}` }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
});

it("sends one request however often Confirm is pressed, and announces the progress", async () => {
  const answer = deferred();
  const fetchMock = stubFetch(answer.promise);
  const { onChanged } = setup(ACTIVE);

  fireEvent.click(screen.getByRole("button", { name: `Pause ${NAME}` }));
  const confirm = screen.getByRole("button", { name: `Confirm pause ${NAME}` });
  fireEvent.click(confirm);
  fireEvent.click(confirm);

  await waitFor(() => expect(confirm).toBeDisabled());
  expect(confirm).toHaveTextContent("Pausing…");
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(`Pausing ${NAME}…`);
  // Escape does nothing while the request is in flight.
  fireEvent.keyDown(confirm, { key: "Escape" });
  expect(screen.getByRole("button", { name: `Confirm pause ${NAME}` })).toBeInTheDocument();

  answer.resolve(json(200, { ...ACTIVE, status: "paused" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("sends one request for a double click on Restore, and disables the button meanwhile", async () => {
  const answer = deferred();
  const fetchMock = stubFetch(answer.promise);
  setup(ARCHIVED);

  const restore = screen.getByRole("button", { name: `Restore ${NAME}` });
  fireEvent.click(restore);
  fireEvent.click(restore);

  await waitFor(() => expect(restore).toBeDisabled());
  expect(restore).toHaveTextContent("Restoring…");
  answer.resolve(json(200, { ...ARCHIVED, status: "active" }));
  await waitFor(() => expect(restore).toBeEnabled());
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("moves focus to the new first button once the parent shows the new status", async () => {
  const updated: Student = { ...ACTIVE, status: "paused" };
  stubFetch(json(200, updated));
  const onChanged = vi.fn();
  const { rerender } = render(<StudentStatusControl student={ACTIVE} onChanged={onChanged} />);

  fireEvent.click(screen.getByRole("button", { name: `Pause ${NAME}` }));
  fireEvent.click(screen.getByRole("button", { name: `Confirm pause ${NAME}` }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  rerender(<StudentStatusControl student={updated} onChanged={onChanged} />);

  await waitFor(() => expect(screen.getByRole("button", { name: `Resume ${NAME}` })).toHaveFocus());
});
