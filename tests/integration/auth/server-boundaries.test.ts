// @vitest-environment node

import { expect, it } from "vitest";

it.each([
  () => import("@/features/auth/auth-routes"),
  () => import("@/features/auth/current-user"),
  () => import("@/features/auth/session-cookie"),
  () => import("@/server/auth"),
])("guards authentication entry points from client imports", async (load) => {
  await expect(load()).rejects.toThrow("This module cannot be imported from a Client Component");
});
