// @vitest-environment node
import { mkdtemp, readdir, readFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorageProvider } from "@/features/storage/local-storage-provider";
vi.mock("server-only", () => ({}));
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "aiw-storage-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const key = "users/user-a/wardrobe-original/2026/10/286bf6d0-19b7-4da8-aec8-e292ae59c526.jpg";
const bytes = () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } });

test("streams a private immutable object, verifies, opens and deletes without exposing filesystem paths", async () => {
  const provider = new LocalStorageProvider(root);
  const target = await provider.createUploadTarget({ uploadId: "286bf6d0-19b7-4da8-aec8-e292ae59c526", objectKey: key, contentType: "image/jpeg", sizeBytes: 3 });
  expect(target).toEqual({ method: "PUT", url: "/api/uploads/286bf6d0-19b7-4da8-aec8-e292ae59c526/content", headers: { "content-type": "image/jpeg", "content-length": "3" } });
  await provider.writeObject(key, bytes(), 3, "image/jpeg");
  expect(await provider.verifyObject(key, 3, "image/jpeg")).toBe(true);
  expect(await provider.verifyObject(key, 2, "image/jpeg")).toBe(false);
  expect(await new Response(await provider.openObject(key)).arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  await expect(provider.writeObject(key, bytes(), 3, "image/jpeg")).rejects.toThrow("UPLOAD_CONFLICT");
  expect(await readFile(join(root, key))).toEqual(Buffer.from([1, 2, 3]));
  await provider.deleteObject(key); await provider.deleteObject(key);
  expect(await provider.verifyObject(key, 3, "image/jpeg")).toBe(false);
});

test.each(["../escape", "/tmp/escape", "users/user-a/../escape", key.replace("user-a", "user%2fa"), key.replace(".jpg", ".pdf"), key.replace("/2026/", "/2026//")])("rejects traversal and malformed keys at every filesystem operation: %s", async (bad) => {
  const provider = new LocalStorageProvider(root);
  await expect(provider.writeObject(bad, bytes(), 3, "image/jpeg")).rejects.toThrow("UNSUPPORTED_UPLOAD");
  await expect(provider.verifyObject(bad, 3)).rejects.toThrow("UNSUPPORTED_UPLOAD");
  await expect(provider.openObject(bad)).rejects.toThrow("UNSUPPORTED_UPLOAD");
  await expect(provider.deleteObject(bad)).rejects.toThrow("UNSUPPORTED_UPLOAD");
});

test("rejects symlink directories and files without touching their targets", async () => {
  const outside = join(root, "outside"); await mkdir(outside);
  const storage = join(root, "storage"); await mkdir(storage); await symlink(outside, join(storage, "users"));
  const provider = new LocalStorageProvider(storage);
  await expect(provider.writeObject(key, bytes(), 3, "image/jpeg")).rejects.toThrow("UNSUPPORTED_UPLOAD");
  expect(await readdir(outside)).toEqual([]);
  await rm(join(storage, "users"));
  await provider.writeObject(key, bytes(), 3, "image/jpeg");
  await rm(join(storage, key)); await symlink(join(root, "outside"), join(storage, key));
  await expect(provider.openObject(key)).rejects.toThrow("UNSUPPORTED_UPLOAD");
  await expect(provider.deleteObject(key)).rejects.toThrow("UNSUPPORTED_UPLOAD");
  await expect(provider.verifyObject(key, 3)).rejects.toThrow("UNSUPPORTED_UPLOAD");
});

test.each([2, 4])("removes temporary files after actual bytes differ from declared size %i", async (expected) => {
  const provider = new LocalStorageProvider(root);
  await expect(provider.writeObject(key, bytes(), expected, "image/jpeg")).rejects.toThrow("UPLOAD_SIZE_MISMATCH");
  expect(await provider.verifyObject(key, 3)).toBe(false);
  expect(await readdir(join(root, "users/user-a/wardrobe-original/2026/10"))).toEqual([]);
});

test("cancels an overflowing stream immediately and removes partial content after stream failure", async () => {
  const provider = new LocalStorageProvider(root); let cancelled = false;
  const overflow = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } });
  await expect(provider.writeObject(key, overflow, 3, "image/jpeg")).rejects.toThrow("UPLOAD_SIZE_MISMATCH");
  expect(cancelled).toBe(true);
  const broken = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1])); }, pull(c) { c.error(new Error("secret path")); } });
  await expect(provider.writeObject(key, broken, 3, "image/jpeg")).rejects.toThrow("STORAGE_FAILURE");
  expect(await readdir(join(root, "users/user-a/wardrobe-original/2026/10"))).toEqual([]);
});

test("validates MIME, extension and limits before consuming a body", async () => {
  const provider = new LocalStorageProvider(root);
  for (const [size, type] of [[0, "image/jpeg"], [15 * 1024 * 1024 + 1, "image/jpeg"], [3, "application/pdf"], [3, "image/png"]] as const) {
    await expect(provider.writeObject(key, bytes(), size, type)).rejects.toThrow("UNSUPPORTED_UPLOAD");
  }
});

test("publishes exactly one immutable object when writes race", async () => {
  const provider = new LocalStorageProvider(root);
  const results = await Promise.allSettled([provider.writeObject(key, bytes(), 3, "image/jpeg"), provider.writeObject(key, bytes(), 3, "image/jpeg")]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason.message).toBe("UPLOAD_CONFLICT");
  expect(await readdir(join(root, "users/user-a/wardrobe-original/2026/10"))).toEqual(["286bf6d0-19b7-4da8-aec8-e292ae59c526.jpg"]);
});
