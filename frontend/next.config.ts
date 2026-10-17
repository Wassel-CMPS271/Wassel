import type { NextConfig } from "next";

// One origin for the browser (SCRUM-198). The session cookies are SameSite=Strict, so the app and
// the API must be on the same site. Instead of hosting both under one domain, the app proxies
// /api/* to the backend: the browser only ever talks to the app's own origin, and request()
// (src/lib/api/client.ts) uses relative URLs when NEXT_PUBLIC_API_BASE_URL is set to empty.
//
// Rewrites are read at build time, so BACKEND_URL is a build setting (a Docker build arg, or an
// environment variable in Vercel), like NEXT_PUBLIC_API_BASE_URL.
const proxyMode = process.env.NEXT_PUBLIC_API_BASE_URL === "";
const backendUrl = (process.env.BACKEND_URL || "http://localhost:8080").replace(/\/+$/, "");

if (proxyMode && !process.env.BACKEND_URL) {
  // Relative URLs with nowhere to send them would break every API call after deploy, so stop here.
  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL is empty, so /api/* is proxied to the backend, but BACKEND_URL is not set. " +
      "Set BACKEND_URL to the backend's address (for example https://wassel-api.example.com).",
  );
}

const nextConfig: NextConfig = {
  // Standalone output lets the staging Docker image copy just the traced
  // server bundle instead of full node_modules. See ../docker-compose.staging.yml.
  output: "standalone",

  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
