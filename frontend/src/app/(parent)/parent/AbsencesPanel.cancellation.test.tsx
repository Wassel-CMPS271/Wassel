import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Absence } from "@/lib/api/absences";
import type { Child } from "@/lib/api/myChildren";
import { AbsencesPanel } from "./AbsencesPanel";

// Exercise the actual absence client/request()/ApiError boundary; only HTTP is stubbed.
const child: Child = { studentId: "40000000-0000-4000-8000-000000000001", firstName: "Layla", lastName: "Nasser", route: null, driver: null, vehicle: null, expectedPickupTime: null, todayRun: null };
const first: Absence = { id: "60000000-0000-4000-8000-000000000001", studentId: child.studentId, fromDate: "2026-11-20", toDate: "2026-11-21" };
const second: Absence = { ...first, id: "60000000-0000-4000-8000-000000000002", fromDate: "2026-11-25", toDate: "2026-11-26" };
const dates = (absence: Absence) => `${absence.fromDate} to ${absence.toDate} (inclusive)`;
const path = `/api/parent/children/${child.studentId}/absences`;
const generic = "Couldn't complete the request. Please try again.";

beforeEach(() => {
 vi.useFakeTimers({ toFake: ["Date"] });
 vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function prepare(status: number | "network", detail: string) {
 const fetcher = vi.fn(async (url: string, options: RequestInit) => {
  if (new URL(url).pathname === path && options.method === "GET") return Response.json([first, second]);
  if (new URL(url).pathname === `${path}/${first.id}` && options.method === "DELETE") {
   if (status === "network") throw new TypeError(detail);
   return Response.json({ detail }, { status });
  }
  throw new Error("Unexpected absence request");
 });
 vi.stubGlobal("fetch", fetcher);
 render(<AbsencesPanel child={child} onBack={vi.fn()} />);
 await screen.findByText(dates(first));
 return fetcher;
}
function confirmCancellation() {
 const row = screen.getByText(dates(first)).closest("li")!;
 fireEvent.click(within(row).getByRole("button", { name: "Cancel absence" }));
 fireEvent.click(within(row).getByRole("button", { name: "Confirm cancellation" }));
}
function expectRetained() {
 expect(screen.getAllByRole("listitem")).toHaveLength(2);
 expect(screen.getByText(dates(first))).toBeVisible();
 expect(screen.getByText(dates(second))).toBeVisible();
 expect(screen.queryByText("Absence cancelled.")).not.toBeInTheDocument();
 expect(screen.queryByText("Upcoming days cancelled. Past absence days remain recorded.")).not.toBeInTheDocument();
 expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled();
}

it("shows the backend 409 reason when an absence ended since loading, without removing either record", async () => {
 const reason = "This absence has already ended, so it cannot be cancelled.";
 const fetcher = await prepare(409, reason);
 // The parent kept the page open across the end date; the server decides cancellation eligibility.
 vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
 confirmCancellation();
 const alert = await screen.findByRole("alert");
 expect(alert.textContent?.trim()).toBe(reason);
 expect(alert).not.toHaveTextContent(generic);
 expectRetained();
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`${path}/${first.id}`), expect.objectContaining({ method: "DELETE", credentials: "include" }));
});

it.each([
 [401, "Your sign-in has expired. Sign in again."],
 [403, "You don't have permission to manage these absences."],
 [404, "This child or absence is no longer available. Refresh your children's details."],
 [500, generic],
 [503, generic],
 ["network", generic],
] as const)("preserves cancellation handling for %s and keeps every record", async (status, expected) => {
 const privateDetail = "Private backend or network diagnostic";
 const fetcher = await prepare(status, privateDetail);
 confirmCancellation();
 const alert = await screen.findByRole("alert");
 expect(alert).toHaveTextContent(expected);
 expect(alert).not.toHaveTextContent(privateDetail);
 if (status === 401) expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
 expectRetained();
 expect(fetcher).toHaveBeenCalledTimes(2);
});
