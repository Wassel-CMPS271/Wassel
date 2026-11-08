import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { AddressRequest, AddressRequestsApi } from "@/lib/api/addressRequests";
import { AddressRequestsSection } from "./AddressRequestsSection";

afterEach(() => {
  cleanup();
});

const LINA_REQUEST: AddressRequest = {
  id: "req-1",
  studentId: "st-1",
  studentName: "Lina Daher",
  currentAddress: "Hamra Street, Beirut",
  requestedAddress: "Verdun Street, Beirut",
  requestedLat: null,
  requestedLng: null,
  requestedBy: { parentUserId: "p-1", email: "rami@example.com" },
  status: "pending",
  createdAt: "2026-11-01T08:00:00Z",
  decidedAt: null,
  rejectionReason: null,
};

const HADI_REQUEST: AddressRequest = {
  ...LINA_REQUEST,
  id: "req-2",
  studentId: "st-2",
  studentName: "Hadi Rizk",
  currentAddress: null,
  requestedAddress: "Achrafieh, Beirut",
  requestedBy: { parentUserId: "p-2", email: "nour@example.com" },
};

// Typed as the plain mock functions (not AddressRequestsApi) so each test
// can call .mockResolvedValue/.mockRejectedValue directly; the component
// only ever sees it through the AddressRequestsApi prop type.
function fakeApi() {
  return {
    list: vi.fn<AddressRequestsApi["list"]>(),
    approve: vi.fn<AddressRequestsApi["approve"]>(),
    reject: vi.fn<AddressRequestsApi["reject"]>(),
  };
}

function row(name: string) {
  return screen.getByText(name).closest("li")!;
}

it("shows the 'coming soon' placeholder when there is no API yet (SCRUM-269 unmerged)", () => {
  render(<AddressRequestsSection api={null} onApproved={vi.fn()} />);

  const notice = screen.getByText("Address change requests from parents will appear here (SCRUM-269).");
  expect(notice).toBeInTheDocument();
  expect(notice.closest('[aria-disabled="true"]')).toBeInTheDocument();
  expect(screen.getByText("Soon")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows a loading status while the requests load", () => {
  const api = fakeApi();
  api.list.mockReturnValue(new Promise(() => {}));
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  expect(screen.getByText("Loading address requests…")).toHaveAttribute("role", "status");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("shows the empty state when there are no pending requests", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([]);
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  expect(await screen.findByText("No pending address requests.")).toBeInTheDocument();
});

it("shows an error with a retry when the requests fail to load, and recovers", async () => {
  const api = fakeApi();
  api.list.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([LINA_REQUEST]);
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load address requests. Please try again.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Lina Daher")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(api.list).toHaveBeenCalledTimes(2);
});

it("only ever shows requests still pending, even if the API answers with more", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([
    LINA_REQUEST,
    { ...HADI_REQUEST, status: "approved", decidedAt: "2026-11-02T00:00:00Z" },
  ]);
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  expect(screen.queryByText("Hadi Rizk")).not.toBeInTheDocument();
});

it("labels the requested address clearly as not yet saved, and never shows it as the saved address", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST]);
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  const requestRow = row("Lina Daher");
  expect(within(requestRow).getByText("Current saved address: Hamra Street, Beirut")).toBeInTheDocument();
  expect(within(requestRow).getByText("Requested (not yet saved): Verdun Street, Beirut")).toBeInTheDocument();
  // The requested address must never appear as if it were the saved one.
  expect(within(requestRow).queryByText("Current saved address: Verdun Street, Beirut")).not.toBeInTheDocument();
});

it("shows 'Not set' for a student with no saved address yet", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([HADI_REQUEST]);
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Hadi Rizk");
  const requestRow = row("Hadi Rizk");
  expect(within(requestRow).getByText("Current saved address: Not set")).toBeInTheDocument();
});

it("approves a request, removes it from the list, announces it and reports the student id", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST, HADI_REQUEST]);
  api.approve.mockResolvedValue({ ...LINA_REQUEST, status: "approved" });
  const onApproved = vi.fn();
  render(<AddressRequestsSection api={api} onApproved={onApproved} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Approve address change for Lina Daher" }));

  await waitFor(() => expect(api.approve).toHaveBeenCalledWith("req-1"));
  expect(await screen.findByText("Address approved for Lina Daher.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
  expect(screen.getByText("Hadi Rizk")).toBeInTheDocument();
  expect(onApproved).toHaveBeenCalledWith("st-1");
  // The decided row took its buttons with it; focus goes to the heading, not <body>.
  expect(screen.getByRole("heading", { name: "Address requests" })).toHaveFocus();
});

it("rejects a request through the confirmation step, sending the optional reason", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST]);
  api.reject.mockResolvedValue({ ...LINA_REQUEST, status: "rejected" });
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Reject address change for Lina Daher" }));

  expect(await screen.findByText(/Reject this address change for Lina Daher\?/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reason (optional)"), {
    target: { value: "Parent could not confirm the new building number." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm reject address change for Lina Daher" }));

  await waitFor(() =>
    expect(api.reject).toHaveBeenCalledWith("req-1", "Parent could not confirm the new building number."),
  );
  expect(await screen.findByText("Address request rejected for Lina Daher.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
});

it("rejects with no reason when the field is left blank", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST]);
  api.reject.mockResolvedValue({ ...LINA_REQUEST, status: "rejected" });
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Reject address change for Lina Daher" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm reject address change for Lina Daher" }));

  await waitFor(() => expect(api.reject).toHaveBeenCalledWith("req-1", undefined));
});

it("cancels the reject confirmation without calling the API", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST]);
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Reject address change for Lina Daher" }));
  await screen.findByRole("button", { name: "Confirm reject address change for Lina Daher" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("button", { name: "Confirm reject address change for Lina Daher" })).not.toBeInTheDocument();
  expect(api.reject).not.toHaveBeenCalled();
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
});

it("rejects a reason over 255 characters without calling the API", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST]);
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Reject address change for Lina Daher" }));
  const textarea = await screen.findByLabelText("Reason (optional)");
  // maxLength on the control itself would stop this in a real browser;
  // fireEvent.change bypasses that, so the handler's own check is what
  // this test exercises.
  fireEvent.change(textarea, { target: { value: "a".repeat(260) } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm reject address change for Lina Daher" }));

  expect(await screen.findByText("Reason must be 255 characters or fewer.")).toBeInTheDocument();
  expect(api.reject).not.toHaveBeenCalled();
});

it("handles a 409 (already decided) on approve by refreshing the list", async () => {
  const api = fakeApi();
  api.list.mockResolvedValueOnce([LINA_REQUEST]).mockResolvedValueOnce([]);
  api.approve.mockRejectedValue(new ApiError(409, "Already decided"));
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Approve address change for Lina Daher" }));

  expect(await screen.findByText("This request was already decided by someone else. Refreshed the list.")).toBeInTheDocument();
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
});

it("handles a 409 (already decided) on reject by refreshing the list", async () => {
  const api = fakeApi();
  api.list.mockResolvedValueOnce([LINA_REQUEST]).mockResolvedValueOnce([]);
  api.reject.mockRejectedValue(new ApiError(409, "Already decided"));
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Reject address change for Lina Daher" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm reject address change for Lina Daher" }));

  expect(await screen.findByText("This request was already decided by someone else. Refreshed the list.")).toBeInTheDocument();
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
});

it("keeps the request and shows a row error when approve fails for another reason, and allows retrying", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST]);
  api.approve.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({ ...LINA_REQUEST, status: "approved" });
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Approve address change for Lina Daher" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();

  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Approve address change for Lina Daher" }));
  await waitFor(() => expect(api.approve).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText("Lina Daher")).not.toBeInTheDocument());
});

it("shows a clear message and lets the user try again on a permission error", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST]);
  api.approve.mockRejectedValue(new ApiError(403, "Access denied"));
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Approve address change for Lina Daher" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to decide this request.");
  expect(screen.getByText("Lina Daher")).toBeInTheDocument();
});

it("moves focus to Confirm when rejecting, and Escape cancels and returns focus to Reject", async () => {
  const api = fakeApi();
  api.list.mockResolvedValue([LINA_REQUEST]);
  render(<AddressRequestsSection api={api} onApproved={vi.fn()} />);

  await screen.findByText("Lina Daher");
  fireEvent.click(within(row("Lina Daher")).getByRole("button", { name: "Reject address change for Lina Daher" }));

  const confirm = await screen.findByRole("button", { name: "Confirm reject address change for Lina Daher" });
  await waitFor(() => expect(confirm).toHaveFocus());
  fireEvent.keyDown(confirm, { key: "Escape" });

  const trigger = await screen.findByRole("button", { name: "Reject address change for Lina Daher" });
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(api.reject).not.toHaveBeenCalled();
});
