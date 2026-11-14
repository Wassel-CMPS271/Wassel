import { expect, test, type APIResponse, type Response as BrowserResponse, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { credentials, signIn } from "./auth-helpers";
import type { InboxEvent } from "../src/lib/api/parentInbox";
async function json<T>(r: APIResponse | BrowserResponse, status = 200): Promise<T> { expect(r.status(), await r.text()).toBe(status); return r.json(); }
const log = () => readFileSync(resolve("e2e-artifacts/backend.log"), "utf8");
function mail(email: string, offset: number): string {
  for (const line of log().slice(offset).split(/\r?\n/).toReversed()) {
    try { const message = JSON.parse(line).message as string; if (message?.startsWith(`Email to ${email} |`)) return message; } catch { /* JVM startup output */ }
  }
  return "";
}
async function signInOther(page: Page, email: string) {
  const offset = log().length;
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(credentials().password);
  const login = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/login"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); expect((await login).status()).toBe(204);
  let code = ""; await expect.poll(() => { code = mail(email, offset).match(/Your verification code is (\d{6})\./)?.[1] ?? ""; return code.length; }).toBe(6);
  await page.getByLabel("Verification code").fill(code); const verified = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/2fa/verify"); await page.getByRole("button", { name: "Verify", exact: true }).click(); expect((await verified).status()).toBe(200); await expect(page).toHaveURL(/\/parent$/);
  expect((await json<{ role: string }>(await page.request.get("/api/auth/me"))).role).toBe("PARENT");
}
// All responses come from actual Spring endpoints. Offline mode injects a real
// network interruption; no business response, login, receipt or event is mocked.
test("real Parent Inbox: confirmations, receipts, ownership, retry, account reset and 360px", async ({ browser }) => {
  test.setTimeout(180_000);
  const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:4180";
  const parent = await browser.newPage({ baseURL, viewport: { width: 360, height: 800 } });
  const head = await browser.newPage({ baseURL }); const driver = await browser.newPage({ baseURL }); const other = await browser.newPage({ baseURL });
  let routeId: string | undefined; let otherId: string | undefined; const crashes: string[] = [], preferenceCalls: string[] = [];
  parent.on("pageerror", e => crashes.push(e.message)); parent.on("request", r => { if (r.url().includes("notification-preferences")) preferenceCalls.push(r.url()); });
  const routes = "/api/head-of-transport/routes"; const inbox = "/api/parent/inbox";
  const open = async () => { await parent.getByRole("button", { name: "Inbox", exact: true }).click(); await expect(parent.getByRole("heading", { name: "Transport updates", level: 2, exact: true })).toBeVisible(); };
  const row = (name: string) => parent.getByRole("listitem").filter({ has: parent.getByRole("heading", { name, exact: true }) });
  try {
    await signIn(parent, "PARENT"); const original = await json<{ id: string }>(await parent.request.get("/api/auth/me")); await open();
    await expect(parent.getByText("No transport updates yet.")).toBeVisible(); await expect(parent.getByText("0 unread updates")).toBeVisible();
    await expect(parent.getByText("Preferences and late alerts are not available yet.")).toBeVisible();
    const children = await json<{ studentId: string; firstName: string; lastName: string }[]>(await parent.request.get("/api/parent/children")); expect(children).toHaveLength(2);
    await signIn(head, "HEAD_OF_TRANSPORT");
    const students = await json<{ id: string; parentUserId: string | null }[]>(await head.request.get("/api/head-of-transport/students")); const foreign = students.find(s => !children.some(c => c.studentId === s.id))!; expect(foreign).toBeTruthy();
    const email = `inbox-other-${randomUUID()}@e2e.invalid`; const offset = log().length;
    const second = await json<{ id: string }>(await head.request.post("/api/head-of-transport/parents", { data: { email } }), 201); otherId = second.id;
    let token = ""; await expect.poll(() => { token = mail(email, offset).match(/token=([^\s&]+)/)?.[1] ?? ""; return token.length > 20; }).toBe(true);
    expect((await other.request.post("/api/auth/password", { data: { token, password: credentials().password } })).status()).toBe(204); await signInOther(other, email);
    await json(await head.request.patch(`/api/head-of-transport/students/${foreign.id}/parent`, { data: { parentUserId: otherId } }));
    const drivers = await json<{ id: string; email: string; assignedVehicleId: string }[]>(await head.request.get("/api/head-of-transport/drivers")); const account = drivers.find(d => d.email === credentials().accounts.DRIVER)!; expect(account).toBeTruthy();
    routeId = (await json<{ id: string }>(await head.request.post(routes, { data: { name: "Independent real Inbox review", driverId: account.id, vehicleId: account.assignedVehicleId } }), 201)).id;
    for (const id of [...children.map(c => c.studentId), foreign.id]) await json(await head.request.post(`${routes}/${routeId}/students`, { data: { studentId: id } }));
    await signIn(driver, "DRIVER"); const day = await json<{ date: string; runs: { id: string; route: { id: string }; direction: string }[] }>(await driver.request.get("/api/driver/runs/today")); expect(day.date).toBe("2026-11-02");
    const run = day.runs.find(r => r.route.id === routeId && r.direction === "MORNING")!; expect(run).toBeTruthy(); const runPath = `/api/driver/runs/${run.id}`; await json(await driver.request.post(`${runPath}/start`));
    const confirm = async (id: string, status: string) => json(await driver.request.put(`${runPath}/students/${id}/confirmation`, { data: { status } }));
    await confirm(children[0].studentId, "PICKED_UP"); await confirm(children[0].studentId, "DROPPED_OFF"); await confirm(children[1].studentId, "NOT_PRESENT"); await confirm(foreign.id, "PICKED_UP"); await confirm(children[1].studentId, "NOT_PRESENT");
    const entries = await json<InboxEvent[]>(await parent.request.get(inbox)); expect(entries).toHaveLength(3); expect(new Set(entries.map(e => e.type))).toEqual(new Set(["PICKED_UP", "DROPPED_OFF", "NOT_PRESENT"]));
    const foreignEvents = await json<InboxEvent[]>(await other.request.get(inbox)); expect(foreignEvents).toHaveLength(1); expect(foreignEvents[0].studentId).toBe(foreign.id);
    expect((await parent.request.post(`${inbox}/${foreignEvents[0].id}/read`)).status()).toBe(404); expect((await other.request.post(`${inbox}/${entries[0].id}/read`)).status()).toBe(404);
    await parent.getByRole("button", { name: "Refresh inbox", exact: true }).click(); await expect(parent.getByText("3 unread updates")).toBeVisible();
    const name0 = `${children[0].firstName} ${children[0].lastName}`, name1 = `${children[1].firstName} ${children[1].lastName}`;
    await expect(row(`${name1}: Not at the stop`)).toBeVisible(); const picked = entries.find(e => e.studentId === children[0].studentId && e.type === "PICKED_UP")!;
    const receipt = parent.waitForResponse(r => new URL(r.url()).pathname === `${inbox}/${picked.id}/read` && r.request().method() === "POST");
    await row(`${name0}: Picked up`).getByRole("button").click(); const read = await json<InboxEvent>(await receipt); expect(read.id).toBe(picked.id); expect(read.readAt).not.toBeNull(); await expect(parent.getByText("2 unread updates")).toBeVisible();
    expect((await json<InboxEvent>(await parent.request.post(`${inbox}/${picked.id}/read`))).readAt).toBe(read.readAt);
    await parent.reload(); await open(); await expect(row(`${name0}: Picked up`).getByText("Read", { exact: true })).toBeVisible(); await expect(parent.getByText("2 unread updates")).toBeVisible();
    await parent.getByLabel("Unread only").check(); await expect(row(`${name0}: Picked up`)).toHaveCount(0); await expect(row(`${name0}: Dropped off`)).toBeVisible();
    const all = parent.waitForResponse(r => new URL(r.url()).pathname === `${inbox}/read-all` && r.request().method() === "POST"); await parent.getByRole("button", { name: "Mark all as read", exact: true }).click(); expect((await all).status()).toBe(204); await expect(parent.getByText("No unread updates.")).toBeVisible(); await expect(parent.getByText("0 unread updates")).toBeVisible();
    expect((await other.request.get(`${inbox}/unread-count`)).status()).toBe(200); expect(await json(await other.request.get(`${inbox}/unread-count`))).toEqual({ count: 1 });
    await parent.getByLabel("Unread only").uncheck(); await expect(row(`${name0}: Dropped off`)).toBeVisible();
    await parent.context().setOffline(true); await parent.getByRole("button", { name: "Refresh inbox", exact: true }).click(); await expect(parent.getByRole("alert").filter({ hasText: "Could not update the inbox" })).toBeVisible(); await expect(row(`${name0}: Dropped off`)).toHaveCount(0);
    await parent.context().setOffline(false); await parent.getByRole("button", { name: "Refresh inbox", exact: true }).click(); await expect(row(`${name0}: Dropped off`)).toBeVisible();
    for (const child of children) await json(await head.request.patch(`/api/head-of-transport/students/${child.studentId}/parent`, { data: { parentUserId: otherId } }));
    await confirm(children[1].studentId, "PICKED_UP"); expect(await json(await parent.request.get(`${inbox}/unread-count`))).toEqual({ count: 0 }); expect(await json(await other.request.get(`${inbox}/unread-count`))).toEqual({ count: 2 });
    await parent.getByRole("button", { name: "My children", exact: true }).click(); await parent.getByRole("button", { name: "Refresh transport details" }).click(); await expect(parent.getByText("No children linked yet")).toBeVisible(); await open(); await expect(row(`${name0}: Dropped off`)).toBeVisible();
    const width = await parent.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth })); expect(width.width).toBeLessThanOrEqual(width.viewport);
    for (const button of await parent.getByRole("region", { name: "Parent inbox" }).getByRole("button").all()) { const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); }
    await parent.screenshot({ path: "e2e-artifacts/parent-inbox-real-360.png", fullPage: true });
    await parent.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(parent).toHaveURL(/\/login$/); await signInOther(parent, email); await open(); await expect(parent.getByText("2 unread updates")).toBeVisible(); await expect(row(`${name0}: Dropped off`)).toHaveCount(0); await expect(row(`${name1}: Not at the stop`)).toHaveCount(0); await expect(row(`${name1}: Picked up`)).toBeVisible();
    expect((await head.request.get(inbox)).status()).toBe(403); expect((await driver.request.post(`${inbox}/read-all`)).status()).toBe(403); const signedOut = await browser.newContext({ baseURL }); expect((await signedOut.request.get(inbox)).status()).toBe(401); await signedOut.close();
    expect((await head.request.patch(`/api/head-of-transport/parents/${otherId}/revoke`)).status()).toBe(200); await parent.getByRole("button", { name: "Refresh inbox", exact: true }).click(); await expect(parent.getByRole("link", { name: "Sign in", exact: true })).toBeVisible(); await expect(row(`${name1}: Picked up`)).toHaveCount(0);
    expect(preferenceCalls).toEqual([]); expect(crashes).toEqual([]);
    // Restore the isolated demo links through real APIs; no production data is touched.
    for (const child of children) await json(await head.request.patch(`/api/head-of-transport/students/${child.studentId}/parent`, { data: { parentUserId: original.id } }));
    console.log("PASS real Inbox: PostgreSQL/Flyway, ticking test Monday, real password+2FA, three confirmation types/deduplication, accurate counts, read/read-all/reload, foreign-parent 404, role 401/403, historical ownership, offline retry, logout/account reset, revocation and 360px. No preference or late API enabled.");
  } finally {
    await parent.context().setOffline(false);
    if (otherId) expect((await head.request.patch(`/api/head-of-transport/parents/${otherId}/restore`)).status()).toBe(200);
    if (routeId) expect((await head.request.delete(`${routes}/${routeId}`)).status()).toBe(204);
    await Promise.all([parent.close(), head.close(), driver.close(), other.close()]);
  }
});
