import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { family, deferred } from "@/test-support/parentNavigation";
import type { Child } from "@/lib/api/myChildren";
import { ParentHome } from "./ParentHome";
import ParentPage from "./page";

vi.mock("@/components/map/MapView", () => ({ MapView: (p: { label: string }) => <div role="region" aria-label={p.label} /> }));
const fetcher = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false");
  fetcher.mockImplementation(async (url: string) => {
    if (url.endsWith("/api/parent/children")) return Response.json(family);
    if (url.endsWith("/absences")) return Response.json([]);
    throw new Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("enables accepted GPS navigation lazily while unmerged inbox stays unavailable", async () => {
  render(<ParentPage />); await screen.findByText("Lina Navigation");
  const nav = screen.getByRole("navigation", { name: "Family views" });
  expect(nav).toBeVisible();
  expect(screen.getByRole("button", { name: "Bus tracking" })).toBeEnabled();
  for (const label of ["Inbox"]) {
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    expect(screen.getByText(label).closest('[aria-disabled="true"]')).toHaveTextContent("Soon");
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("navigates absences and switches only among the authenticated linked children", async () => {
  render(<ParentHome />); await screen.findByText("Lina Navigation");
  fireEvent.click(screen.getByRole("button", { name: "Absences" }));
  await screen.findByText("No upcoming absences.");
  const picker = screen.getByRole("combobox", { name: "Choose child for absences" });
  expect(picker).toHaveValue(family[0].studentId);
  fireEvent.change(picker, { target: { value: family[1].studentId } });
  await screen.findByRole("heading", { name: "Absences for Omar Navigation" });
  await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/children/${family[1].studentId}/absences`), expect.objectContaining({ credentials: "include" })));
  fireEvent.click(screen.getByRole("button", { name: "My children" }));
  expect(await screen.findByRole("heading", { level: 1, name: "My children" })).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
it("prepares tracking child switching and removes the prior child panel", async () => {
  const tracking = vi.fn((child: Child) => <p>Authorized tracking: {child.studentId}</p>);
  render(<ParentHome renderTracking={tracking} />); await screen.findByText("Lina Navigation");
  fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
  expect(screen.getByText(`Authorized tracking: ${family[0].studentId}`)).toBeVisible();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: family[1].studentId } });
  expect(screen.queryByText(`Authorized tracking: ${family[0].studentId}`)).not.toBeInTheDocument();
  expect(screen.getByText(`Authorized tracking: ${family[1].studentId}`)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Absences" }));
  expect(await screen.findByRole("heading", { name: "Absences for Omar Navigation" })).toBeVisible();
});
it("keeps a parent-wide inbox separate from child absence state", async () => {
  const inbox = vi.fn(() => <p>Prepared inbox</p>);
  render(<ParentHome renderInbox={inbox} />); await screen.findByText("Lina Navigation");
  fireEvent.click(screen.getByRole("button", { name: "Absences" })); await screen.findByText("No upcoming absences.");
  fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
  expect(screen.getByText("Prepared inbox")).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByText("No upcoming absences.")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not open a child feature for an empty family", async () => {
  fetcher.mockResolvedValue(Response.json([])); const tracking = vi.fn();
  render(<ParentHome renderTracking={tracking} />); await screen.findByText("No children linked yet");
  expect(screen.getByRole("button", { name: "Bus tracking" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Absences" })).toBeDisabled(); expect(tracking).not.toHaveBeenCalled();
});
it("uses keyboard navigation, focuses the destination and retains 44px controls at 360px", async () => {
  vi.stubGlobal("innerWidth", 360); const user = userEvent.setup();
  render(<ParentHome renderTracking={child => <p>{child.firstName}&apos;s prepared map</p>} />); await screen.findByText("Lina Navigation");
  const button = screen.getByRole("button", { name: "Bus tracking" }); button.focus(); await user.keyboard(" ");
  await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Bus tracking" })).toHaveFocus());
  const picker = screen.getByRole("combobox");
  expect(Number.parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(44);
  expect(Number.parseFloat(getComputedStyle(picker).minHeight)).toBeGreaterThanOrEqual(44);
  expect(picker).toHaveAccessibleName("Choose child for bus tracking");
});
it("drops an old account's children and late refresh when the lifetime key changes", async () => {
  const waiting = deferred<Response>(); const view = render(<ParentHome accountKey="first" />); await screen.findByText("Lina Navigation");
  fetcher.mockReturnValueOnce(waiting.promise);
  fireEvent.click(screen.getByRole("button", { name: "Refresh transport details" }));
  fetcher.mockResolvedValue(Response.json([])); view.rerender(<ParentHome accountKey="second" />);
  expect(screen.queryByText("Lina Navigation")).not.toBeInTheDocument(); await screen.findByText("No children linked yet");
  await act(async () => waiting.resolve(Response.json(family)));
  await waitFor(() => expect(screen.queryByText("Lina Navigation")).not.toBeInTheDocument());
});

it.each(["tracking", "inbox"])("removes private content and explains unavailable %s when its client is withdrawn", async kind => {
  const content = () => <p>Private prepared feature</p>;
  const view = render(<ParentHome renderTracking={kind === "tracking" ? content : undefined} renderInbox={kind === "inbox" ? content : undefined} />);
  await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: kind === "tracking" ? "Bus tracking" : "Inbox" }));
  expect(screen.getByText("Private prepared feature")).toBeVisible(); view.rerender(<ParentHome />);
  expect(screen.queryByText("Private prepared feature")).not.toBeInTheDocument();
  expect(screen.getByText(kind === "tracking" ? "Live tracking is not available yet." : "Inbox is not available yet.")).toBeVisible();
});

it("production requests the real cookie-authenticated GPS endpoint for the selected linked child", async () => {
  fetcher.mockImplementation(async (url: string) => url.endsWith("/api/parent/children") ? Response.json(family) : url.endsWith("/bus-location") ? Response.json({ status: "LIVE", position: { latitude: 33.9, longitude: 35.5, accuracyMeters: 12, receivedAt: "2026-11-12T07:00:00Z", ageSeconds: 0 } }) : Promise.reject(new Error(url)));
  render(<ParentPage />); await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
  await screen.findByText("Live bus location");
  expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/children/${family[0].studentId}/bus-location`), expect.objectContaining({ credentials: "include", method: "GET" }));
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: family[1].studentId } }); await screen.findByRole("region", { name: /Omar/ });
  expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/children/${family[1].studentId}/bus-location`), expect.objectContaining({ credentials: "include" }));
});
