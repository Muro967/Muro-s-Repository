// @vitest-environment node
test.each([
  "@/features/storage/storage-service", "@/features/storage/local-storage-provider", "@/features/storage/s3-storage-provider", "@/server/storage", "@/server/db/drizzle-storage-repository",
])("guards storage server code from client imports: %s", async (moduleName) => {
  await expect(import(moduleName)).rejects.toThrow("This module cannot be imported from a Client Component");
});
