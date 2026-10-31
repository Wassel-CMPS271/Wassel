import { test, expect } from "@playwright/test";
import { credentials, homes, passwordStep, signIn, verifyStep, type Role } from "./auth-helpers";

// Real browser, production frontend, Spring security, password/2FA services,
// demo/admin seeders and PostgreSQL. No request interception or fake tokens.
for (const role of ["ADMIN", "HEAD_OF_TRANSPORT", "DRIVER", "PARENT"] as Role[]) {
  test(`${role}: password + real emailed code -> own home; logout invalidates browser access`, async ({ page }) => {
    await signIn(page, role);
    await expect(page).toHaveURL(new RegExp(`${homes[role]}$`));
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
    await page.goto(homes[role]);
    await expect(page).toHaveURL(/\/login$/);
  });
}

test("wrong password is rejected without a pending login or session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(credentials().accounts.PARENT);
  await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-generated-password");
  const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(401);
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toHaveText("Invalid email or password.");
  expect((await page.context().cookies()).some(c => ["wassel_token", "wassel_2fa"].includes(c.name))).toBe(false);
});

test("wrong verification code is rejected, then the real code succeeds", async ({ page }) => {
  const correct = await passwordStep(page, "HEAD_OF_TRANSPORT");
  await page.getByLabel("Verification code").fill(correct === "000000" ? "000001" : "000000");
  const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/2fa/verify" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  expect((await response).status()).toBe(400);
  await expect(page.getByText("That code is incorrect or has expired.", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await verifyStep(page, "HEAD_OF_TRANSPORT", correct);
});

test("a Parent cannot open the Admin home after authentication", async ({ page }) => {
  await signIn(page, "PARENT");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/parent$/);
  expect((await page.request.get("/api/admin/school-settings/times")).status()).toBe(403);
});
