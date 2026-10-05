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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
