import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { family, deferred } from "@/test-support/parentNavigation";
import ParentLayout from "./layout";
import ParentPage from "./page";
const session = vi.hoisted(() => ({ user: { id: "first", schoolId: "school", email: "first@test.invalid", role: "PARENT" } }));
// This suite isolates the shell lifetime boundary; authorization is exercised
// separately through the actual RoleGuard in ParentFeatures.authorization.
vi.mock("@/components/auth/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => children, useCurrentUser: () => session.user }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const fetcher = vi.fn();
beforeEach(() => { session.user = { ...session.user, id: "first", schoolId: "school" }; vi.stubGlobal("fetch", fetcher); vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(["account", "school"])("remounts private state when the %s identity changes", async field => {
  const old = deferred<Response>(); fetcher.mockReset().mockReturnValueOnce(old.promise).mockResolvedValue(Response.json([]));
  const view = render(<ParentLayout><ParentPage /></ParentLayout>);
  session.user = { ...session.user, [field === "school" ? "schoolId" : "id"]: "second" };
  view.rerender(<ParentLayout><ParentPage /></ParentLayout>); await screen.findByText("No children linked yet");
  await act(async () => old.resolve(Response.json(family)));
  expect(screen.queryByText("Lina Navigation")).not.toBeInTheDocument(); expect(fetcher).toHaveBeenCalledTimes(2);
});
it("brand navigation returns from Absences to the real child list", async () => {
  fetcher.mockReset().mockImplementation(async (url: string) => Response.json(url.endsWith("/absences") ? [] : family));
  render(<ParentLayout><ParentPage /></ParentLayout>); await screen.findByText("Lina Navigation");
  fireEvent.click(screen.getByRole("button", { name: "Absences" })); await screen.findByText("No upcoming absences.");
  fireEvent.click(screen.getByRole("link", { name: /Wassel.*Parent/i }));
  await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "My children" })).toBeVisible());
  expect(screen.queryByText("No upcoming absences.")).not.toBeInTheDocument();
});
