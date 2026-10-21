import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.E2E_RUN === "1" ? ".next-e2e" : ".next",
  devIndicators: process.env.E2E_RUN === "1" ? false : undefined,
  // PGlite's Node filesystem/WASM loader must receive native URL instances.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
