import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Role } from "@/lib/api/auth";
import { family } from "@/test-support/parentNavigation";
import ParentLayout from "./layout";
import { ParentHome } from "./ParentHome";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const fetcher = vi.fn(), tracking = vi.fn(() => <p>Prepared location</p>), inbox = vi.fn(() => <p>Prepared inbox</p>);
function show() { return render(<ParentLayout><ParentHome renderTracking={tracking} renderInbox={inbox} /></ParentLayout>); }
beforeEach(() => { vi.resetAllMocks(); tracking.mockReturnValue(<p>Prepared location</p>); inbox.mockReturnValue(<p>Prepared inbox</p>); vi.stubGlobal("fetch", fetcher); vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(["ADMIN", "DRIVER", "HEAD_OF_TRANSPORT"] as Role[])("never mounts feature compositions for %s", async role => {
  fetcher.mockResolvedValue(Response.json({ id: "other", schoolId: "school", email: "role@test.invalid", role })); show();
  await waitFor(() => expect(router.replace).toHaveBeenCalled()); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(tracking).not.toHaveBeenCalled(); expect(inbox).not.toHaveBeenCalled();
});
it("does not mount private features before authentication or after 401", async () => {
  fetcher.mockResolvedValue(new Response(null, { status: 401 })); show();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login")); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(tracking).not.toHaveBeenCalled(); expect(inbox).not.toHaveBeenCalled();
});
it("re-enters My children from the sidebar after opening absences", async () => {
  fetcher.mockImplementation(async (url: string) => Response.json(url.endsWith("/auth/me") ? { id: "parent", schoolId: "school", email: "parent@test.invalid", role: "PARENT" } : url.endsWith("/absences") ? [] : family));
  show(); await screen.findByText("Lina Navigation"); fireEvent.click(screen.getByRole("button", { name: "Absences" })); await screen.findByText("No upcoming absences.");
  fireEvent.click(screen.getByRole("link", { name: "My children" }));
  expect(await screen.findByRole("heading", { name: "My children", level: 1 })).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
});
