import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddressRequestsSection } from "@/app/(head-of-transport)/head-of-transport/students/AddressRequestsSection";
import { addressRequestsApi, type AddressRequest } from "@/lib/api/addressRequests";
import { address, deferred, pathOf, response } from "@/test-support/operationsContract";

const first: AddressRequest = { ...address, id: "a", studentId: "s" };
const second: AddressRequest = { ...first, id: "b", studentId: "t", studentName: "Omar" };
const endpoint = "/api/head-of-transport/address-requests";
let rows: AddressRequest[]; let fetcher: ReturnType<typeof vi.fn>;
let decisionFailure: number | "network" | undefined;
let nextList: Promise<Response> | undefined;
const calls = (method: string) => fetcher.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);
const row = (name: string) => screen.getByText(name).closest("li")!;
const approve = (name = "Lina") => fireEvent.click(within(row(name)).getByRole("button", { name: `Approve address change for ${name}` }));
function show() { const approved = vi.fn(); render(<AddressRequestsSection api={addressRequestsApi} onApproved={approved} />); return approved; }

beforeEach(() => {
  rows = [first]; decisionFailure = undefined; nextList = undefined;
  fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.credentials).toBe("include");
    const path = pathOf(input);
    if ((init?.method ?? "GET") === "GET" && path === endpoint) {
      if (nextList) { const pending = nextList; nextList = undefined; return pending; }
      return response(rows);
    }
    const match = /^\/api\/head-of-transport\/address-requests\/([^/]+)\/(approve|reject)$/.exec(path);
    if (!match || init?.method !== "POST") throw new Error(`Unexpected address request: ${input}`);
    if (decisionFailure === "network") { decisionFailure = undefined; throw new TypeError("offline"); }
    if (decisionFailure) { const status = decisionFailure; decisionFailure = undefined; return response(status === 400 ? { errors: { reason: "Reason was refused" } } : { detail: "Private server decision detail" }, status); }
    const found = rows.find(item => item.id === decodeURIComponent(match[1]));
    if (!found) return response({ detail: "Request not found" }, 404);
    rows = rows.filter(item => item.id !== found.id);
    return response({ ...found, status: match[2] === "approve" ? "approved" : "rejected", decidedAt: "2026-11-09T07:01:00Z", rejectionReason: init.body ? JSON.parse(String(init.body)).reason : null });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

it("loads the actual authenticated address endpoint before acceptance completion", async () => {
  show(); await screen.findByText("Lina");
  expect(calls("GET")).toHaveLength(1);
  expect(pathOf(calls("GET")[0][0])).toBe(endpoint);
  expect(calls("GET")[0][1].body).toBeUndefined();
});
it("does not label a proposed address as saved", async () => {
  show(); await screen.findByText("Lina");
  expect(within(row("Lina")).getByText("Current saved address: Saved street")).toBeVisible();
  expect(within(row("Lina")).getByText("Requested (not yet saved): Requested street")).toBeVisible();
  expect(screen.queryByText("Current saved address: Requested street")).not.toBeInTheDocument();
});
it("shows loading and an explicit empty state", async () => {
  rows = []; show(); expect(screen.getByText(/^Loading address requests/)).toHaveAttribute("role", "status");
  await screen.findByText("No pending address requests.");
});
it("approves one request without altering another row", async () => {
  rows = [first, second]; const approved = show(); await screen.findByText("Lina"); approve();
  await screen.findByText("Address approved for Lina.");
  expect(calls("POST")).toHaveLength(1); expect(pathOf(calls("POST")[0][0])).toBe(`${endpoint}/a/approve`);
  expect(screen.getByText("Omar")).toBeVisible(); expect(approved).toHaveBeenCalledWith("s");
});
it("requires reject confirmation and sends the optional reason", async () => {
  show(); await screen.findByText("Lina"); fireEvent.click(screen.getByRole("button", { name: "Reject address change for Lina" }));
  expect(calls("POST")).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: " Outside area " } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm reject address change for Lina" }));
  await screen.findByText("Address request rejected for Lina.");
  expect(pathOf(calls("POST")[0][0])).toBe(`${endpoint}/a/reject`);
  expect(JSON.parse(calls("POST")[0][1].body)).toEqual({ reason: "Outside area" });
});
it.each(["network", 500] as const)("keeps a %s decision failure visible and explicitly retryable", async failure => {
  decisionFailure = failure; const approved = show(); await screen.findByText("Lina"); approve();
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  expect(screen.queryByText("Private server decision detail")).not.toBeInTheDocument();
  expect(screen.getByText("Lina")).toBeVisible(); expect(approved).not.toHaveBeenCalled();
  expect(calls("POST")).toHaveLength(1); approve(); await screen.findByText("Address approved for Lina.");
  expect(calls("POST")).toHaveLength(2); expect(approved).toHaveBeenCalledTimes(1);
});
it("preserves another row's typed rejection reason while resolving a stale decision", async () => {
  rows = [first, second]; show(); await screen.findByText("Lina");
  const gate = deferred<Response>(); nextList = gate.promise; decisionFailure = 409;
  fireEvent.click(within(row("Omar")).getByRole("button", { name: "Reject address change for Omar" }));
  fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Keep this draft" } });
  approve(); await waitFor(() => expect(calls("GET")).toHaveLength(2));
  expect(screen.getByLabelText("Reason (optional)")).toHaveValue("Keep this draft");
  await act(async () => gate.resolve(response([second])));
  expect(screen.getByLabelText("Reason (optional)")).toHaveValue("Keep this draft");
});
it.each([[401, "Your session has expired. Please sign in again."], [403, "You do not have permission to decide this request."]] as const)("explains HTTP %s without refetching or reporting success", async (status, message) => {
  decisionFailure = status; const approved = show(); await screen.findByText("Lina"); approve();
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByText("Private server decision detail")).not.toBeInTheDocument();
  expect(screen.getByText("Lina")).toBeVisible(); expect(approved).not.toHaveBeenCalled();
  expect(calls("GET")).toHaveLength(1); expect(calls("POST")).toHaveLength(1);
});
it.each([[404, "This request is no longer available. Refreshed the list."], [409, "This request was already decided by someone else. Refreshed the list."]] as const)("refetches HTTP %s decisions instead of silently resubmitting", async (status, message) => {
  decisionFailure = status; const approved = show(); await screen.findByText("Lina"); rows = []; approve();
  await screen.findByText(message); await screen.findByText("No pending address requests.");
  expect(calls("GET")).toHaveLength(2); expect(calls("POST")).toHaveLength(1); expect(approved).not.toHaveBeenCalled();
});
it("renders the server's 400 reason error next to the entered rejection reason and preserves it", async () => {
  decisionFailure = 400; const approved = show(); await screen.findByText("Lina");
  fireEvent.click(screen.getByRole("button", { name: "Reject address change for Lina" }));
  fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Keep this text" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm reject address change for Lina" }));
  await screen.findByText("Reason was refused"); expect(screen.getByLabelText("Reason (optional)")).toHaveValue("Keep this text");
  expect(approved).not.toHaveBeenCalled(); expect(calls("GET")).toHaveLength(1); expect(calls("POST")).toHaveLength(1);
});
