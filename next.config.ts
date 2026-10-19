import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.E2E_RUN === "1" ? ".next-e2e" : ".next",
  devIndicators: process.env.E2E_RUN === "1" ? false : undefined,
};

export default nextConfig;
