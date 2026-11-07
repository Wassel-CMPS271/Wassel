import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sample from "../../../../../docs/contracts/samples/runs/parent-children.json";
import type { Role } from "@/lib/api/auth";
import ParentLayout from "./layout";
import ParentHome from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const fetch = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function session(role: Role) { return { id: "parent-248", email: "parent@contract.invalid", role, schoolId: "school-248" }; }
function show() { render(<ParentLayout><ParentHome /></ParentLayout>); }
beforeEach(() => { fetch.mockReset(); router.replace.mockReset(); vi.stubGlobal("fetch", fetch); vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("waits for authentication before loading or exposing any child data", () => {
  fetch.mockReturnValue(new Promise(() => {}));
  show();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toMatch(/\/api\/auth\/me$/);
  expect(screen.queryByRole("heading", { name: "My children" })).not.toBeInTheDocument();
});

it.each([["ADMIN", "/admin"], ["DRIVER", "/driver"], ["HEAD_OF_TRANSPORT", "/head-of-transport"]] as [Role, string][])("redirects %s without requesting parent data", async (role, home) => {
  fetch.mockResolvedValue(json(session(role)));
  show();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("region", { name: "Tarek Mansour" })).not.toBeInTheDocument();
});

it("redirects an unauthenticated session to sign-in without a children request", async () => {
  fetch.mockResolvedValue(new Response(null, { status: 401 }));
  show();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not turn an authentication outage into a sign-out or child-data load", async () => {
  fetch.mockResolvedValue(json({ detail: "unavailable" }, 503));
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach wassel/i);
  expect(router.replace).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves Parent navigation, the account block and authenticated logout", async () => {
  fetch.mockImplementation((url: string, init?: RequestInit) => {
    const path = new URL(url, "http://localhost").pathname;
    if (path === "/api/auth/me") return Promise.resolve(json(session("PARENT")));
    if (path === "/api/parent/children") return Promise.resolve(json(sample));
    if (path === "/api/auth/logout" && init?.method === "POST") return Promise.resolve(new Response(null, { status: 204 }));
    throw new Error(`Unexpected request: ${path}`);
  });
  show();
  await screen.findByRole("region", { name: "Tarek Mansour" });
  expect(screen.getByRole("navigation", { name: "Parent navigation" })).toBeVisible();
  expect(screen.getByRole("link", { name: /wassel.*parent/i })).toHaveAttribute("href", "/parent");
  expect(screen.getByText("parent@contract.invalid")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/auth\/logout$/), expect.objectContaining({ method: "POST", credentials: "include" }));
});
