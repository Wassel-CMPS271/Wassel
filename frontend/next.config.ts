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

// Security headers on every response (SCRUM-257, from the OWASP ZAP baseline scan). The policy is as tight as
// the app allows today: Next's own inline scripts need 'unsafe-inline' (a nonce would mean rendering every page
// per request), the components set inline styles, and the maps load OpenStreetMap tiles. Outside production
// the dev server also needs 'unsafe-eval'. Cross-Origin-Embedder-Policy is left out on purpose: it would
// block those cross-origin map tiles.
const isProduction = process.env.NODE_ENV === "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // The framework name and version help nobody but an attacker.
  poweredByHeader: false,

  // Standalone output lets the staging Docker image copy just the traced
  // server bundle instead of full node_modules. See ../docker-compose.staging.yml.
  output: "standalone",

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
