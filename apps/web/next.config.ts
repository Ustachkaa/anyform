import type { NextConfig } from "next";
import path from "node:path";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
const isDev = process.env.NODE_ENV !== "production";

/**
 * Browser security headers for every page. The only third party is Paddle
 * (checkout script + its iframes). 'unsafe-inline' scripts are needed by
 * Next.js's inline bootstrap; 'unsafe-eval' only in development (fast refresh).
 */
const PADDLE = "https://cdn.paddle.com https://*.paddle.com";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${PADDLE}`,
  `style-src 'self' 'unsafe-inline' ${PADDLE}`,
  "img-src 'self' data: blob: https://*.paddle.com",
  "font-src 'self' data:",
  `connect-src 'self' ${PADDLE}${isDev ? " ws: wss:" : ""}`,
  "frame-src https://*.paddle.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://buy.paddle.com" "https://sandbox-buy.paddle.com")' },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // The standalone server lives at apps/web/server.js relative to the repo
  // root, which is what infra/web.Dockerfile expects.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@anyform/shared"],
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    // The browser only ever talks to this origin; /api/* is proxied to the
    // Fastify API so cookies stay first-party and there is no CORS.
    return [{ source: "/api/:path*", destination: `${API_INTERNAL_URL}/v1/:path*` }];
  },
};

export default nextConfig;
