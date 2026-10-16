// @vitest-environment node

const boundaryError = "This module cannot be imported from a Client Component";

test("prevents server environment access outside a React server boundary", async () => {
  await expect(import("@/server/env")).rejects.toThrow(boundaryError);
});

test("prevents database client access outside a React server boundary", async () => {
  await expect(import("@/server/db/client")).rejects.toThrow(boundaryError);
});
