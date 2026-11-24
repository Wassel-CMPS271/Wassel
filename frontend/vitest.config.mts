import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Vitest runs outside Next's own build, so it needs its own React plugin and
// its own copy of the "@/*" alias from tsconfig.json (TypeScript's path
// mapping is type-only and doesn't affect how Vitest resolves imports).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // postcss.config.mjs is in Next's format (plugin names as strings), which
  // Vite can't load. Tests don't need Tailwind, so CSS imports (e.g.
  // leaflet.css in components/map) get an empty PostCSS config instead.
  css: {
    postcss: {},
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // The default 5 seconds is not enough for the first test of a file that opens a dialog with a map when
    // the whole suite runs at once (routing.independent and pin.independent timed out on busy machines and
    // CI). A test that passes is not slower; this only gives a slow one room.
    testTimeout: 15000,
    // Only used by `npm run test:coverage` (SCRUM-151). json-summary is what CI reads for its job summary
    // (SCRUM-292).
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-support/**"],
      // The floor (SCRUM-292): `npm run test:coverage` fails when line coverage drops below this. It was
      // 88.58% on 2026-11-22; the floor is two points below it and is never lowered. Raise it only by a
      // deliberate change here, together with the reading in docs/quality/.
      thresholds: { lines: 86.6 },
    },
  },
});
