import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Same-origin framing only. Clerk renders inside our own pages, so this
  // does not break auth. (No CSP: Clerk + Next inline scripts make a static
  // allowlist brittle; revisit only with runtime verification.)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          // The service worker must never be served stale (update path).
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          ...securityHeaders,
        ],
      },
      {
        // Icons/manifest are content-addressed by deployment; cache hard.
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
