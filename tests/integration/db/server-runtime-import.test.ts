// @vitest-environment node

import { spawnSync } from "node:child_process";

test("loads the environment and database runtime from an ordinary Node CLI", () => {
  const script = `
    const environmentModule = await import("./src/server/runtime/env.ts");
    const databaseModule = await import("./src/server/runtime/db.ts");
    const environment = environmentModule.readServerEnv({
      NODE_ENV: "test",
      DATABASE_URL: "",
      PGLITE_DATA_DIR: "",
    });

    if (environment.DATABASE_URL !== undefined) process.exit(2);
    if (typeof databaseModule.getDb !== "function") process.exit(3);
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  expect(result.status, result.stderr).toBe(0);
});
