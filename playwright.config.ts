import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

const production = process.env.E2E_PRODUCTION === "1";
process.env.E2E_INVITES ??= JSON.stringify(Object.fromEntries(
  ["auth", "mobile-320", "mobile-390", "mobile-480"].map((name) => [name, randomBytes(18).toString("base64url")]),
));
const environment = {
  E2E_RUN: "1", E2E_INVITES: process.env.E2E_INVITES,
  DATABASE_URL: "", PGLITE_DATA_DIR: ".data/e2e/database",
  APP_URL: `${production ? "https" : "http"}://127.0.0.1:3109`,
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
  timeout: 60_000,
  testMatch: production ? "**/pwa.spec.ts" : ["**/auth-onboarding.spec.ts", "**/mobile-shell.spec.ts"],
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3109",
    ...devices["Desktop Chrome"],
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: `node --import tsx scripts/reset-e2e-db.ts && ${production ? "pnpm build && pnpm start --hostname 127.0.0.1 --port 3109" : "pnpm dev --hostname 127.0.0.1 --port 3109"}`,
    url: "http://127.0.0.1:3109/offline",
    env: environment,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
