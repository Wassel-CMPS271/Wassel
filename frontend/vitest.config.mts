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
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
