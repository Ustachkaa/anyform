import type { NextConfig } from "next";
import path from "node:path";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  // The standalone server lives at apps/web/server.js relative to the repo
  // root, which is what infra/web.Dockerfile expects.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@anyform/shared"],
  images: { unoptimized: true },
  poweredByHeader: false,
  async rewrites() {
    // The browser only ever talks to this origin; /api/* is proxied to the
    // Fastify API so cookies stay first-party and there is no CORS.
    return [{ source: "/api/:path*", destination: `${API_INTERNAL_URL}/v1/:path*` }];
  },
};

export default nextConfig;
