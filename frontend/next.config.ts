import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output lets the staging Docker image copy just the traced
  // server bundle instead of full node_modules. See ../docker-compose.staging.yml.
  output: "standalone",
};

export default nextConfig;
