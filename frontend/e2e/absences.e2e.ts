import { test, expect, type APIResponse, type Response as BrowserResponse } from "@playwright/test";
import { credentials, signIn } from "./auth-helpers";
import type { Child } from "../src/lib/api/myChildren";
import type { Absence } from "../src/lib/api/absences";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:4180";
async function json(response: APIResponse | BrowserResponse, status = 200) {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

// SCRUM-249: real password/2FA, frontend, Spring and disposable PostgreSQL/Flyway.
// No intercepted responses, mock session or production demo adapter.
test("parent reports, persists and cancels absences with ownership and mobile checks", async ({ browser }) => {
    const head = await browser.newPage({ baseURL: base }); const parent = await browser.newPage({ baseURL: base, viewport: { width: 360, height: 800 } });
    const crashes: string[] = []; parent.on('pageerror', error => crashes.push(error.message));
    await signIn(head, "HEAD_OF_TRANSPORT"); await signIn(parent, "PARENT");
    const children: Child[] = await json(await parent.request.get(`${base}/api/parent/children`));
    const child = children[0], other = children[1], fullName = `${child.firstName} ${child.lastName}`;
    const endpoint = `${base}/api/parent/children/${child.studentId}/absences`;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(new Date());
    const offsetDate = (days: number) => { const value = new Date(`${today}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
    const tomorrow = offsetDate(1), rangeFrom = offsetDate(3), rangeTo = offsetDate(5);
    const open = async (name: string) => { await parent.getByRole('button', { name: `Manage absences for ${name}`, exact: true }).click(); await expect(parent.getByRole('heading', { name: 'Upcoming absences', exact: true })).toBeVisible(); };
    await open(fullName); await expect(parent.getByText('No upcoming absences.')).toBeVisible();
    expect(child.route).toBeNull(); // Absence reporting is available without an assignment.
    await expect(parent.getByLabel('Absence date')).toHaveAttribute('min', today);
    let posts = 0, deletes = 0;
    parent.on('request', request => { if (request.url() === endpoint && request.method() === 'POST') posts++; if (request.url().startsWith(endpoint + '/') && request.method() === 'DELETE') deletes++; });
    await parent.getByLabel('Absence date').fill(tomorrow);
    let response = parent.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
    await parent.getByRole('button', { name: 'Report absence', exact: true }).click();
    const single = await json(await response, 201);
    expect(single.fromDate).toBe(tomorrow); expect(single.toDate).toBe(tomorrow);
    await expect(parent.getByText('Absence reported.', { exact: true })).toBeVisible();
    response = parent.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
    await parent.getByRole('button', { name: 'Report absence', exact: true }).click();
    expect((await json(await response)).id).toBe(single.id);
    await expect(parent.getByRole('button', { name: 'Cancel absence', exact: true })).toHaveCount(1);
    await parent.getByLabel('Report a date range').check();
    await parent.getByLabel('Start date', { exact: true }).fill(tomorrow);
    await parent.getByLabel('End date', { exact: true }).fill(offsetDate(2));
    response = parent.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
    await parent.getByRole('button', { name: 'Report absence', exact: true }).click();
    expect((await response).status()).toBe(409);
    await expect(parent.getByText(/Couldn't report the absence/)).toBeVisible();
    expect((await json(await parent.request.get(endpoint))).length).toBe(1);
    await parent.getByLabel('Start date', { exact: true }).fill(rangeFrom);
    await parent.getByLabel('End date', { exact: true }).fill(rangeTo);
    response = parent.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
    await parent.getByRole('button', { name: 'Report absence', exact: true }).click();
    const range = await json(await response, 201);
    expect(range.fromDate).toBe(rangeFrom); expect(range.toDate).toBe(rangeTo);
    await expect(parent.getByRole('button', { name: 'Cancel absence', exact: true })).toHaveCount(2);
    const singleRow = parent.getByRole('listitem').filter({ has: parent.getByText(tomorrow, { exact: true }) });
    await singleRow.getByRole('button', { name: 'Cancel absence', exact: true }).click();
    await expect(singleRow.getByRole('button', { name: 'Confirm cancellation' })).toBeFocused();
    await singleRow.getByRole('button', { name: 'Keep absence' }).click();
    expect(deletes).toBe(0);
    await singleRow.getByRole('button', { name: 'Cancel absence', exact: true }).click();
    await parent.screenshot({ path: "e2e-artifacts/absence-real-360.png", fullPage: true });
    response = parent.waitForResponse(r => r.url() === `${endpoint}/${single.id}` && r.request().method() === 'DELETE');
    await singleRow.getByRole('button', { name: 'Confirm cancellation' }).click();
    expect((await response).status()).toBe(204);
    await expect(parent.getByText('Absence cancelled.', { exact: true })).toBeVisible();
    expect((await json(await parent.request.get(endpoint))).map((a: Absence) => a.id)).toEqual([range.id]);
    // Real persistence, not an optimistic list or fixture response.
    await parent.reload(); await open(fullName);
    await expect(parent.getByText(`${rangeFrom} to ${rangeTo} (inclusive)`, { exact: true })).toBeVisible();
    await parent.getByLabel('Absence date').fill(offsetDate(-1));
    const beforePast = posts;
    await parent.getByRole('button', { name: 'Report absence', exact: true }).click();
    await expect(parent.getByText('Choose today or a future date.')).toBeVisible();
    expect(posts).toBe(beforePast);
    expect((await parent.request.post(endpoint, { data: { fromDate: offsetDate(-1) } })).status()).toBe(400);
    expect((await parent.request.post(endpoint, { data: { fromDate: rangeTo, toDate: rangeFrom } })).status()).toBe(400);
    const roster: { id: string }[] = await json(await head.request.get(`${base}/api/head-of-transport/students`));
    const foreign = roster.find(s => !children.some(c => c.studentId === s.id));
    const foreignPath = `${base}/api/parent/children/${foreign!.id}/absences`;
    expect((await parent.request.get(foreignPath)).status()).toBe(404);
    expect((await parent.request.post(foreignPath, { data: { fromDate: tomorrow } })).status()).toBe(404);
    expect((await parent.request.delete(`${foreignPath}/${range.id}`)).status()).toBe(404);
    await parent.getByRole('button', { name: 'Choose another child / Back to children' }).click();
    await open(`${other.firstName} ${other.lastName}`); await expect(parent.getByText('No upcoming absences.')).toBeVisible();
    await parent.getByRole('button', { name: 'Choose another child / Back to children' }).click(); await open(fullName);
    const parents: { id: string; email: string }[] = await json(await head.request.get(`${base}/api/head-of-transport/parents`));
    const account = parents.find(p => p.email === credentials().accounts.PARENT)!;
    expect((await head.request.patch(`${base}/api/head-of-transport/parents/${account.id}/revoke`)).ok()).toBe(true);
    try {
      await parent.getByLabel('Absence date').fill(offsetDate(8));
      response = parent.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
      await parent.getByRole('button', { name: 'Report absence', exact: true }).click(); expect((await response).status()).toBe(401);
      await expect(parent.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    } finally { expect((await head.request.patch(`${base}/api/head-of-transport/parents/${account.id}/restore`)).ok()).toBe(true); }
    response = parent.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
    await parent.getByRole('button', { name: 'Report absence', exact: true }).click();
    const retried = await json(await response, 201); await expect(parent.getByText('Absence reported.', { exact: true })).toBeVisible();
    expect((await parent.request.delete(`${endpoint}/${retried.id}`)).status()).toBe(204);
    expect((await parent.request.delete(`${endpoint}/${range.id}`)).status()).toBe(204);
    expect(await json(await parent.request.get(endpoint))).toEqual([]);
    const dimensions = await parent.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport); expect(crashes).toEqual([]);
    console.log('PASS real PostgreSQL absences: own unassigned child; single day and inclusive range; idempotent 200; overlap 409; keep/confirm/delete; persistence after reload; client/server past/inverted rejection; foreign GET/POST/DELETE 404; per-child isolation; actual revoked-session 401 and restored retry; cleanup; 360px without overflow or browser crashes.');
 });
