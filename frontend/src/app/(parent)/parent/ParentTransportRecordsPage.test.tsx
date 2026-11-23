import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as childrenApi from "@/lib/api/myChildren";
import * as requests from "@/lib/api/addressRequests";
import * as attendanceApi from "@/lib/api/attendance";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { ParentTransportRecordsPage } from "./ParentTransportRecordsPage";

vi.mock("@/lib/api/myChildren", () => ({ getMyChildren: vi.fn() }));
vi.mock("@/lib/api/addressRequests", async importOriginal => ({
  ...await importOriginal<typeof requests>(),
  listParentAddressRequests: vi.fn(),
  submitParentAddressRequest: vi.fn(),
}));
vi.mock("@/lib/api/attendance", async importOriginal => ({
  ...await importOriginal<typeof attendanceApi>(),
  getParentAttendance: vi.fn(),
}));
const studentId = "0b6f2d9a-7c11-4f3e-8a52-3e9d4c7b1a20";
const linked: childrenApi.Child = {
  studentId, firstName: "Tarek", lastName: "Mansour",
  route: null, driver: null, vehicle: null, expectedPickupTime: null, todayRun: null,
};
const pending: requests.AddressRequest = {
  id: "request-one", studentId, studentName: "Tarek Mansour",
  currentAddress: "Original address", requestedAddress: "New address",
  requestedLat: null, requestedLng: null, requestedBy: { parentUserId: "parent", email: "parent@example.com" },
  status: "pending", createdAt: "2026-11-09T07:30:00Z", decidedAt: null, rejectionReason: null,
};
const children = vi.mocked(childrenApi.getMyChildren);
const list = vi.mocked(requests.listParentAddressRequests);
const post = vi.mocked(requests.submitParentAddressRequest);
const attendance = vi.mocked(attendanceApi.getParentAttendance);
const fill = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  children.mockResolvedValue([linked]);
  list.mockResolvedValue([]);
  attendance.mockResolvedValue([]);
  post.mockResolvedValue(pending);
});
afterEach(() => vi.clearAllMocks());

async function open() {
  render(<ParentTransportRecordsPage studentId={studentId} />);
  await screen.findByText("No address-change requests yet.");
  await screen.findByText("No driver confirmations recorded for this period.");
}

describe("SCRUM-281 parent linked-child UI", () => {
  it("offers the correct child records without sending a parent identity or another child's id", async () => {
    await open();
    expect(screen.getByText(/Records for Tarek Mansour/)).toBeVisible();
    expect(list).toHaveBeenCalledWith(studentId);
    expect(attendance).toHaveBeenCalledWith(studentId, expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    expect(screen.getByRole("link", { name: "Back to My children" })).toHaveAttribute("href", "/parent");
  });

  it("does not make child-specific calls for an unlinked URL identifier", async () => {
    children.mockResolvedValue([]);
    render(<ParentTransportRecordsPage studentId="another-child" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not linked");
    expect(list).not.toHaveBeenCalled();
    expect(attendance).not.toHaveBeenCalled();
  });

  it("submits one pending request, never claims to update the saved address", async () => {
    await open();
    fill("New pickup address", " New address ");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    await screen.findByText("Pending school decision");
    expect(post).toHaveBeenCalledWith(studentId, { address: "New address" });
    expect(screen.getByText(/saved pickup address will not change until approved/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit address request" })).not.toBeInTheDocument();
  });

  it("blocks a second pending request and shows the existing status", async () => {
    list.mockResolvedValue([pending]);
    render(<ParentTransportRecordsPage studentId={studentId} />);
    await screen.findByText("Pending school decision");
    expect(screen.getByText(/school's saved pickup details remain unchanged/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit address request" })).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("validates both optional coordinates before making a request", async () => {
    await open();
    fill("New pickup address", "New address");
    fill("Latitude (optional)", "92");
    fill("Longitude (optional)", "35");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    expect(await screen.findByText(/Latitude must be between/)).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("handles a 409 without inventing a successful request and permits retry", async () => {
    post.mockRejectedValueOnce(new ApiError(409)).mockResolvedValueOnce(pending);
    await open();
    fill("New pickup address", "New address");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already has a pending request/);
    expect(screen.getByRole("alert")).toHaveClass("text-sm");
    expect(screen.getByText("No address-change requests yet.")).toBeVisible();
    // The blocking request is another parent's, so the form stops inviting futile retries until a refresh.
    expect(screen.queryByRole("button", { name: "Submit address request" })).not.toBeInTheDocument();
    expect(screen.getByText(/after the school decides on the one already pending/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refresh request status" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit address request" }));
    await screen.findByText("Pending school decision");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("does not let a refresh started before a send bring the form back", async () => {
    await open();
    let finish: (rows: requests.AddressRequest[]) => void = () => {};
    list.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh request status" }));
    fill("New pickup address", "New address");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    await screen.findByText("Pending school decision");
    await act(async () => finish([])); // the older answer, from before the POST
    expect(screen.getByText("Pending school decision")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit address request" })).not.toBeInTheDocument();
  });

  it("keeps the form after a POST 403 instead of treating it as lost access", async () => {
    post.mockRejectedValueOnce(new ApiError(403));
    await open();
    fill("New pickup address", "New address");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.getByLabelText("New pickup address")).toHaveValue("New address");
    expect(screen.queryByText("You cannot view these records.")).not.toBeInTheDocument();
  });

  it.each([["abc", "abc"], ["33.8e", "35"], ["--", ""]])(
    "rejects non-numeric coordinates %j / %j instead of sending no pin", async (lat, lng) => {
      await open();
      fill("New pickup address", "New address");
      fill("Latitude (optional)", lat);
      fill("Longitude (optional)", lng);
      fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
      expect((await screen.findAllByText(/Latitude must be between|Enter both coordinates/)).length).toBeGreaterThan(0);
      expect(post).not.toHaveBeenCalled();
    });

  it("reloads the list when the server accepted the request but the reply was unreadable", async () => {
    post.mockRejectedValueOnce(new requests.InvalidAddressRequestResponse());
    await open();
    list.mockResolvedValueOnce([pending]);
    fill("New pickup address", "New address");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    await screen.findByText("Pending school decision");
    expect(screen.getByText(/Request sent to the school, but its details/)).toBeVisible();
    expect(screen.queryByText("Something went wrong. Please try again.")).not.toBeInTheDocument();
  });

  it("shows the inactive-child 409 message, which has no field of its own", async () => {
    post.mockRejectedValueOnce(new ApiValidationError({ studentId: "This child is not active." }));
    await open();
    fill("New pickup address", "New address");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This child is not active.");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/Check the address/);
  });

  it("keeps the form mounted and clears the old message while refreshing", async () => {
    post.mockRejectedValueOnce(new ApiError(409));
    await open();
    fill("New pickup address", "New address");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    await screen.findByRole("alert");
    let finish: (rows: requests.AddressRequest[]) => void = () => {};
    list.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const refresh = screen.getByRole("button", { name: "Refresh request status" });
    refresh.focus();
    fireEvent.click(refresh);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("New pickup address")).toBeVisible();
    expect(refresh).toHaveFocus();
    await act(async () => finish([]));
    expect(screen.getByRole("button", { name: "Refresh request status" })).toBeVisible();
  });

  it("moves focus to the confirmation after a successful send", async () => {
    await open();
    fill("New pickup address", "New address");
    fireEvent.click(screen.getByRole("button", { name: "Submit address request" }));
    const confirmation = await screen.findByText(/Request sent to the school/);
    expect(confirmation).toHaveFocus();
  });

  it("allows a corrected inclusive attendance date range and rejects 63 days", async () => {
    await open();
    fill("From date", "2026-01-01");
    fill("To date", "2026-03-04");
    fireEvent.click(screen.getByRole("button", { name: "Show attendance" }));
    expect(await screen.findByText("Choose at most 62 days, including both endpoints.")).toBeVisible();
    expect(attendance).toHaveBeenCalledTimes(1);
    fill("To date", "2026-03-03");
    fireEvent.click(screen.getByRole("button", { name: "Show attendance" }));
    expect(attendance).toHaveBeenLastCalledWith(studentId, { from: "2026-01-01", to: "2026-03-03" });
  });

  it("explains corrections to not-present records without hiding original timestamps", async () => {
    attendance.mockResolvedValue([{
      date: "2026-11-04", direction: "MORNING", status: "PICKED_UP",
      notPresentAt: "2026-11-04T05:12:00Z", pickedUpAt: "2026-11-04T05:19:00Z", droppedOffAt: null,
    }]);
    render(<ParentTransportRecordsPage studentId={studentId} />);
    const region = await screen.findByRole("region", { name: "Attendance history" });
    expect(await within(region).findByText("Picked up")).toBeVisible();
    expect(within(region).getByText(/Not present recorded:/)).toBeVisible();
    expect(within(region).getByText(/Picked up recorded:/)).toBeVisible();
  });

  it("shows retry after backend errors instead of false empty records", async () => {
    list.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    render(<ParentTransportRecordsPage studentId={studentId} />);
    await screen.findByRole("button", { name: "Retry address requests" });
    expect(screen.queryByText("No address-change requests yet.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry address requests" }));
    expect(await screen.findByText("No address-change requests yet.")).toBeVisible();
  });

  it("clears all private panels when linked-child access is lost mid-session", async () => {
    list.mockRejectedValue(new ApiError(404));
    render(<ParentTransportRecordsPage studentId={studentId} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not linked");
    expect(screen.queryByRole("heading", { name: "Recorded attendance history" })).not.toBeInTheDocument();
  });

  it("offers sign-in on 401 without exposing saved requests or history", async () => {
    attendance.mockRejectedValue(new ApiError(401));
    render(<ParentTransportRecordsPage studentId={studentId} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("sign-in has expired");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText("New address")).not.toBeInTheDocument();
  });
});
