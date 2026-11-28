/// <reference types="vite/client" />
// SCRUM-246: independent acceptance tests for SCRUM-248 (Parent Home, PR #119), written from the Jira
// acceptance criteria and docs/contracts/runs.md + samples/runs/parent-children.json, not from the code.
// Every case renders the production layout and page, with the real RoleGuard and the real request()
// client. Only fetch and next/navigation are replaced.
//
//   H1 each child with route name, driver's name, vehicle plate and expected pickup time
//   H2 "Call driver" dials the driver's phone (tel: link)
//   H3 a child with no route shows a clear message instead of an empty card
//   H+ a parent with no children gets an empty state (SCRUM-246)
//   H4 loading and error states are shown
//   H5 works on a phone screen (360 px wide)
//   H6 uses the real endpoint, and the sample client is deleted
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createParentHomeServer, expected, fail, HANG, NETWORK, ok, samples,
  type ParentHomeServer,
} from "@/test-support/parentScreensContract";
import ParentLayout from "./layout";
import ParentPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/parent" }));

let server: ParentHomeServer;
function serve(initial: Parameters<typeof createParentHomeServer>[0] = {}) {
  server = createParentHomeServer(initial);
  vi.stubGlobal("fetch", server.fetch);
  return server;
}
const show = () => render(<ParentLayout><ParentPage /></ParentLayout>);

const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** One child's card: the region named by the card's heading. Exact name, because the list's own section is a region too. */
const card = (name: string) => screen.getByRole("region", { name });

beforeEach(() => { router.replace.mockReset(); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SCRUM-248 Parent Home (independent, SCRUM-246)", () => {
  it("H1: shows every linked child from the contract sample, by name", async () => {
    serve();
    show();
    expect(await screen.findByRole("region", { name: expected.tarek.name })).toBeInTheDocument();
    expect(card(expected.layla.name)).toBeInTheDocument();
  });

  it("H1: shows the route name, driver's name, vehicle plate and expected pickup time inside the child's own card", async () => {
    serve();
    show();
    await screen.findByRole("region", { name: expected.tarek.name });
    const text = squash(card(expected.tarek.name).textContent);
    expect(text).toContain(expected.tarek.route);
    expect(text).toContain(expected.tarek.driver);
    expect(text).toContain(expected.tarek.plate);
    // "HH:mm", school-local; the planned time is shown as it is, never converted to the device zone.
    expect(text).toContain(expected.tarek.pickup);
  });

  it("H2: 'Call driver' is a tel: link that dials the driver's phone", async () => {
    serve();
    show();
    await screen.findByRole("region", { name: expected.tarek.name });
    const call = within(card(expected.tarek.name)).getByRole("link", { name: /call/i });
    const href = call.getAttribute("href") ?? "";
    expect(href.startsWith("tel:")).toBe(true);
    // Display spaces/dashes/brackets are not digits; the dialled number must be exactly the driver's.
    expect(decodeURIComponent(href.slice(4)).replace(/[\s().-]/g, "")).toBe(expected.tarek.dialled);
  });

  it("H3: a child with no route gets a clear message and no transport details or call link", async () => {
    serve();
    show();
    await screen.findByRole("region", { name: expected.layla.name });
    const layla = card(expected.layla.name);
    // Matched per element: textContent joins sibling elements without a space ("MansourNo route…").
    expect(within(layla).getByText(/\b(no|not)\b[^.]{0,40}\b(route|assigned)\b/i)).toBeVisible();
    expect(within(layla).queryByRole("link", { name: /call/i })).toBeNull();
    const text = squash(layla.textContent);
    for (const value of [expected.tarek.route, expected.tarek.driver, expected.tarek.plate, expected.tarek.pickup]) {
      expect(text).not.toContain(value);
    }
  });

  it("H+: a parent with no linked children sees an empty state, not a blank page", async () => {
    serve({ children: [] });
    show();
    expect(await screen.findByText(/no (linked )?child(ren)?|not linked|no children/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /call/i })).toBeNull();
  });

  it("H4: shows a loading state while the children are on their way", async () => {
    serve({ children: [HANG] });
    show();
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: expected.tarek.name })).toBeNull();
  });

  it.each([
    ["a server error (HTTP 500)", fail(500, { detail: "Internal Server Error" })],
    ["a network failure", NETWORK],
  ])("H4: shows an error in plain words for %s, and Retry loads the children", async (_, failure) => {
    serve({ children: [failure, ok(samples.children())] });
    show();
    const alert = await screen.findByRole("alert");
    const text = squash(alert.textContent);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\b500\b|[{}]|TypeError|Failed to fetch|undefined|null/);
    expect(screen.queryByRole("region", { name: expected.tarek.name })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(await screen.findByRole("region", { name: expected.tarek.name })).toBeInTheDocument();
    expect(server.requests("/api/parent/children", "GET")).toHaveLength(2);
  });

  it("H5: on a 360 px wide screen the call action is a real link and the child's details are all present", async () => {
    // jsdom has no layout engine: geometry (overflow, 44 px targets) is only verifiable in a real browser.
    // What this proves at 360 px is that nothing is hidden or swapped for a non-interactive element.
    vi.stubGlobal("innerWidth", 360);
    window.dispatchEvent(new Event("resize"));
    serve();
    show();
    await screen.findByRole("region", { name: expected.tarek.name });
    const call = within(card(expected.tarek.name)).getByRole("link", { name: /call/i });
    expect(call.tagName).toBe("A");
    expect(call).toBeVisible();
    for (const value of [expected.tarek.route, expected.tarek.driver, expected.tarek.plate, expected.tarek.pickup]) {
      expect(squash(card(expected.tarek.name).textContent)).toContain(value);
    }
  });

  it("H6: loads the children from the real cookie-authenticated endpoint, with no parent or child id sent", async () => {
    serve();
    show();
    await screen.findByRole("region", { name: expected.tarek.name });
    const calls = server.requests("/api/parent/children", "GET");
    expect(calls).toHaveLength(1);
    expect(calls[0].credentials).toBe("include");
    expect(calls[0].search).toBe("");
    // The school and the parent come from the session (runs.md Conventions): neither is ever sent.
    for (const entry of server.log) {
      expect(entry.path + entry.search).not.toContain("parent-246");
      expect(entry.path + entry.search).not.toContain("school-246");
    }
  });

  it("H6: no parent/children sample or development client is left in lib/api", () => {
    const modules = Object.keys(import.meta.glob("../../../lib/api/**/*.ts"))
      .filter(path => !/\.test\.ts$/.test(path));
    const leftovers = modules.filter(path => /child|parent|absen/i.test(path) && /sample|development|preview|fixture|mock/i.test(path));
    expect(modules.length).toBeGreaterThan(0);
    expect(leftovers).toEqual([]);
  });
});
