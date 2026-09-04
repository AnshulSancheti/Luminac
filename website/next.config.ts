import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "luminac-catalog-staging.shivam-a7d.workers.dev",
        pathname: "/assets/**",
      },
    ],
  },
};

export default nextConfig;
