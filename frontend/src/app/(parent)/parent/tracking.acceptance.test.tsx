// SCRUM-278: independent acceptance tests for SCRUM-279 (parent live bus map and countdown, PR #149).
// Every case goes through the production page and layout, the real RoleGuard and the real request()
// client. Only fetch, next/navigation and MapView are replaced. Expected values come from
// docs/contracts/samples and the hand-computed numbers in test-support/parentAcceptance.ts.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOREIGN_ID, HANG, LAYLA_ID, NETWORK, SAMI_ID, TAREK_ID,
  advanceSeconds, busLocation, createParentServer, deferred, expected, fail, installGpsClock, layla, ok,
  samples, sessionAs, settle, tarekAsSampled, waitingSami, waitingTarek, type ParentServer,
} from "@/test-support/parentAcceptance.owned";
import ParentLayout from "./layout";
import ParentPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/parent" }));
vi.mock("@/components/map/MapView", async () => ({ MapView: (await import("@/test-support/parentAcceptance.owned")).FakeMapView }));

let server: ParentServer;
function serve(initial: Parameters<typeof createParentServer>[0] = {}) {
  server = createParentServer(initial);
  vi.stubGlobal("fetch", server.fetch);
  return server;
}
const show = () => render(<ParentLayout><ParentPage /></ParentLayout>);

beforeEach(() => { router.replace.mockReset(); vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false"); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // The fake backend answers every request the contract defines; anything else is a finding.
  expect(server?.unexpected ?? []).toEqual([]);
});

// --- page helpers -----------------------------------------------------------------------------

/** Real timers: wait for the authenticated page to have loaded the family. The "My children" heading is
 *  already there while /children is loading, and the view buttons stay disabled until it answers. */
async function openPage() {
  show();
  await screen.findByRole("heading", { level: 1, name: "My children" });
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Bus tracking" })).toBeEnabled());
}
/** Fake GPS clock: no findBy* (RTL cannot see Vitest's fake timers), only explicit settling. */
async function openPageOnClock() { show(); await settle(); expect(screen.getByRole("heading", { level: 1, name: "My children" })).toBeInTheDocument(); }
async function openTracking() { fireEvent.click(screen.getByRole("button", { name: "Bus tracking" })); await settle(); }
async function chooseChild(id: string) { fireEvent.change(screen.getByRole("combobox", { name: /choose child for bus tracking/i }), { target: { value: id } }); await settle(); }
const card = (name: string) => screen.getByRole("heading", { level: 2, name: `Bus tracking for ${name}` }).parentElement as HTMLElement;
const map = () => screen.queryByRole("region", { name: /bus location for/i });
const timer = () => screen.queryByRole("timer");

describe("SCRUM-279 AC1: a parent sees the bus of their own linked child only", () => {
  it("requests nothing about a bus before Bus tracking is opened, then only the selected linked child's bus-location, with the session cookie and no identity parameter", async () => {
    serve({ children: [layla(), waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    installGpsClock();
    await openPageOnClock();
    expect(server.log.map(entry => entry.path)).toEqual(["/api/auth/me", "/api/parent/children"]);

    await openTracking(); // the first linked child (Layla) is selected and has no run
    expect(server.busRequests()).toHaveLength(0);

    await chooseChild(TAREK_ID);
    const requests = server.busRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "GET", path: `/api/parent/children/${TAREK_ID}/bus-location`, search: "", credentials: "include", body: undefined });
    expect(server.busRequests(LAYLA_ID)).toHaveLength(0);
  });

  it("offers only the children from /children and never requests an id outside that list", async () => {
    serve({ children: [layla(), waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    server.busLocation(FOREIGN_ID, ok(samples.live()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    const select = await screen.findByRole("combobox", { name: /choose child for bus tracking/i });
    expect(within(select).getAllByRole("option").map(option => option.textContent)).toEqual(["Layla Mansour", "Tarek Mansour"]);

    fireEvent.change(select, { target: { value: FOREIGN_ID } }); // a tampered value
    await act(async () => {});
    expect(server.log.some(entry => entry.url.includes(FOREIGN_ID))).toBe(false);
    expect(server.parentRequests().every(entry => entry.path === "/api/parent/children" || entry.path.includes(TAREK_ID))).toBe(true);
  });

  it("makes no bus-location request and draws no marker for a child the backend says is not waiting (sample Tarek, stopsLeft null)", async () => {
    serve({ children: [tarekAsSampled()] });
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await screen.findByRole("heading", { level: 2, name: "Bus tracking for Tarek Mansour" });
    await act(async () => {});
    expect(server.busRequests()).toHaveLength(0);
    expect(map()).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();
  });
});

describe("SCRUM-279 AC2: wrong role or ownership (401/403/404) is handled without leaking", () => {
  it.each([["ADMIN", "/admin"], ["DRIVER", "/driver"], ["HEAD_OF_TRANSPORT", "/head-of-transport"]])("redirects a %s session to %s with zero /api/parent requests", async (role, home) => {
    serve({ session: sessionAs(role) });
    show();
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    await act(async () => {});
    expect(server.parentRequests()).toEqual([]);
    expect(screen.queryByRole("heading", { name: /bus tracking/i })).not.toBeInTheDocument();
  });

  it("sends a signed-out visitor (401 on /me) to /login with zero /api/parent requests", async () => {
    serve({ session: 401 });
    show();
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    await act(async () => {});
    expect(server.parentRequests()).toEqual([]);
  });

  it.each([403, 404])("removes the map, the coordinates and the countdown when a poll answers %s, without showing the server's reason", async status => {
    const reason = "Tarek Mansour is now linked to parent account parent-999";
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.live()), fail(status, { detail: reason }));
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    expect(card("Tarek Mansour").textContent).toContain(expected.live.coordinates);
    expect(timer()).toBeInTheDocument();

    await advanceSeconds(15); // the next poll
    const text = card("Tarek Mansour").textContent ?? "";
    expect(within(card("Tarek Mansour")).getByRole("alert")).toHaveTextContent(/not available/i);
    expect(map()).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();
    expect(text).not.toContain(expected.live.coordinates);
    expect(text).not.toContain(reason);
    expect(text).not.toMatch(/parent-999|linked to/i);
  });

  it("tells a parent the same thing for 403 and 404, so the reason (another parent's child or unknown) is not revealed", async () => {
    const texts: string[] = [];
    for (const [status, detail] of [[403, "Forbidden: belongs to parent-999"], [404, "No student 4000…99"]] as const) {
      serve({ children: [waitingTarek()] });
      server.busLocation(TAREK_ID, fail(status, { detail }));
      await openPage();
      fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
      await screen.findByRole("alert");
      texts.push(card("Tarek Mansour").textContent ?? "");
      cleanup();
    }
    expect(texts[0]).toBe(texts[1]);
  });

  it("removes earlier coordinates and offers Sign in (to /login) when a poll answers 401", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.live()), fail(401));
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    expect(map()).toBeInTheDocument();

    await advanceSeconds(15);
    expect(within(card("Tarek Mansour")).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(map()).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();
    expect(card("Tarek Mansour").textContent).not.toContain(expected.live.coordinates);
  });
});

describe("SCRUM-279 AC3: the live estimate is shown apart from the planned time", () => {
  it("shows the planned time (07:18, not a live estimate) and the live countdown (5m 50s, arriving 07:21) as separate elements (sample bus-location-live)", async () => {
    // expectedPickupTime 07:15 differs from every sample time, so 07:21 can only come from the estimate.
    serve({ children: [waitingTarek({}, { expectedPickupTime: "07:15" })] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    const countdown = await screen.findByRole("timer");
    expect(countdown).toHaveTextContent(expected.live.countdown);
    expect(countdown.textContent).not.toContain(expected.live.planned);

    const planned = within(card("Tarek Mansour")).getByText(new RegExp(`Planned pickup: ${expected.live.planned}`));
    expect(planned).toHaveTextContent(/not a live estimate/i);
    expect(countdown.contains(planned) || planned.contains(countdown)).toBe(false);

    const arrival = card("Tarek Mansour").querySelector(`time[datetime="${expected.live.arrivesAt}"]`);
    expect(arrival).not.toBeNull();
    expect(arrival).toHaveTextContent(expected.live.arrivesSchoolTime);
    expect(planned.contains(arrival)).toBe(false);
  });

  it("counts down from the server's secondsAway with monotonic time, and a device clock change does not move it", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.live()), HANG);
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    expect(timer()).toHaveTextContent("Estimated arrival in 5m 50s");

    await advanceSeconds(5); // 350 - 5 = 345 = 5m 45s
    expect(timer()).toHaveTextContent("Estimated arrival in 5m 45s");

    vi.setSystemTime(Date.now() + 60 * 60 * 1000); // the phone's clock jumps one hour
    await advanceSeconds(1); // 350 - 6 = 344 = 5m 44s
    expect(timer()).toHaveTextContent("Estimated arrival in 5m 44s");
    expect(card("Tarek Mansour").querySelector(`time[datetime="${expected.live.arrivesAt}"]`)).toHaveTextContent(expected.live.arrivesSchoolTime);
  });

  it("treats secondsAway 0 as 'due', never as 'arrived'", async () => {
    serve({ children: [waitingTarek({ stopsLeft: 0 })] });
    server.busLocation(TAREK_ID, ok(busLocation(samples.live(), { stopsLeft: 0, estimate: { arrivesAt: "2026-10-21T04:16:00Z", secondsAway: 0 } })));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    expect(await screen.findByRole("timer")).toHaveTextContent(/due/i);
    expect(document.body.textContent).not.toMatch(/arrived|has arrived|is here/i);
  });

  it("shows no countdown when the server sends no estimate, even with a planned time (a countdown is never derived from the plan)", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(busLocation(samples.live(), { estimate: null })));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await screen.findByRole("region", { name: /bus location for/i });
    expect(timer()).not.toBeInTheDocument();
    expect(card("Tarek Mansour").textContent).toContain(`Planned pickup: ${expected.live.planned}`);
  });
});

describe("SCRUM-279 AC4: stale and missing GPS are clearly labelled and never shown as live", () => {
  it("labels a STALE fix as last seen 140 s ago, marks it 'last known', and shows no countdown and no 'late' wording (sample bus-location-stale)", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.stale()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    const region = await screen.findByRole("region", { name: /bus location for/i });
    const text = card("Tarek Mansour").textContent ?? "";
    expect(text).toMatch(/Last seen 140 seconds ago/);
    expect(text).toMatch(/stale/i);
    expect(text).not.toMatch(/live bus location/i);
    expect(text).not.toMatch(/\blate\b/i);
    expect(within(region).getByText(new RegExp(`Last known bus location at ${expected.stale.coordinates}`))).toBeInTheDocument();
    expect(within(region).queryByText(/current bus location/i)).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();
  });

  it("says the location is unavailable, draws no map and no countdown, and keeps the stops remaining (sample bus-location-unavailable)", async () => {
    serve({ children: [waitingTarek({ stopsLeft: 1 })] });
    server.busLocation(TAREK_ID, ok(samples.unavailable()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await within(await screen.findByRole("heading", { level: 2, name: /bus tracking for/i }).then(h => h.parentElement as HTMLElement)).findByText(/location is unavailable/i);
    expect(map()).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();
    expect(card("Tarek Mansour").textContent).toMatch(new RegExp(`Stops remaining: ${expected.unavailable.stopsLeft}`));
  });

  it("ages a LIVE fix on the client: stale after 60 s with the countdown gone, no marker after 300 s, while the next poll hangs", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(busLocation(samples.live(), {}, { ageSeconds: 50 })), HANG);
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    expect(card("Tarek Mansour").textContent).toMatch(/live bus location/i);
    expect(timer()).toBeInTheDocument();

    await advanceSeconds(10); // age 60: still within LIVE (<= 60)
    expect(card("Tarek Mansour").textContent).toMatch(/live bus location/i);
    expect(timer()).toBeInTheDocument();

    await advanceSeconds(1); // age 61
    expect(card("Tarek Mansour").textContent).toMatch(/Last seen 61 seconds ago/);
    expect(card("Tarek Mansour").textContent).not.toMatch(/live bus location/i);
    expect(timer()).not.toBeInTheDocument();
    expect(within(map()!).getByText(/Last known bus location/)).toBeInTheDocument();

    await advanceSeconds(239); // age 300: still the last known position
    expect(map()).toBeInTheDocument();
    await advanceSeconds(1); // age 301: too old to draw
    expect(map()).not.toBeInTheDocument();
    expect(card("Tarek Mansour").textContent).not.toContain(expected.live.coordinates);
    expect(timer()).not.toBeInTheDocument();
    expect(server.busRequests()).toHaveLength(2); // the first answer and the hanging poll at 15 s
  });

  it.each([
    ["STALE carrying an estimate", busLocation(samples.stale(), { estimate: { arrivesAt: "2026-10-21T04:21:50Z", secondsAway: 350 } })],
    ["LIVE with ageSeconds 200", busLocation(samples.live(), {}, { ageSeconds: 200 })],
  ])("never shows a countdown or a 'live' label for a response that breaks the freshness contract: %s", async (_name, body) => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(body));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await screen.findByRole("heading", { level: 2, name: /bus tracking for/i });
    await vi.waitFor(() => expect(server.busRequests()).toHaveLength(1));
    await act(async () => {});
    await vi.waitFor(() => expect(within(card("Tarek Mansour")).queryByText(/loading bus location/i)).not.toBeInTheDocument());
    expect(timer()).not.toBeInTheDocument();
    expect(card("Tarek Mansour").textContent).not.toMatch(/live bus location/i);
    expect(screen.queryByText(/current bus location/i)).not.toBeInTheDocument();
  });

  it("draws no marker for a LIVE response without a position", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(busLocation(samples.live(), { position: null })));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await screen.findByRole("heading", { level: 2, name: /bus tracking for/i });
    await vi.waitFor(() => expect(within(card("Tarek Mansour")).queryByText(/loading bus location/i)).not.toBeInTheDocument());
    expect(map()).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();
  });
});

describe("SCRUM-279 AC5: multiple children and switching between them", () => {
  it("switches to the second child's own URL and drops the first child's map at once", async () => {
    serve({ children: [waitingTarek(), waitingSami()] });
    const sami = deferred();
    server.busLocation(TAREK_ID, ok(samples.live()));
    server.busLocation(SAMI_ID, sami);
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    expect(card("Tarek Mansour").textContent).toContain(expected.live.coordinates);

    await chooseChild(SAMI_ID);
    expect(server.busRequests(SAMI_ID)).toHaveLength(1);
    expect(screen.queryByRole("heading", { level: 2, name: "Bus tracking for Tarek Mansour" })).not.toBeInTheDocument();
    expect(card("Sami Mansour").textContent).not.toContain(expected.live.coordinates);
    expect(map()).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();

    sami.resolve(ok(samples.stale()));
    await settle();
    expect(card("Sami Mansour").textContent).toContain(expected.stale.coordinates);
    expect(card("Sami Mansour").textContent).not.toContain(expected.live.coordinates);
  });

  it("never shows a late reply for the first child under the second, and stops polling the first", async () => {
    serve({ children: [waitingTarek(), waitingSami()] });
    const tarekLate = deferred();
    server.busLocation(TAREK_ID, tarekLate);
    server.busLocation(SAMI_ID, ok(samples.stale()));
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    await chooseChild(SAMI_ID);
    expect(card("Sami Mansour").textContent).toContain(expected.stale.coordinates);

    tarekLate.resolve(ok(busLocation(samples.live(), {}, { latitude: 33.9001, longitude: 35.5001 })));
    await settle();
    expect(card("Sami Mansour").textContent).toContain(expected.stale.coordinates);
    expect(document.body.textContent).not.toContain("33.9001");
    expect(timer()).not.toBeInTheDocument(); // Sami's fix is STALE, Tarek's LIVE estimate must not leak in

    await advanceSeconds(30);
    expect(server.busRequests(TAREK_ID)).toHaveLength(1);
    expect(document.body.textContent).not.toContain("33.9001");
  });
});

describe("SCRUM-279 AC6: no active run, loading, errors and Retry", () => {
  it.each([
    ["no run today", null, /no run today/i],
    ["a run not started", { direction: "MORNING", state: "NOT_STARTED", stopsLeft: null }, /not started/i],
    ["a finished run", { direction: "MORNING", state: "FINISHED", stopsLeft: null }, /finished/i],
  ])("says so for %s, with no request, no map and no countdown", async (_name, run, message) => {
    serve({ children: [{ ...waitingTarek(), todayRun: run }] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await screen.findByText(message);
    await act(async () => {});
    expect(server.busRequests()).toHaveLength(0);
    expect(map()).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();
  });

  it("picks up a run that starts while the tracking screen is open (NOT_STARTED, then IN_PROGRESS on the server) within two minutes", async () => {
    serve({ children: [waitingTarek({ state: "NOT_STARTED", stopsLeft: null })] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    expect(card("Tarek Mansour").textContent).toMatch(/not started/i);

    server.state.children = [waitingTarek()]; // the driver starts the run
    await advanceSeconds(120);
    expect(server.busRequests(TAREK_ID).length).toBeGreaterThan(0);
    expect(card("Tarek Mansour").textContent).toMatch(/live bus location/i);
  });

  it("polls the bus location every 15 seconds while the run is live", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    expect(server.busRequests()).toHaveLength(1);
    await advanceSeconds(45); // polls at 15, 30 and 45 s
    expect(server.busRequests()).toHaveLength(4);
  });

  it.each([401, 403, 404])("stops polling after a %s (sign-in expired or access revoked)", async status => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.live()), fail(status, status === 401 ? undefined : { detail: "Not yours" }));
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    await advanceSeconds(15);
    expect(within(card("Tarek Mansour")).getByRole("alert")).toBeInTheDocument();
    const afterError = server.busRequests().length;
    expect(afterError).toBe(2);

    await advanceSeconds(60);
    expect(server.busRequests()).toHaveLength(afterError);
  });

  it("shows a loading state with no map and no countdown while the first answer is pending", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, HANG);
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    expect(await within(await screen.findByRole("heading", { level: 2, name: /bus tracking for/i }).then(h => h.parentElement as HTMLElement)).findByText(/loading bus location/i)).toBeInTheDocument();
    expect(map()).not.toBeInTheDocument();
    expect(timer()).not.toBeInTheDocument();
  });

  it.each([
    ["a 500", fail(500, { detail: "java.lang.NullPointerException at RunService" })],
    ["a network failure", NETWORK],
  ])("shows a generic error after %s, then Retry recovers to the live bus", async (_name, failure) => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, failure, ok(samples.live()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/NullPointer|RunService|Failed to fetch/);
    expect(map()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("timer")).toHaveTextContent(expected.live.countdown);
    expect(map()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SCRUM-279 AC7: an afternoon run never shows morning wording", () => {
  // Sample Tarek keeps his morning expectedPickupTime 07:21; the afternoon run must not show it.
  const afternoonTarek = () => waitingTarek({ direction: "AFTERNOON", stopsLeft: 3 });
  const morningLeak = (text: string) => /morning/i.test(text) || text.includes("07:21");

  it("shows the afternoon countdown (7m 50s, arriving 14:38) and no morning wording or time (sample bus-location-afternoon)", async () => {
    serve({ children: [afternoonTarek()] });
    server.busLocation(TAREK_ID, ok(samples.afternoon()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    expect(await screen.findByRole("timer")).toHaveTextContent(expected.afternoon.countdown);
    expect(card("Tarek Mansour").querySelector(`time[datetime="${expected.afternoon.arrivesAt}"]`)).toHaveTextContent(expected.afternoon.arrivesSchoolTime);
    expect(card("Tarek Mansour").textContent).toContain(expected.afternoon.coordinates);
    expect(morningLeak(card("Tarek Mansour").textContent ?? "")).toBe(false);
  });

  it("shows no morning wording or time while the afternoon location is loading", async () => {
    serve({ children: [afternoonTarek()] });
    server.busLocation(TAREK_ID, HANG);
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await within(await screen.findByRole("heading", { level: 2, name: /bus tracking for/i }).then(h => h.parentElement as HTMLElement)).findByText(/loading bus location/i);
    expect(card("Tarek Mansour").textContent).not.toMatch(/morning/i);
    expect(card("Tarek Mansour").textContent).not.toContain("07:21");
  });

  it("shows no morning wording or time after an afternoon load error", async () => {
    serve({ children: [afternoonTarek()] });
    server.busLocation(TAREK_ID, fail(500));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await screen.findByRole("alert");
    expect(card("Tarek Mansour").textContent).not.toMatch(/morning/i);
    expect(card("Tarek Mansour").textContent).not.toContain("07:21");
  });

  it("shows no morning wording or time when the afternoon GPS is unavailable", async () => {
    serve({ children: [afternoonTarek()] });
    server.busLocation(TAREK_ID, ok(busLocation(samples.unavailable(), { stopsLeft: 3, plannedTime: null })));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await within(await screen.findByRole("heading", { level: 2, name: /bus tracking for/i }).then(h => h.parentElement as HTMLElement)).findByText(/location is unavailable/i);
    expect(morningLeak(card("Tarek Mansour").textContent ?? "")).toBe(false);
  });
});

describe("SCRUM-279 AC8: navigation is preserved", () => {
  it("goes to Inbox and back without re-authenticating, stops polling while away and resumes on return", async () => {
    serve({ children: [waitingTarek()], inbox: [samples.inboxUnread()] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    installGpsClock();
    await openPageOnClock();
    await openTracking();
    expect(screen.getByRole("button", { name: "Bus tracking" })).toHaveAttribute("aria-current", "page");
    expect(server.busRequests()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "Transport updates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inbox" })).toHaveAttribute("aria-current", "page");
    expect(map()).not.toBeInTheDocument();
    await advanceSeconds(60);
    expect(server.busRequests()).toHaveLength(1);

    await openTracking();
    expect(screen.getByRole("heading", { level: 1, name: "Bus tracking" })).toBeInTheDocument();
    expect(server.busRequests()).toHaveLength(2);
    expect(timer()).toHaveTextContent(expected.live.countdown);
    expect(server.requests("/api/auth/me")).toHaveLength(1);
    expect(screen.getByRole("navigation", { name: "Parent navigation" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Parent navigation" })).getByRole("link", { name: /my children/i })).toHaveAttribute("href", "/parent");
  });

  it("goes from tracking to My children and to Absences, stopping the tracking poll", async () => {
    serve({ children: [waitingTarek()] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    installGpsClock();
    await openPageOnClock();
    await openTracking();

    fireEvent.click(screen.getByRole("button", { name: "My children" }));
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "My children" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tarek Mansour" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Absences" }));
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "Absences" })).toBeInTheDocument();
    await advanceSeconds(45);
    expect(server.busRequests()).toHaveLength(1);
    expect(server.requests("/api/auth/me")).toHaveLength(1);
  });

  it("after a reload (remount) against the same server, the started run is shown live (positive control for the in-screen case)", async () => {
    serve({ children: [waitingTarek({ state: "NOT_STARTED", stopsLeft: null })] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await screen.findByText(/not started/i);
    cleanup(); // the parent reloads

    server.state.children = [waitingTarek()];
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    expect(await screen.findByRole("timer")).toHaveTextContent(expected.live.countdown);
    expect(server.requests("/api/auth/me")).toHaveLength(2);
  });
});

describe("SCRUM-279 AC9: a 360px-appropriate structure (as far as jsdom can check)", () => {
  const px = (value: string) => (/^(\d+(?:\.\d+)?)px$/.exec(value.trim()) ? Number.parseFloat(value) : null);

  it("gives every control on the tracking screen a 44px tap target, in the unavailable and the signed-out states", async () => {
    for (const [reply, control] of [[ok(samples.unavailable()), "button"], [fail(401), "link"]] as const) {
      serve({ children: [waitingTarek({ stopsLeft: 1 }), waitingSami()] });
      server.busLocation(TAREK_ID, reply);
      await openPage();
      fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
      await within(await screen.findByRole("heading", { level: 2, name: /bus tracking for/i }).then(h => h.parentElement as HTMLElement)).findByRole(control);
      const controls = [...screen.getByRole("main").querySelectorAll<HTMLElement>("button, a[href], select, input")];
      expect(controls.length).toBeGreaterThan(3);
      for (const control of controls) expect({ control: control.textContent, minHeight: control.style.minHeight }).toEqual({ control: control.textContent, minHeight: "44px" });
      cleanup();
    }
  });

  it("sets no fixed width wider than 360px anywhere on the live tracking screen, and the child selector fills the width", async () => {
    serve({ children: [waitingTarek(), waitingSami()] });
    server.busLocation(TAREK_ID, ok(samples.live()));
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: "Bus tracking" }));
    await screen.findByRole("timer");
    const tooWide = [...document.body.querySelectorAll<HTMLElement>("*")].filter(element =>
      [element.style.width, element.style.minWidth, element.style.flexBasis].some(value => (px(value) ?? 0) > 360));
    expect(tooWide.map(element => element.outerHTML.slice(0, 80))).toEqual([]);
    expect(screen.getByRole("combobox", { name: /choose child for bus tracking/i }).className).toMatch(/\bw-full\b/);
    expect(screen.getByRole("main").className).toMatch(/\bmin-w-0\b/);
  });
});
