import path from "node:path";
import type { NextConfig } from "next";

/** Security headers for every response. The Content-Security-Policy is set per request in src/proxy.ts. */
const securityHeaders = [
  // Don't let other sites show LeaseLens in a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers must use the declared content type, never guess one.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never send page addresses (e.g. a sign-in link with its token) to other sites.
  { key: "Referrer-Policy", value: "same-origin" },
  // Features the app doesn't use stay off. The camera stays allowed for this site only, so taking a photo
  // from the file picker keeps working on every phone browser.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  // HTTPS only, once deployed (browsers ignore this header on plain-HTTP localhost).
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

/**
 * Deployed (Cloud Run): the browser talks only to this site, and /api/* is forwarded to the API service.
 * Next.js fixes rewrites when it builds, so the Cloud Build step passes the API address as API_ORIGIN.
 * Locally API_ORIGIN isn't set: no rewrite, and the browser calls http://localhost:4100 directly.
 */
const apiOrigin = process.env.API_ORIGIN;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A self-contained server (node server.js) for the Docker image; traced from the monorepo root so the
  // shared workspace package is included.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return apiOrigin ? [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }] : [];
  },
};

export default nextConfig;
