import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ParentPage from "./page";
import ParentLayout from "./layout";
import { ParentInboxHome } from "./ParentInboxHome";
import { parentInboxApi } from "@/lib/api/parentInbox";
import { getBusLocation } from "@/lib/api/parentTracking";
import { family, deferred } from "@/test-support/parentNavigation";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/map/MapView", () => ({ MapView: ({ label }: { label: string }) => <div role="region" aria-label={label} /> }));
const event = { id: "both-entry", type: "PICKED_UP", studentId: family[0].studentId, studentName: "Lina", runId: "both-run", direction: "MORNING", createdAt: "2026-11-15T07:00:00Z", readAt: null };
const live = { status: "LIVE", position: { latitude: 33.9, longitude: 35.5, accuracyMeters: 10, receivedAt: "2026-11-15T07:00:00Z", ageSeconds: 0 }, stopsLeft: 0, plannedTime: "07:20", estimate: { arrivesAt: "2026-11-15T05:25:00Z", secondsAway: 300 } };
const request = vi.fn();
beforeEach(() => {
 vi.resetAllMocks();
 request.mockImplementation(async (url: string) => {
  if (url.endsWith("/children")) return Response.json(family);
  if (url.endsWith("/bus-location")) return Response.json(live);
  if (url.endsWith("/unread-count")) return Response.json({ count: 42 });
  if (url.endsWith("/inbox")) return Response.json([event]);
  if (url.endsWith("/notification-preferences")) return Response.json({ pickedUp: true, droppedOff: true, notPresent: true, late: true, lateAfterMinutes: 10 });
  if (url.endsWith("/absences")) return Response.json([]);
  throw new Error(`Unexpected request ${url}`);
 });
 vi.stubGlobal("fetch", request);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function home() { await screen.findByText("Lina Navigation"); }
function open(name: string) { fireEvent.click(screen.getByRole("button", { name })); }
it("keeps real GPS/ETA, parent-wide Inbox and selected-child Absences reachable together", async () => {
 render(<ParentPage />); await home(); expect(request).toHaveBeenCalledTimes(1);
 open("Bus tracking"); await screen.findByRole("timer");
 fireEvent.change(screen.getByRole("combobox"), { target: { value: family[1].studentId } });
 await screen.findByRole("region", { name: "Bus location for Omar Navigation" });
 open("Absences"); await screen.findByRole("heading", { name: "Absences for Omar Navigation" });
 open("Inbox"); await screen.findByText("42 unread updates"); await screen.findByText("Lina: Picked up");
 expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); expect(screen.queryByRole("timer")).not.toBeInTheDocument();
 open("Bus tracking"); await screen.findByRole("timer"); expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument();
 expect(request).toHaveBeenCalledWith(expect.stringContaining(`/children/${family[1].studentId}/bus-location`), expect.objectContaining({ method: "GET", credentials: "include" }));
 expect(request).toHaveBeenCalledWith(expect.stringContaining("/api/parent/inbox"), expect.objectContaining({ method: "GET", credentials: "include" }));
 expect(request).toHaveBeenCalledWith(expect.stringContaining("/api/parent/notification-preferences"), expect.objectContaining({ method: "GET", credentials: "include" }));
});
it("drops a late GPS response after Inbox navigation without changing the inbox count or content", async () => {
 const pending = deferred<Response>(); request.mockImplementationOnce(async () => Response.json(family)).mockReturnValueOnce(pending.promise);
 render(<ParentPage />); await home(); open("Bus tracking"); await screen.findByText("Loading bus location…");
 open("Inbox"); await screen.findByText("42 unread updates");
 await act(async () => pending.resolve(Response.json(live)));
 expect(screen.getByText("Lina: Picked up")).toBeVisible(); expect(screen.queryByRole("timer")).not.toBeInTheDocument(); expect(screen.queryByText("Live bus location")).not.toBeInTheDocument();
});
it("discards a late prior-account Inbox response while keeping tracking private on account reset", async () => {
 const pending = deferred<Response>(); let second = false;
 request.mockImplementation(async (url: string) => url.endsWith("/children") ? Response.json(second ? [] : family) : url.endsWith("/inbox") ? pending.promise : Response.json({ count: 42 }));
 const view = render(<ParentInboxHome accountKey="first" api={parentInboxApi} trackingApi={getBusLocation} etaEnabled />); await home(); open("Inbox"); await screen.findByText("Loading inbox…");
 second = true; view.rerender(<ParentInboxHome accountKey="second" api={parentInboxApi} trackingApi={getBusLocation} etaEnabled />);
 await screen.findByText("No children linked yet"); await act(async () => pending.resolve(Response.json([event])));
 expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument(); expect(screen.queryByRole("timer")).not.toBeInTheDocument();
 expect(screen.getByRole("button", { name: "Bus tracking" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Inbox" })).toBeEnabled();
});
it("keeps Inbox usable after a tracking error and restores tracking through the real client", async () => {
 let failed = true; const original = request.getMockImplementation()!;
 request.mockImplementation((url: string, options: RequestInit) => url.endsWith("/bus-location") && failed ? Promise.resolve(new Response(null, { status: 503 })) : original(url, options));
 render(<ParentPage />); await home(); open("Bus tracking"); await screen.findByText("Could not load bus location. Please try again.");
 expect(screen.queryByRole("timer")).not.toBeInTheDocument(); open("Inbox"); await screen.findByText("42 unread updates");
 failed = false; open("Bus tracking"); expect(await screen.findByRole("timer")).toHaveTextContent("Estimated arrival in 5m 0s");
});
it.each(["ADMIN", "DRIVER", "HEAD_OF_TRANSPORT", "SIGNED_OUT"])("does not call either parent feature before authorization for %s", async role => {
 request.mockResolvedValue(role === "SIGNED_OUT" ? new Response(null, { status: 401 }) : Response.json({ id: "other", schoolId: "school", email: "other@test.invalid", role }));
 render(<ParentLayout><ParentPage /></ParentLayout>);
 await waitFor(() => expect(router.replace).toHaveBeenCalled()); expect(request).toHaveBeenCalledTimes(1);
 expect(request.mock.calls[0][0]).toContain("/api/auth/me"); expect(screen.queryByRole("navigation", { name: "Family views" })).not.toBeInTheDocument();
});

it("loads, replaces and reloads real preferences without losing GPS or Inbox navigation", async () => {
 let preferences = { pickedUp: true, droppedOff: true, notPresent: true, late: true, lateAfterMinutes: 10 };
 const original = request.getMockImplementation()!;
 request.mockImplementation((url: string, options: RequestInit) => {
  if (url.endsWith("/notification-preferences")) {
   if (options.method === "PUT") preferences = JSON.parse(options.body as string);
   return Promise.resolve(Response.json(preferences));
  }
  if (url.endsWith("/inbox")) return Promise.resolve(Response.json([{ ...event, type: "LATE" }]));
  return original(url, options);
 });
 render(<ParentPage />); await home(); open("Inbox");
 expect(await screen.findByText("Lina: Pickup delayed")).toBeVisible();
 expect(await screen.findByLabelText("Late pickup")).toBeChecked();
 fireEvent.click(screen.getByLabelText("Picked up")); fireEvent.click(screen.getByLabelText("Late pickup"));
 fireEvent.change(screen.getByLabelText("Minutes after planned pickup"), { target: { value: "25" } });
 fireEvent.click(screen.getByRole("button", { name: "Save preferences" })); await screen.findByText("Preferences saved.");
 expect(request).toHaveBeenCalledWith(expect.stringContaining("/notification-preferences"), expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ pickedUp: false, droppedOff: true, notPresent: true, late: false, lateAfterMinutes: 25 }) }));
 expect(screen.getByText("Lina: Pickup delayed")).toBeVisible();
 open("Bus tracking"); await screen.findByRole("timer"); open("Inbox");
 expect(await screen.findByLabelText("Picked up")).not.toBeChecked(); expect(screen.getByLabelText("Late pickup")).not.toBeChecked(); expect(screen.getByLabelText("Minutes after planned pickup")).toHaveValue(25);
});
it.each([401, 403])("hides loaded preferences and ignores a pending receipt when Inbox loses access (%s)", async status => {
 const pending = deferred<Response>(); let denied = false; const original = request.getMockImplementation()!;
 request.mockImplementation((url: string, options: RequestInit) => {
  if (url.endsWith("/notification-preferences") && options.method === "PUT") return pending.promise;
  if (denied && url.endsWith("/inbox")) return Promise.resolve(new Response(null, { status }));
  return original(url, options);
 });
 render(<ParentPage />); await home(); open("Inbox"); await screen.findByLabelText("Picked up"); await screen.findByText("Lina: Picked up");
 fireEvent.click(screen.getByRole("button", { name: "Save preferences" })); denied = true;
 fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" })); await screen.findByRole("alert");
 expect(screen.queryByLabelText("Picked up")).not.toBeInTheDocument(); expect(screen.queryByText("Lina: Picked up")).not.toBeInTheDocument();
 await act(async () => pending.resolve(Response.json({ pickedUp: true, droppedOff: true, notPresent: true, late: true, lateAfterMinutes: 55 })));
 expect(screen.queryByText("Preferences saved.")).not.toBeInTheDocument(); expect(screen.queryByLabelText("Minutes after planned pickup")).not.toBeInTheDocument();
});
