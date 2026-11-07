import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../../../../docs/contracts/samples/runs/parent-children.json";
import type { Child } from "@/lib/api/myChildren";
import ParentHome from "./page";

const fetch = vi.fn();
const children = sample satisfies Child[];
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { fetch.mockReset(); vi.stubGlobal("fetch", fetch); vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function show(value: Child[] = children) {
  fetch.mockResolvedValue(response(value));
  render(<ParentHome />);
  if (value.length) await screen.findByRole("region", { name: `${value[0].firstName} ${value[0].lastName}` });
  else await screen.findByRole("heading", { name: "No children linked yet" });
}

describe("SCRUM-248 Parent Home", () => {
  it("announces a loading state without showing sample children", () => {
    fetch.mockReturnValue(new Promise(() => {}));
    render(<ParentHome />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading your children's transport/i);
    expect(screen.queryByRole("heading", { name: "Tarek Mansour" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /call driver/i })).not.toBeInTheDocument();
  });

  it("renders all linked children and all assigned transport fields from real HTTP", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "My children" })).toBeVisible();
    expect(screen.getByText("2 children linked to your account")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Layla Mansour" })).toBeVisible();
    const child = within(screen.getByRole("region", { name: "Tarek Mansour" }));
    for (const text of ["Hamra morning run", "Karim Haddad", "+961 3 100 101", "A 123456", "07:21"]) expect(child.getByText(text)).toBeVisible();
    expect(child.getByText("07:21")).toHaveAttribute("dateTime", "07:21");
    expect(child.getByText(/not a live estimate/)).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/parent\/children$/), expect.objectContaining({ credentials: "include", method: "GET" }));
  });

  it("gives an unassigned child a clear state without stale driver fields", async () => {
    await show();
    const child = within(screen.getByRole("region", { name: "Layla Mansour" }));
    expect(child.getByText("No route assigned yet")).toBeVisible();
    expect(child.queryByText("Karim Haddad")).not.toBeInTheDocument();
    expect(child.queryByRole("link", { name: /call driver/i })).not.toBeInTheDocument();
    expect(child.queryByText("Planned morning pickup")).not.toBeInTheDocument();
  });

  it("handles parents without children without inventing sample data", async () => {
    await show([]);
    expect(screen.getByText(/once your school links your children/i)).toBeVisible();
    expect(screen.queryByRole("region", { name: "Tarek Mansour" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /call driver/i })).not.toBeInTheDocument();
  });

  it("keeps route, driver and call details when pickup time alone is null", async () => {
    await show([{ ...children[1], expectedPickupTime: null }]);
    expect(screen.getByText("Pickup time not available yet")).toBeVisible();
    expect(screen.getByText("Hamra morning run")).toBeVisible();
    expect(screen.getByText("Karim Haddad")).toBeVisible();
    expect(screen.getByRole("link", { name: "Call driver for Tarek Mansour" })).toHaveAttribute("href", "tel:+9613100101");
  });

  it("preserves school-local time without converting it to the device zone", async () => {
    await show([{ ...children[1], expectedPickupTime: "00:00" }]);
    expect(screen.getByText("00:00")).toHaveAttribute("dateTime", "00:00");
    expect(screen.queryByText("Pickup time not available yet")).not.toBeInTheDocument();
  });

  it("normalizes phone formatting into a native tel link with a 44px target", async () => {
    await show([{ ...children[1], driver: { ...children[1].driver!, phone: "+961 (70) 123-456" } }]);
    const link = screen.getByRole("link", { name: "Call driver for Tarek Mansour" });
    expect(link).toHaveAttribute("href", "tel:+96170123456");
    expect(link.tabIndex).toBe(0);
    expect(Number.parseFloat(getComputedStyle(link).minHeight)).toBeGreaterThanOrEqual(44);
    expect(screen.getByText("+961 (70) 123-456")).toBeVisible();
  });

  it.each(["", "  ", "javascript:alert(1)"])("does not create an unsafe or unusable call link for %j", async phone => {
    await show([{ ...children[1], driver: { ...children[1].driver!, phone } }]);
    expect(screen.queryByRole("link", { name: /call driver/i })).not.toBeInTheDocument();
    expect(screen.getByText(/calling is unavailable/i)).toBeVisible();
  });

  it("keeps different children's routes, drivers and call targets separate", async () => {
    const second = { ...children[1], studentId: "40000000-0000-4000-8000-000000000015", firstName: "Nour", route: { id: "route-nour", name: "Nour's route" }, driver: { id: "driver-nour", firstName: "Rana", lastName: "Test", phone: "+961 70 222 333" } };
    await show([children[1], second]);
    expect(within(screen.getByRole("region", { name: "Nour Mansour" })).getByRole("link", { name: /call driver/i })).toHaveAttribute("href", "tel:+96170222333");
    expect(within(screen.getByRole("region", { name: "Tarek Mansour" })).queryByText("Nour's route")).not.toBeInTheDocument();
  });

  it.each([404, 500, 503])("shows an honest error for HTTP %s and never substitutes preview data", async status => {
    fetch.mockResolvedValue(response({ detail: "Internal backend detail" }, status));
    render(<ParentHome />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong.*try again/i);
    expect(screen.queryByText("Internal backend detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tarek Mansour" })).not.toBeInTheDocument();
    expect(screen.queryByText("No children linked yet")).not.toBeInTheDocument();
  });

  it("offers sign-in after the children endpoint reports an expired session", async () => {
    fetch.mockResolvedValue(new Response(null, { status: 401 }));
    render(<ParentHome />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign-in has expired/i);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /call driver/i })).not.toBeInTheDocument();
  });

  it("explains permission failure without leaking transport data", async () => {
    fetch.mockResolvedValue(response({ detail: "Access denied" }, 403));
    render(<ParentHome />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/don't have access.*contact your school/i);
    expect(screen.queryByRole("region", { name: "Tarek Mansour" })).not.toBeInTheDocument();
  });

  it("recovers a network failure through Retry and renders the new response", async () => {
    fetch.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(response(children));
    render(<ParentHome />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Tarek Mansour" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { level: 1, name: "My children" })).toHaveFocus();
  });

  it.each([null, [{ ...children[1], driver: null }]])("renders malformed contract data as an error instead of crashing: %j", async payload => {
    fetch.mockResolvedValue(response(payload));
    render(<ParentHome />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });

  it("uses real HTTP even if an obsolete development preview flag is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "true");
    fetch.mockResolvedValue(response(children));
    render(<ParentHome />);
    await screen.findByRole("region", { name: "Tarek Mansour" });
    expect(screen.queryByText(/Development preview/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending response after unmount", async () => {
    let resolve!: (response: Response) => void;
    fetch.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const view = render(<ParentHome />);
    view.unmount();
    await act(async () => resolve(response(children)));
    expect(screen.queryByRole("heading", { name: "Tarek Mansour" })).not.toBeInTheDocument();
  });
});
