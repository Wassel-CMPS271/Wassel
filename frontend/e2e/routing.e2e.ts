import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Proposal, Route, Stop } from "../src/lib/api/routes";

const root = "/api/head-of-transport/routes";
const fullName = (s: Stop) => `${s.firstName} ${s.lastName}`;
const stopIds = (route: Route) => route.stops.map(s => s.studentId);
async function responseFor(page: Page, method: string, path: string, action: () => Promise<void>, status: number) {
  const pending = page.waitForResponse(r => r.request().method() === method && new URL(r.url()).pathname === path, { timeout: 20_000 });
  await action();
  const response = await pending;
  const detail = response.status() === status ? "" : await response.text().catch(() => "Response body unavailable after navigation");
  expect(response.status(), `${method} ${path}: ${detail}`).toBe(status);
  return response;
}
async function savedRoute(page: Page, id: string): Promise<Route> {
  const response = await page.request.get(`${root}/${id}`);
  expect(response.status(), "Authenticated backend route reload must succeed").toBe(200);
  return response.json();
}

// No mocked API, optimizer, authentication or map. The dedicated stack is owned
// by e2e/run.mjs and is never reused from an arbitrary external base URL.
test("Head of Transportation creates, assigns, optimizes, applies and reloads the mapped route", async ({ page, context }) => {
  const crashes: string[] = [];
  const badApi: string[] = [];
  page.on("pageerror", e => crashes.push(e.message));
  page.on("response", r => {
    if (new URL(r.url()).pathname.startsWith("/api/") && r.status() >= 400) badApi.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  let id: string | undefined;
  try {
    await test.step("Sign in through the real password and emailed-code flow", async () => {
      const credentials = JSON.parse(readFileSync(resolve("e2e-artifacts/credentials.json"), "utf8"));
      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill(credentials.email);
      await page.getByLabel("Password", { exact: true }).fill(credentials.password);
      await responseFor(page, "POST", "/api/auth/login", () => page.getByRole("button", { name: "Sign in", exact: true }).click(), 204);
      await expect(page).toHaveURL(/\/verify-2fa$/);
      const pending = (await context.cookies()).find(c => c.name === "wassel_2fa");
      expect(pending?.httpOnly, "Password step must set a pending HttpOnly cookie").toBe(true);
      expect((await context.cookies()).some(c => c.name === "wassel_token")).toBe(false);
      let code: string | undefined;
      await expect.poll(() => {
        const lines = readFileSync(resolve("e2e-artifacts/backend.log"), "utf8").split(/\r?\n/);
        for (const line of lines.toReversed()) {
          try {
            const message = JSON.parse(line).message as string;
            if (message?.includes(`Email to ${credentials.email} | Your Wassel verification code`)) {
              code = message.match(/Your verification code is (\d{6})\./)?.[1];
              return Boolean(code);
            }
          } catch { /* Startup lines need not be structured JSON. */ }
        }
        return false;
      }, { message: "The local LoggingMailer must emit a real six-digit 2FA code" }).toBe(true);
      await page.getByLabel("Verification code").fill(code!);
      await responseFor(page, "POST", "/api/auth/2fa/verify", () => page.getByRole("button", { name: "Verify", exact: true }).click(), 200);
      await expect(page).toHaveURL(/\/head-of-transport$/);
      expect((await context.cookies()).find(c => c.name === "wassel_token")?.httpOnly).toBe(true);
      const me = await page.request.get("/api/auth/me");
      expect(me.status()).toBe(200);
      expect((await me.json()).role).toBe("HEAD_OF_TRANSPORT");
    });
    await test.step("Create a route from the real fleet and verify persistence", async () => {
      await page.getByRole("link", { name: "Routes", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Routes", exact: true })).toBeVisible();
      await expect(page.getByText("No routes yet", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Create route", exact: true }).click();
      const form = page.getByRole("dialog", { name: "Create route" });
      await form.getByLabel("Name", { exact: true }).fill("SCRUM-230 morning");
      await form.getByLabel("Vehicle", { exact: true }).selectOption({ label: "E2E 230" });
      await form.getByLabel("Driver", { exact: true }).selectOption({ label: "E2E Driver" });
      const created = await responseFor(page, "POST", root,
        () => form.getByRole("button", { name: "Create route", exact: true }).click(), 201);
      const route: Route = await created.json(); id = route.id;
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      expect((await savedRoute(page, id!)).name).toBe("SCRUM-230 morning");
      await page.getByRole("link", { name: "SCRUM-230 morning", exact: true }).click();
      await expect(page.getByRole("heading", { name: "SCRUM-230 morning", exact: true })).toBeVisible();
    });
    const path = `${root}/${id}`;
    await test.step("Assign three seeded students and verify seats and committed assignments", async () => {
      for (const [i, name] of ["Alpha E2E", "Bravo E2E", "Charlie E2E"].entries()) {
        const waiting = page.getByRole("region", { name: "Not on a route", exact: true });
        const row = waiting.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
        const assigned = await responseFor(page, "POST", `${path}/students`, () => row.getByRole("button", { name: "Add", exact: true }).click(), 200);
        expect((await assigned.json()).studentCount).toBe(i + 1);
        await expect(page.getByText(`${i + 1} of 14 seats`, { exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "On this route", exact: true }).getByText(name, { exact: true })).toBeVisible();
      }
      const saved = await savedRoute(page, id!);
      expect(saved.stops.map(fullName)).toEqual(["Alpha E2E", "Bravo E2E", "Charlie E2E"]);
      expect(saved.studentCount).toBe(3); expect(saved.seatsLeft).toBe(11); expect(saved.vehicle.capacity).toBe(14);
    });
    const before = await savedRoute(page, id!);
    let proposal: Proposal;
    await test.step("Preview the actual optimizer result without persisting its order", async () => {
      const response = await responseFor(page, "POST", `${path}/optimization`,
        () => page.getByRole("button", { name: "Optimize", exact: true }).click(), 201);
      proposal = await response.json();
      expect(proposal.feasible).toBe(true); expect(proposal.id).toBeTruthy(); expect(proposal.reasons).toEqual([]);
      expect(proposal.current.drivingMinutes).toBe(13); expect(proposal.proposed!.drivingMinutes).toBe(9);
      expect(proposal.proposed!.stops.map(fullName)).toEqual(["Alpha E2E", "Charlie E2E", "Bravo E2E"]);
      expect(proposal.proposed!.stops.map(s => s.arrivalTime)).toEqual(["07:51", "07:54", "07:57"]);
      expect(stopIds(await savedRoute(page, id!))).toEqual(stopIds(before));
      await expect(page.getByRole("region", { name: "On this route", exact: true }).getByRole("listitem")).toHaveCount(3);
      for (const [name, stops] of [["Current order", proposal.current.stops], ["Proposed order", proposal.proposed!.stops]] as const) {
        const column = page.getByRole("region", { name, exact: true });
        const items = column.getByRole("listitem");
        await expect(items).toHaveCount(3);
        for (const [i, stop] of stops.entries()) {
          await expect(items.nth(i)).toContainText(fullName(stop));
          await expect(items.nth(i)).toContainText(stop.arrivalTime!);
        }
      }
      await expect(page.getByRole("region", { name: "Optimization proposal" }).getByText("Saves 4 min", { exact: true })).toBeVisible();
    });
    await test.step("Apply and reload the committed optimizer order", async () => {
      // Optional deliberate fault: verifies the runner exits nonzero and captures
      // diagnostics if a routing step breaks. Normal/CI runs never intercept APIs.
      if (process.env.E2E_FAILURE_PROBE === "apply") await page.route(`**${path}/optimization/*/apply`, route => route.abort("failed"));
      const response = await responseFor(page, "POST", `${path}/optimization/${proposal!.id}/apply`,
        () => page.getByRole("button", { name: "Apply", exact: true }).click(), 200);
      const applied: Route = await response.json();
      expect(stopIds(applied)).toEqual(proposal!.proposed!.stops.map(s => s.studentId));
      await page.reload();
      expect(stopIds(await savedRoute(page, id!))).toEqual(stopIds(applied));
      const rows = page.getByRole("region", { name: "On this route", exact: true }).getByRole("listitem");
      await expect(rows).toHaveCount(3);
      for (const [i, s] of applied.stops.entries()) await expect(rows.nth(i)).toContainText(fullName(s));
    });
    await test.step("Verify real Leaflet school, numbered markers, popups and route line", async () => {
      const saved = await savedRoute(page, id!);
      const map = page.getByRole("region", { name: "Map of SCRUM-230 morning", exact: true });
      await expect(map.getByText("Loading map", { exact: true })).toHaveCount(0);
      await expect(map.getByRole("button", { name: "School", exact: true })).toBeVisible();
      for (const stop of saved.stops) {
        const marker = map.getByRole("button", { name: `Stop ${stop.position}: ${fullName(stop)}`, exact: true });
        await expect(marker).toBeVisible();
        await expect(marker).toHaveText(String(stop.position));
        await marker.click();
        const popup = map.locator(".leaflet-popup-content");
        await expect(popup).toContainText(fullName(stop));
        await expect(popup).toContainText(`Arrives ${stop.arrivalTime}`);
        await map.getByRole("button", { name: "Close popup" }).click();
      }
      const line = map.locator(".leaflet-overlay-pane svg path");
      await expect(line).toHaveCount(1);
      await expect(map.locator(".leaflet-overlay-pane svg")).toBeVisible();
      // The deterministic meridian path has zero bounding-box width. Verify
      // its painted geometry rather than Playwright's nonzero-box visibility.
      expect(await line.evaluate(element => {
        const path = element as SVGPathElement;
        const box = path.getBBox();
        const style = getComputedStyle(path);
        return (box.width > 0 || box.height > 0) && style.visibility === "visible"
          && style.display !== "none" && Number(style.strokeOpacity) > 0;
      }), "The real route line must have visible painted geometry").toBe(true);
      await expect(line).toHaveAttribute("d", /^M.+L/);
      await map.getByRole("button", { name: "School", exact: true }).click();
      await expect(map.locator(".leaflet-popup-content")).toContainText("Arrival 08:00");
      expect(crashes, "No browser rendering errors").toEqual([]);
      expect(badApi, "No blocking API failures").toEqual([]);
    });
  } finally {
    // The DB is disposable; delete the route as well so a failed assertion does
    // not leave assignments around during diagnosis. This is a real API call.
    if (id) {
      const removed = await page.request.delete(`${root}/${id}`);
      expect(removed.status(), "Cleanup must release the test route").toBe(204);
      const remaining = await page.request.get(root);
      expect(remaining.status()).toBe(200);
      expect(await remaining.json(), "Cleanup must leave no routes").toEqual([]);
      const roster = await page.request.get("/api/head-of-transport/students");
      expect(roster.status()).toBe(200);
      const students = await roster.json() as { route: string | null }[];
      expect(students).toHaveLength(3);
      expect(students.every(student => student.route === null), "Cleanup must release every student assignment").toBe(true);
    }
  }
});
