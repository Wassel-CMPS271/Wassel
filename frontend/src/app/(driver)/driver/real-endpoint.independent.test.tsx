import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { day, run, student } from "@/test-support/driverContract";
import DriverTodayPage from "./page";

// Only the authenticated-user context is supplied; runs and request() remain real.
vi.mock("@/components/auth/RoleGuard", async () => ({
  ...await vi.importActual("@/components/auth/RoleGuard"),
  useCurrentUser: () => ({ id: "user-250", email: "independent@e2e.invalid", role: "DRIVER", schoolId: "school-250" }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Completion gate for SCRUM-243/244. No runs/sample module mock here: if the
// screen still ships synthetic data, it must not be mistaken for real wiring.
it("loads the signed-in driver's run from the real request()-based endpoint", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(day([run({
    route: { id: "10000000-0000-4000-8000-000000000099", name: "HTTP contract route" },
    stops: [student(1, { firstName: "HTTP", lastName: "Student" })],
  })])), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  render(<DriverTodayPage />);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/driver\/runs\/today$/), expect.objectContaining({ credentials: "include" })));
  expect(await screen.findByRole("heading", { name: "HTTP contract route" })).toBeVisible();
  await waitFor(() => expect(screen.getByText("HTTP Student")).toBeVisible());
});
