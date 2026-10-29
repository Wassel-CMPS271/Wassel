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
    // Only used by `npm run test:coverage` (SCRUM-151). A report, not a gate: no thresholds.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-support/**"],
    },
  },
});
