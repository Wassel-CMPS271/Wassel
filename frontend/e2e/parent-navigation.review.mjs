// Fixture-only Chromium UI verification of the production Home/Absences entry.
// This intentionally does not claim GPS, inbox or backend integration.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import assert from "node:assert/strict";
import { createServer } from "node:net";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || "4189");
assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
const base = `http://127.0.0.1:${port}`;
const out = resolve(frontend, "../tmp/parent-navigation-mobile", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(out, { recursive: true });
console.log(`Fixture UI evidence: ${out}`);
// Refuse an occupied port before starting or inspecting any browser page.
await new Promise((done, reject) => {
  const probe = createServer(); probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(done));
});
// The production CSP allows same-origin API calls only. Build the unchanged
// frontend in its real proxy mode; browser routes below supply explicit fixtures.
const buildLog = createWriteStream(resolve(out, "build-proxy.log"));
await new Promise((done, reject) => {
  const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { cwd: frontend, env: { ...process.env, NEXT_PUBLIC_API_BASE_URL: "", BACKEND_URL: "http://127.0.0.1:8080" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  build.stdout.pipe(buildLog, { end: false }); build.stderr.pipe(buildLog, { end: false });
  build.once("error", reject);
  build.once("exit", code => { buildLog.end(); if (code === 0) done(); else reject(new Error(`Proxy-mode production build failed: ${code}`)); });
});
const log = createWriteStream(resolve(out, "frontend.log"));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: frontend, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.pipe(log); server.stderr.pipe(log);
let browser;
let page;
const errors = [], requests = [], consoleErrors = [];
try {
  let ready = false, lastReadiness = "not attempted";
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Owned review server exited; inspect frontend.log");
    try { const response = await fetch(`${base}/login`, { signal: AbortSignal.timeout(2000) }); ready = response.ok; lastReadiness = `HTTP ${response.status}`; } catch (error) { lastReadiness = error.cause?.message || error.message; if (lastReadiness === "bad port") throw new Error(`Port ${port} is restricted by Fetch/Chromium; choose an unused permitted port`); }
    if (ready) break;
    await pause(250);
  }
  assert(ready, `Production frontend readiness: ${lastReadiness}`);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 360, height: 800 }, reducedMotion: "reduce" });
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  const family = JSON.parse(readFileSync(resolve(frontend, "../docs/contracts/samples/runs/parent-children.json"), "utf8"));
  family[0].firstName = "Verylongparentchildname".repeat(3);
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    requests.push({ path, method: request.method() });
    let body, status = 200;
    if (request.method() === "OPTIONS") status = 204;
    else if (path === "/api/auth/me") body = { id: "mobile-parent", schoolId: "mobile-school", role: "PARENT", email: "mobile@test.invalid" };
    else if (path === "/api/parent/children") body = family;
    else if (path.endsWith("/absences")) body = [];
    else throw new Error(`Unexpected fixture request: ${path}`);
    await route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": base, "access-control-allow-credentials": "true", "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" }, body: body === undefined ? undefined : JSON.stringify(body) });
  });
  await page.goto(`${base}/parent`);
  await page.getByRole("region", { name: `${family[1].firstName} ${family[1].lastName}` }).waitFor();
  const nav = page.getByRole("navigation", { name: "Family views" });
  assert.equal(await nav.getByRole("button", { name: "Bus tracking", exact: true }).count(), 1);
  assert(await nav.getByRole("button", { name: "Bus tracking", exact: true }).isEnabled());
  assert.equal(await nav.getByRole("button", { name: "Inbox", exact: true }).count(), 0);
  const homeWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(homeWidth <= 360, "Long child name fits the 360px Home layout");
  await page.screenshot({ path: resolve(out, "home-360.png"), fullPage: true });
  await nav.getByRole("button", { name: "Absences", exact: true }).click();
  const picker = page.getByRole("combobox", { name: "Choose child for absences" });
  await page.getByRole("heading", { name: `Absences for ${family[0].firstName} ${family[0].lastName}` }).waitFor();
  await page.getByText("No upcoming absences.").waitFor();
  const longChildWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(longChildWidth <= 360, "Long child name fits the 360px Absences layout");
  await picker.selectOption(family[1].studentId);
  await page.getByRole("heading", { name: `Absences for ${family[1].firstName} ${family[1].lastName}` }).waitFor();
  await page.getByText("No upcoming absences.").waitFor();
  const measurements = await page.evaluate(() => ({
    viewport: innerWidth, width: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll('nav[aria-label="Family views"] button, select')].map(node => { const box = node.getBoundingClientRect(); return { name: node.textContent?.trim(), x: box.x, width: box.width, height: box.height }; }),
  }));
  assert(measurements.width <= measurements.viewport, "360px document has no horizontal overflow");
  for (const box of measurements.controls) { assert(box.height >= 44, "New native control has >=44px target"); assert(box.x >= 0 && box.x + box.width <= 360, "Control stays in viewport"); }
  await page.screenshot({ path: resolve(out, "absences-360.png"), fullPage: true });
  await page.getByRole("navigation", { name: "Parent navigation" }).getByRole("link", { name: "My children", exact: true }).click();
  await page.getByRole("heading", { level: 1, name: "My children", exact: true }).waitFor();
  assert.equal(await page.getByRole("combobox").count(), 0);
  await page.getByRole("region", { name: `${family[1].firstName} ${family[1].lastName}` }).waitFor();
  const absences = nav.getByRole("button", { name: "Absences", exact: true }); await absences.focus(); await page.keyboard.press("Enter");
  await page.getByRole("combobox").waitFor();
  assert(!requests.some(r => /bus-location|inbox/.test(r.path)), "Unavailable features must not call unmerged APIs");
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, "metrics.json"), JSON.stringify({ scope: "fixture-only production UI; no backend/GPS/inbox claim", ...measurements, homeWidth, longChildWidth, requests, errors }, null, 2));
  writeFileSync(resolve(frontend, "../tmp/parent-navigation-mobile/latest.json"), JSON.stringify({ directory: out }));
  console.log("PASS fixture-only Chromium production UI: 360px long names, native 44px navigation/selector, real Next navigation reset, child absence switching, keyboard, no overflow/crashes or unmerged API calls.");
} catch (error) {
  if (page) {
    await page.screenshot({ path: resolve(out, "failure-360.png"), fullPage: true }).catch(() => {});
    writeFileSync(resolve(out, "failure.json"), JSON.stringify({ error: error.message, body: await page.locator("body").innerText().catch(() => ""), errors, consoleErrors, requests }, null, 2));
  }
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    if (process.platform === "win32") await new Promise(done => spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("exit", done));
    else server.kill("SIGTERM");
  }
  log.end();
}
