import { test, expect } from "@playwright/test";
import { credentials, signIn } from "./auth-helpers";

// Explicit dependency gate. npm run test:e2e -- --revocation enables these
// against the actual SCRUM-98 endpoints; no test mutates enabled in SQL or adds
// a test-only revocation API. They remain visible pending cases until #95 lands.
test.skip(process.env.E2E_AUTH_REVOCATION !== "true", "SCRUM-98/#95 is unmerged; revocation is not verified");

test("a genuinely revoked Parent cannot sign in", async ({ browser }) => {
  const head = await browser.newPage(); const parent = await browser.newPage();
  try {
    await signIn(head, "HEAD_OF_TRANSPORT");
    const list = await head.request.get("/api/head-of-transport/parents");
    expect(list.status()).toBe(200);
    const account = (await list.json()).find((p: { email: string }) => p.email === credentials().accounts.PARENT);
    expect(account?.id).toBeTruthy();
    expect((await head.request.patch(`/api/head-of-transport/parents/${account.id}/revoke`)).ok()).toBe(true);
    try {
      await parent.goto("/login");
      await parent.getByLabel("Email", { exact: true }).fill(credentials().accounts.PARENT);
      await parent.getByLabel("Password", { exact: true }).fill(credentials().password);
      const denied = parent.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/login");
      await parent.getByRole("button", { name: "Sign in", exact: true }).click();
      expect((await denied).status()).toBe(401);
      await expect(parent.getByRole("alert").filter({ hasText: "Invalid email or password." })).toHaveText("Invalid email or password.");
    } finally { expect((await head.request.patch(`/api/head-of-transport/parents/${account.id}/restore`)).ok()).toBe(true); }
  } finally { await head.close(); await parent.close(); }
});

test("revocation rejects a previously valid session on its next request", async ({ browser }) => {
  const head = await browser.newPage(); const parent = await browser.newPage();
  try {
    await signIn(head, "HEAD_OF_TRANSPORT"); await signIn(parent, "PARENT");
    const list = await head.request.get("/api/head-of-transport/parents");
    expect(list.status()).toBe(200);
    const account = (await list.json()).find((p: { email: string }) => p.email === credentials().accounts.PARENT);
    expect(account?.id).toBeTruthy();
    expect((await parent.request.get("/api/auth/me")).status()).toBe(200);
    expect((await head.request.patch(`/api/head-of-transport/parents/${account.id}/revoke`)).ok()).toBe(true);
    try {
      expect((await parent.request.get("/api/auth/me")).status()).toBe(401);
      await parent.reload(); await expect(parent).toHaveURL(/\/login$/);
    } finally { expect((await head.request.patch(`/api/head-of-transport/parents/${account.id}/restore`)).ok()).toBe(true); }
  } finally { await head.close(); await parent.close(); }
});
