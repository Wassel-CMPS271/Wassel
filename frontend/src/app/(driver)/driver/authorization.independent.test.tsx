import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { me, type AuthUser, type Role } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { getDriverToday } from "@/lib/api/runs";
import { day, deferred } from "@/test-support/driverContract";
import DriverLayout from "./layout";
import DriverTodayPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/auth", async () => ({ ...await vi.importActual("@/lib/api/auth"), me: vi.fn() }));
// Both source revisions share these spies. The separate unmocked HTTP gate
// still fails when the production screen uses samples instead of request().
const driverCalls = vi.hoisted(() => ({
  getDriverToday: vi.fn(), startRun: vi.fn(), endRun: vi.fn(), confirmStudent: vi.fn(),
}));
vi.mock("@/lib/api/runs", async () => ({
  ...await vi.importActual("@/lib/api/runs"), ...driverCalls,
}));
vi.mock("@/lib/api/runs.sample", () => ({
  getDriverTodaySample: driverCalls.getDriverToday, startRunSample: driverCalls.startRun,
  endRunSample: driverCalls.endRun, confirmStudentSample: driverCalls.confirmStudent,
}));

function user(role: Role): AuthUser {
  return { id: "user-250", email: "independent@e2e.invalid", role, schoolId: "school-250" };
}
function show() { render(<DriverLayout><DriverTodayPage /></DriverLayout>); }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getDriverToday).mockResolvedValue(day()); });
afterEach(cleanup);

it("does not load driver data or actions before the session role is known", () => {
  const session = deferred<AuthUser>();
  vi.mocked(me).mockReturnValue(session.promise);
  show();
  expect(getDriverToday).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /start run|end run|picked up/i })).not.toBeInTheDocument();
});

it.each([["ADMIN", "/admin"], ["PARENT", "/parent"], ["HEAD_OF_TRANSPORT", "/head-of-transport"]] as [Role, string][])("does not expose driver data/actions to %s", async (role, home) => {
  vi.mocked(me).mockResolvedValue(user(role));
  show();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
  expect(getDriverToday).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /start run|end run|picked up/i })).not.toBeInTheDocument();
});

it("redirects a signed-out user without loading driver data", async () => {
  vi.mocked(me).mockRejectedValue(new ApiError(401));
  show();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  expect(getDriverToday).not.toHaveBeenCalled();
});

it("shows an auth outage without exposing actions or incorrectly signing out", async () => {
  vi.mocked(me).mockRejectedValue(new ApiError(503));
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach wassel/i);
  expect(router.replace).not.toHaveBeenCalled();
  expect(getDriverToday).not.toHaveBeenCalled();
});

it("lets an authenticated driver view and act on today's run", async () => {
  vi.mocked(me).mockResolvedValue(user("DRIVER"));
  show();
  expect(await screen.findByRole("button", { name: "End run" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Picked up" })).toBeEnabled();
  expect(router.replace).not.toHaveBeenCalled();
});
