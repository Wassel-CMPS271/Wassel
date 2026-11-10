// Isolated fixture-only browser review of prepared components, never a production route.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "@playwright/test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kind = process.argv[2]; assert(["tracking", "inbox"].includes(kind));
const port = kind === "tracking" ? 4187 : 4186;
const base = `http://127.0.0.1:${port}`;
const out = resolve(frontend, "../tmp/parent-features-mobile", kind, new Date().toISOString().replaceAll(":", "-"));
mkdirSync(out, { recursive: true });
console.log(`Fixture component evidence: ${out}`);
writeFileSync(resolve(out, "index.html"), '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>');
const feature = kind === "tracking" ? "ParentTrackingHome" : "ParentInboxHome";
const entry = `import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { Button } from "@/components/ui/Button";
import { ${feature} } from "@/app/(parent)/parent/${feature}";
let gpsStatus = "LIVE", failed = false, account = "first", unread = 73;
let rows = [
 { id: "lina-entry", studentId: "40000000-0000-4000-8000-000000000001", studentName: "Lina " + "Longname".repeat(8), type: "PICKED_UP", runId: "run", direction: "MORNING", createdAt: "2026-11-10T07:00:00Z", readAt: null },
 { id: "omar-entry", studentId: "40000000-0000-4000-8000-000000000002", studentName: "Omar Navigation", type: "DROPPED_OFF", runId: "run", direction: "AFTERNOON", createdAt: "2026-11-10T07:10:00Z", readAt: null },
];
const inbox = {
 async list(onlyUnread = false) { if (failed) { failed = false; throw new Error("fixture outage"); } return account === "second" ? [] : structuredClone(rows.filter(row => !onlyUnread || !row.readAt)); },
 async unreadCount() { return account === "second" ? 0 : unread; },
 async markRead(id) { const row = rows.find(item => item.id === id); if (!row.readAt) { row.readAt = "2026-11-10T08:00:00Z"; unread--; } return structuredClone(row); },
 async markAllRead() { rows.forEach(row => row.readAt = "2026-11-10T08:00:00Z"); unread = 0; },
};
function Root() {
 const [identity, setIdentity] = useState("first"), [version, setVersion] = useState(0);
 const gps = React.useMemo(() => async () => gpsStatus === "UNAVAILABLE" ? { status: "UNAVAILABLE", position: null } : { status: gpsStatus, position: { latitude: 33.9, longitude: 35.5, accuracyMeters: 10, ageSeconds: gpsStatus === "LIVE" ? 5 : 140, receivedAt: "2026-11-10T07:00:00Z" } }, [version]);
 return <><aside aria-label="Fixture controls"><p>UI fixture preview; no backend integration.</p>
 <Button onClick={() => { gpsStatus = "STALE"; setVersion(value => value + 1); }}>Fixture stale GPS</Button>
 <Button onClick={() => { gpsStatus = "UNAVAILABLE"; setVersion(value => value + 1); }}>Fixture missing GPS</Button>
 <Button onClick={() => { failed = true; }}>Fixture fail next read</Button>
 <Button onClick={() => { account = "second"; setIdentity("second"); }}>Fixture switch account</Button>
 </aside><div id="product"><${feature} api={${kind === "tracking" ? "gps" : "inbox"}} accountKey={identity} /></div></>;
}
createRoot(document.getElementById("root")).render(<Root />);
`;
writeFileSync(resolve(out, "entry.tsx"), entry);
const server = await createServer({
 configFile: false, root: out, cacheDir: resolve(out, "vite-cache"), plugins: [react()],
 define: { "process.env.NEXT_PUBLIC_API_BASE_URL": JSON.stringify("") },
 resolve: { alias: { "@": resolve(frontend, "src"), "react": realpathSync(resolve(frontend, "node_modules/react")), "react-dom": realpathSync(resolve(frontend, "node_modules/react-dom")) }, dedupe: ["react", "react-dom"] },
 css: { postcss: { plugins: [tailwind({ base: frontend })] } },
 server: { host: "127.0.0.1", port, strictPort: true, watch: { ignored: ["**/failure*", "**/metrics.json", "**/*.png", "**/vite-cache/**"] }, fs: { allow: [frontend, out, realpathSync(resolve(frontend, "node_modules"))] } },
});
let browser, page; const errors = [], consoleErrors = [], requests = [];
try {
 await server.listen(); browser = await chromium.launch({ headless: true });
 page = await browser.newPage({ viewport: { width: 360, height: 800 }, reducedMotion: "reduce" });
 page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
 let secondAccount = false;
 const family = ["Lina", "Omar"].map((firstName, index) => ({ studentId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, firstName, lastName: "Navigation", route: { id: "route", name: "Fixture route" }, driver: { id: "driver", firstName: "Fixture", lastName: "Driver", phone: "+961 70 123 456" }, vehicle: { id: "vehicle", plateNumber: "FIXTURE" }, expectedPickupTime: "07:20", todayRun: { direction: "MORNING", state: "IN_PROGRESS", stopsLeft: index + 1 } }));
 await page.route(url => url.pathname.startsWith("/api/"), async route => { const path = new URL(route.request().url()).pathname; requests.push(path); assert.equal(path, "/api/parent/children"); await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": base, "access-control-allow-credentials": "true" }, body: JSON.stringify(secondAccount ? [] : family) }); });
 // Real Leaflet markers/controls, with clearly fixture-only tiles and positions.
 await page.route("https://*.tile.openstreetmap.org/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#202535"/></svg>' }));
 await page.goto(base); const product = page.locator("#product");
 await product.getByRole("heading", { name: "Lina Navigation", exact: true }).waitFor();
 await product.getByRole("button", { name: kind === "tracking" ? "Bus tracking" : "Inbox", exact: true }).click();
 if (kind === "tracking") {
   await product.getByText("Live bus location", { exact: true }).waitFor();
   await product.locator(".leaflet-marker-icon").waitFor();
   for (const selector of [".leaflet-control-zoom-in", ".leaflet-control-zoom-out"]) {
     const box = await product.locator(selector).boundingBox();
     assert(box && box.width >= 44 && box.height >= 44, `Parent map zoom target must be >=44px: ${JSON.stringify(box)}`);
   }
   assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= 360, "Actual Leaflet view fits 360px");
   await page.screenshot({ path: resolve(out, "tracking-live-360.png"), fullPage: true });
   await product.getByRole("combobox").selectOption(family[1].studentId);
   await product.getByRole("region", { name: "Bus location for Omar Navigation" }).waitFor();
   assert.equal(await product.locator(".leaflet-marker-icon").count(), 1);
   await page.getByRole("button", { name: "Fixture stale GPS" }).click();
   await product.getByText(/Last seen 140 seconds/).waitFor();
   assert.equal(await product.getByText("Live bus location", { exact: true }).count(), 0);
   await page.getByRole("button", { name: "Fixture missing GPS" }).click();
   await product.getByText("Bus location is unavailable.", { exact: true }).waitFor();
   assert.equal(await product.locator(".leaflet-marker-icon").count(), 0);
 } else {
   await product.getByText("73 unread updates", { exact: true }).waitFor();
   assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= 360, "Long inbox event names fit 360px");
   await page.screenshot({ path: resolve(out, "inbox-360.png"), fullPage: true });
   await product.getByRole("button", { name: "Mark update for Omar Navigation as read" }).click();
   await product.getByText("72 unread updates", { exact: true }).waitFor();
   assert.equal(await product.getByRole("button", { name: /Mark update for Lina/ }).count(), 1);
   await page.getByRole("button", { name: "Fixture fail next read" }).click();
   await product.getByRole("button", { name: "Refresh inbox" }).click(); await product.getByRole("alert").waitFor();
   await product.getByRole("button", { name: "Refresh inbox" }).click(); await product.getByText("72 unread updates", { exact: true }).waitFor();
   await product.getByRole("button", { name: "Mark all as read" }).click(); await product.getByText("0 unread updates", { exact: true }).waitFor();
 }
 const metrics = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, controls: [...document.querySelectorAll("#product button, #product select")].map(node => { const r = node.getBoundingClientRect(); return { name: node.textContent?.trim(), height: r.height, x: r.x, width: r.width }; }) }));
 assert(metrics.width <= 360, "Prepared component has no 360px overflow");
 for (const control of metrics.controls) { assert(control.height >= 44); assert(control.x >= 0 && control.x + control.width <= 360); }
 secondAccount = true; await page.getByRole("button", { name: "Fixture switch account" }).click();
 await product.getByText("No children linked yet", { exact: true }).waitFor();
 assert.equal(await product.locator(".leaflet-marker-icon").count(), 0);
 assert.equal(await product.getByRole("heading", { name: /Picked up|Dropped off/ }).count(), 0);
 assert.deepEqual(errors, []);
 writeFileSync(resolve(out, "metrics.json"), JSON.stringify({ scope: "fixture-only prepared components, no backend claim", kind, ...metrics, errors, requests }, null, 2));
 mkdirSync(resolve(frontend, "../tmp/parent-features-mobile", kind), { recursive: true });
 writeFileSync(resolve(frontend, "../tmp/parent-features-mobile", kind, "latest.json"), JSON.stringify({ directory: out }));
 console.log(`PASS fixture-only ${kind}: actual components at 360px, 44px controls, account reset, ${kind === "tracking" ? "actual Leaflet marker, child switch, stale/missing GPS" : "sibling read identity, authoritative counts, error/retry and read-all"}.`);
} catch (error) {
 if (page) { await page.screenshot({ path: resolve(out, "failure.png"), fullPage: true }).catch(() => {}); writeFileSync(resolve(out, "failure.json"), JSON.stringify({ error: error.message, errors, consoleErrors, requests, body: await page.locator("body").innerText().catch(() => "") }, null, 2)); }
 throw error;
} finally { await browser?.close(); await server.close(); }
