import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Role = "ADMIN" | "HEAD_OF_TRANSPORT" | "DRIVER" | "PARENT";
export const homes: Record<Role, string> = { ADMIN: "/admin", HEAD_OF_TRANSPORT: "/head-of-transport", DRIVER: "/driver", PARENT: "/parent" };
export function credentials() {
  return JSON.parse(readFileSync(resolve("e2e-artifacts/credentials.json"), "utf8")) as { password: string; accounts: Record<Role, string> };
}
export async function passwordStep(page: Page, role: Role) {
  const data = credentials();
  const offset = readFileSync(resolve("e2e-artifacts/backend.log"), "utf8").length;
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(data.accounts[role]);
  await page.getByLabel("Password", { exact: true }).fill(data.password);
  const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(204);
  await expect(page).toHaveURL(/\/verify-2fa$/);
  const cookies = await page.context().cookies();
  expect(cookies.find(c => c.name === "wassel_2fa")?.httpOnly).toBe(true);
  expect(cookies.find(c => c.name === "wassel_2fa")?.sameSite).toBe("Strict");
  expect(cookies.some(c => c.name === "wassel_token")).toBe(false);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  let code = "";
  await expect.poll(() => {
    const lines = readFileSync(resolve("e2e-artifacts/backend.log"), "utf8").slice(offset).split(/\r?\n/);
    for (const line of lines.toReversed()) {
      try {
        const message = JSON.parse(line).message as string;
        if (message?.includes(`Email to ${data.accounts[role]} | Your Wassel verification code`)) {
          code = message.match(/Your verification code is (\d{6})\./)?.[1] ?? "";
          return code.length === 6;
        }
      } catch { /* Non-JSON JVM startup output is not a mail event. */ }
    }
    return false;
  }, { message: "Read this login's code from the isolated LoggingMailer log" }).toBe(true);
  return code;
}
export async function verifyStep(page: Page, role: Role, code: string) {
  await page.getByLabel("Verification code").fill(code);
  const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/2fa/verify" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`${homes[role]}$`));
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).role).toBe(role);
  const cookies = await page.context().cookies();
  expect(cookies.find(c => c.name === "wassel_token")?.httpOnly).toBe(true);
  expect(cookies.find(c => c.name === "wassel_token")?.sameSite).toBe("Strict");
  expect(cookies.some(c => c.name === "wassel_2fa")).toBe(false);
  await expect(page.getByRole("main")).toBeVisible();
}
export async function signIn(page: Page, role: Role) { await verifyStep(page, role, await passwordStep(page, role)); }
