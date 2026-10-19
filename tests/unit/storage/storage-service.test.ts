// @vitest-environment node
import { createUpload, completeUpload } from "@/features/storage/storage-service";
import type { StorageRepository, UploadRecord } from "@/features/storage/storage-repository";
import { FakeStorageProvider } from "../../helpers/fake-storage-provider";
vi.mock("server-only", () => ({}));

function setup() {
  const records = new Map<string, UploadRecord>();
  const repository: StorageRepository = {
    async create(record) { records.set(record.id, record); },
    async findOwned(id, userId) { const r = records.get(id); return r?.userId === userId ? r : null; },
    async completePending(id, userId, now) {
      const r = records.get(id);
      if (!r || r.userId !== userId || r.status !== "pending") return false;
      records.set(id, { ...r, status: "completed", completedAt: now }); return true;
    },
  };
  return { userId: "user-a", repository, provider: new FakeStorageProvider(), now: () => new Date("2026-10-18T12:00:00Z"), records };
}
const input = { kind: "wardrobe-original", contentType: "image/jpeg", sizeBytes: 3 } as const;

test("creates unique private tenant keys and persists pending metadata", async () => {
  const deps = setup();
  const a = await createUpload(input, deps);
  const b = await createUpload(input, deps);
  expect(a.objectKey).toMatch(/^users\/user-a\/wardrobe-original\/2026\/10\/[0-9a-f-]{36}\.jpg$/);
  expect(a.objectKey).not.toBe(b.objectKey);
  expect(deps.records.get(a.uploadId)).toMatchObject({ userId: "user-a", status: "pending", sizeBytes: 3, contentType: "image/jpeg" });
});

test.each([
  { ...input, contentType: "application/pdf" }, { ...input, contentType: "image/jpeg; charset=utf-8" },
  { ...input, sizeBytes: 15 * 1024 * 1024 + 1 }, { ...input, sizeBytes: 0 },
  { ...input, sizeBytes: -1 }, { ...input, sizeBytes: 1.2 }, { ...input, sizeBytes: Infinity },
  { ...input, kind: "../outside" }, null, { ...input, extra: true },
])("rejects unsupported uploads before persistence: %j", async (value) => {
  const deps = setup();
  await expect(createUpload(value, deps)).rejects.toThrow("UNSUPPORTED_UPLOAD");
  expect(deps.records.size).toBe(0);
});

test("requires an owned object of the expected size before atomic idempotent completion", async () => {
  const deps = setup(); const upload = await createUpload(input, deps);
  await expect(completeUpload(upload.uploadId, { ...deps, userId: "user-b" })).rejects.toThrow("UPLOAD_NOT_FOUND");
  await expect(completeUpload(upload.uploadId, deps)).rejects.toThrow("UPLOAD_INCOMPLETE");
  deps.provider.objects.set(upload.objectKey, new Uint8Array([1, 2]));
  await expect(completeUpload(upload.uploadId, deps)).rejects.toThrow("UPLOAD_INCOMPLETE");
  deps.provider.objects.set(upload.objectKey, new Uint8Array([1, 2, 3]));
  const results = await Promise.all([completeUpload(upload.uploadId, deps), completeUpload(upload.uploadId, deps)]);
  expect(results).toEqual([{ uploadId: upload.uploadId, status: "completed" }, { uploadId: upload.uploadId, status: "completed" }]);
  expect(await completeUpload(upload.uploadId, deps)).toEqual(results[0]);
  expect(deps.records.get(upload.uploadId)?.completedAt).toEqual(deps.now());
});

test("rejects unsafe user segments and invalid upload identifiers", async () => {
  const deps = setup();
  await expect(createUpload(input, { ...deps, userId: "../../escape" })).rejects.toThrow("UNSUPPORTED_UPLOAD");
  await expect(completeUpload("invalid", deps)).rejects.toThrow("UPLOAD_NOT_FOUND");
});

test.each([
  ["wardrobe-original", "image/jpeg", "jpg"], ["inspiration", "image/png", "png"], ["wear-photo", "image/webp", "webp"],
])("accepts supported kinds and MIME types through the exact size limit", async (kind, contentType, extension) => {
  const result = await createUpload({ kind, contentType, sizeBytes: 15 * 1024 * 1024 }, setup());
  expect(result.objectKey).toContain(`/${kind}/2026/10/`); expect(result.objectKey).toMatch(new RegExp(`\\.${extension}$`));
});
