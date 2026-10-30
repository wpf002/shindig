import type { NextConfig } from "next";

const api = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@shindig/core"],
  // The browser only ever talks to this origin. /api/* is proxied to Fastify,
  // which keeps session cookies first-party and avoids CORS entirely.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
