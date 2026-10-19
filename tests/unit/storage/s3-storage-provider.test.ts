// @vitest-environment node
import { S3Client, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { S3StorageProvider } from "@/features/storage/s3-storage-provider";
import { createStorageProvider } from "@/server/storage";
import { LocalStorageProvider } from "@/features/storage/local-storage-provider";
vi.mock("server-only", () => ({}));
const config = { endpoint: "https://objects.example.com", region: "auto", bucket: "private-uploads", accessKeyId: "test-access-key", secretAccessKey: "test-secret-do-not-leak" };
const key = "users/user-a/inspiration/2026/10/286bf6d0-19b7-4da8-aec8-e292ae59c526.webp";
const targetInput = { uploadId: "286bf6d0-19b7-4da8-aec8-e292ae59c526", objectKey: key, contentType: "image/webp", sizeBytes: 3 } as const;

test("presigns a private immutable PUT for five minutes with signed MIME and exact length", async () => {
  const provider = new S3StorageProvider(config);
  const target = await provider.createUploadTarget(targetInput); const url = new URL(target.url);
  expect(target.method).toBe("PUT");
  expect(url.origin).toBe("https://objects.example.com");
  expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(expect.arrayContaining(["content-length", "content-type", "host", "if-none-match"]));
  expect(target.headers).toEqual({ "content-type": "image/webp", "content-length": "3", "if-none-match": "*" });
  expect(JSON.stringify(target)).not.toContain(config.secretAccessKey);
  expect(JSON.stringify(target)).not.toContain("public-read");
});

test("validates MIME, expected size and object keys before signing", async () => {
  const provider = new S3StorageProvider(config);
  for (const value of [{ ...targetInput, contentType: "application/pdf" }, { ...targetInput, sizeBytes: 16 * 1024 * 1024 }, { ...targetInput, objectKey: "../outside" }]) {
    await expect(provider.createUploadTarget(value as typeof targetInput)).rejects.toThrow("UNSUPPORTED_UPLOAD");
  }
});

test("checks remote metadata and sanitizes missing or failed S3 operations", async () => {
  // The network send is the only external boundary; signing and commands remain real.
  const send = vi.spyOn(S3Client.prototype, "send");
  const provider = new S3StorageProvider(config);
  try {
    send.mockImplementation(async (command) => {
      if (command instanceof HeadObjectCommand) return { ContentLength: 3, ContentType: "image/webp" };
      if (command instanceof GetObjectCommand) return { ContentLength: 3, ContentType: "image/webp", Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.close(); } }) } };
      if (command instanceof DeleteObjectCommand) return {};
      throw new Error("Unexpected command");
    });
    expect(await provider.verifyObject(key, 3, "image/webp")).toBe(true);
    expect(await provider.verifyObject(key, 2, "image/webp")).toBe(false);
    await expect(provider.verifyObject(key, 3, "image/jpeg")).rejects.toThrow("UNSUPPORTED_UPLOAD");
    expect(new Uint8Array(await new Response(await provider.openObject(key)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    await provider.deleteObject(key);
    send.mockRejectedValue(Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } }));
    expect(await provider.verifyObject(key, 3)).toBe(false); await provider.deleteObject(key);
    await expect(provider.openObject(key)).rejects.toThrow("UPLOAD_NOT_FOUND");
    send.mockRejectedValue(new Error(config.secretAccessKey));
    for (const operation of [provider.verifyObject(key, 3), provider.openObject(key), provider.deleteObject(key)]) {
      await expect(operation).rejects.toThrow("STORAGE_FAILURE"); await expect(operation).rejects.not.toThrow(config.secretAccessKey);
    }
    await expect(provider.deleteObject("../outside")).rejects.toThrow("UNSUPPORTED_UPLOAD");
  } finally { send.mockRestore(); }
});

test("fails closed on incomplete S3 configuration and only selects supported drivers", () => {
  expect(createStorageProvider({ STORAGE_DRIVER: "local", LOCAL_STORAGE_DIR: ".data/uploads" })).toBeInstanceOf(LocalStorageProvider);
  expect(createStorageProvider({ STORAGE_DRIVER: "s3", S3_ENDPOINT: config.endpoint, S3_REGION: "auto", S3_BUCKET: "private-uploads", S3_ACCESS_KEY_ID: config.accessKeyId, S3_SECRET_ACCESS_KEY: config.secretAccessKey })).toBeInstanceOf(S3StorageProvider);
  for (const env of [{ STORAGE_DRIVER: "unknown" }, { STORAGE_DRIVER: "s3" }, { STORAGE_DRIVER: "local", LOCAL_STORAGE_DIR: "" }, { STORAGE_DRIVER: "s3", S3_ENDPOINT: "https://user:secret@example.com", S3_BUCKET: "private-uploads", S3_ACCESS_KEY_ID: "access", S3_SECRET_ACCESS_KEY: "secret" }]) {
    expect(() => createStorageProvider(env)).toThrow("Invalid storage configuration");
  }
});

test("rejects mismatched remote MIME and sanitizes streaming read failures", async () => {
  const send = vi.spyOn(S3Client.prototype, "send"); const provider = new S3StorageProvider(config);
  try {
    send.mockResolvedValue({ ContentLength: 3, ContentType: "image/png" } as never);
    expect(await provider.verifyObject(key, 3)).toBe(false);
    send.mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: { transformToWebStream: () => new ReadableStream({ pull(c) { c.error(new Error(config.secretAccessKey)); } }) } } as never);
    const read = new Response(await provider.openObject(key)).arrayBuffer();
    await expect(read).rejects.toThrow("STORAGE_FAILURE"); await expect(read).rejects.not.toThrow(config.secretAccessKey);
    send.mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4)); c.close(); } }) } } as never);
    await expect(new Response(await provider.openObject(key)).arrayBuffer()).rejects.toThrow("STORAGE_FAILURE");
  } finally { send.mockRestore(); }
});

test("cancels remote bodies rejected for mismatched type or invalid size", async () => {
  const send = vi.spyOn(S3Client.prototype, "send"); const provider = new S3StorageProvider(config);
  try {
    for (const metadata of [{ ContentLength: 3, ContentType: "image/png" }, { ContentLength: 0, ContentType: "image/webp" }, { ContentLength: -1, ContentType: "image/webp" }, { ContentLength: 16 * 1024 * 1024, ContentType: "image/webp" }, { ContentLength: 3, ContentType: "text/html" }]) {
      let cancelled = false;
      send.mockResolvedValue({ ...metadata, Body: { transformToWebStream: () => new ReadableStream({ cancel() { cancelled = true; } }) } } as never);
      await expect(provider.openObject(key)).rejects.toThrow("STORAGE_FAILURE"); expect(cancelled).toBe(true);
    }
  } finally { send.mockRestore(); }
});
