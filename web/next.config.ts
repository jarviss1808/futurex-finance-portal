import type { NextConfig } from "next";
import { applicationSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    const https = Boolean(process.env.APP_ORIGIN?.startsWith("https://"));
    return [{ source: "/:path*", headers: applicationSecurityHeaders(https) }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
