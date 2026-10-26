import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const production = process.env.E2E_PRODUCTION === "1";
const require = createRequire(import.meta.url);
const next = `"${process.execPath}" "${require.resolve("next/dist/bin/next")}"`;
const origin = `${production ? "https" : "http"}://127.0.0.1:3109`;
process.env.E2E_INVITES ??= JSON.stringify(Object.fromEntries(
  ["auth", "mobile-320", "mobile-390", "mobile-480", "inventory", "intruder", "inspiration"].map((name) => [name, randomBytes(18).toString("base64url")]),
));
const environment = {
  E2E_RUN: "1", E2E_INVITES: process.env.E2E_INVITES,
  DATABASE_URL: "", PGLITE_DATA_DIR: ".data/e2e/database",
  APP_URL: origin,
  INVITE_PEPPER: "isolated-e2e-pepper-never-use-for-real-accounts",
  SESSION_COOKIE_SECURE: production ? "true" : "false",
  STORAGE_DRIVER: "local", LOCAL_STORAGE_DIR: ".data/e2e/uploads",
  S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  testMatch: ["**/auth-onboarding.spec.ts", "**/mobile-shell.spec.ts", "**/wardrobe-inventory.spec.ts", "**/idle-disposal.spec.ts", "**/inspiration-style-recreation.spec.ts", ...(production ? ["**/pwa.spec.ts"] : [])],
  reporter: "list",
  use: {
    baseURL: origin,
    ...devices["Desktop Chrome"],
    trace: "off",
    screenshot: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: production,
    // Local throwaway certificate; also allows the worker's HTTPS registration.
    launchOptions: { args: production ? ["--ignore-certificate-errors"] : [] },
  },
  webServer: {
    command: `"${process.execPath}" --import tsx scripts/reset-e2e-db.ts && ${production ? `${next} build && "${process.execPath}" --import tsx scripts/start-e2e-production.ts` : `${next} dev --hostname 127.0.0.1 --port 3109`}`,
    url: `${origin}/offline`,
    ignoreHTTPSErrors: production,
    env: environment,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
