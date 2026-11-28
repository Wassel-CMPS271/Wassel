import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthUser, Role } from "@/lib/api/auth";
import { pathOf, response } from "@/test-support/operationsContract";
import AdminLayout from "./layout";
import AdminHome from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin" }));
const user = (role: Role): AuthUser => ({ id: "a", email: "test@example.invalid", role, schoolId: "school" });
const show = () => render(<AdminLayout><AdminHome /></AdminLayout>);
let fetcher: ReturnType<typeof vi.fn>;
function serve(session: AuthUser | number | Promise<Response>) {
  fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.credentials).toBe("include");
    if (pathOf(input) === "/api/auth/me" && init?.method === "GET") {
      if (session instanceof Promise) return session;
      return typeof session === "number" ? response({ detail: "Private server diagnostic" }, session) : response(session);
    }
    if (pathOf(input) === "/api/auth/logout" && init?.method === "POST") return response(undefined, 204);
    throw new Error(`Unexpected Admin request: ${input}`);
  });
  vi.stubGlobal("fetch", fetcher);
}
beforeEach(() => { router.replace.mockReset(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

it("shows no administration data before authentication completes", () => {
  serve(new Promise<Response>(() => {})); show();
  expect(screen.queryByRole("heading", { name: "School administration" })).not.toBeInTheDocument();
});
it.each([["PARENT", "/parent"], ["DRIVER", "/driver"], ["HEAD_OF_TRANSPORT", "/head-of-transport"]] as [Role, string][])("hides Admin navigation from %s", async (role, home) => {
  serve(user(role)); show(); await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
  expect(screen.queryByRole("navigation", { name: /admin/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "School administration" })).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(pathOf(fetcher.mock.calls[0][0])).toBe("/api/auth/me");
  expect(fetcher.mock.calls[0][1].body).toBeUndefined();
});
it("redirects a signed-out user", async () => {
  serve(401); show(); await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("shows an outage without exposing the shell or signing out", async () => {
  serve(500); show(); await screen.findByRole("alert"); expect(router.replace).not.toHaveBeenCalled();
  expect(screen.queryByText("Private server diagnostic")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "School administration" })).not.toBeInTheDocument();
});
it("gives an authorized Admin the three real destinations and authenticated logout", async () => {
  serve(user("ADMIN")); show(); await screen.findByRole("heading", { name: "School administration" });
  expect(screen.getByRole("link", { name: /Open school times$/ })).toHaveAttribute("href", "/admin/school-times");
  expect(screen.getByRole("link", { name: /Open school calendar$/ })).toHaveAttribute("href", "/admin/calendar");
  expect(screen.getByRole("link", { name: /Invite head of transportation$/ })).toHaveAttribute("href", "/admin/head-of-transport");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  const logout = fetcher.mock.calls.filter(([input]) => pathOf(input) === "/api/auth/logout");
  expect(logout).toHaveLength(1); expect(logout[0][1]).toMatchObject({ method: "POST", credentials: "include" });
});
