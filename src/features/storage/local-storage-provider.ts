import "server-only";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, link, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_UPLOAD_BYTES, StorageError, validateObjectKey, validateObjectMetadata, validateUploadTarget, type StorageProvider, type UploadContentType, type UploadTargetInput } from "./storage-provider";

function missing(error: unknown) { return (error as NodeJS.ErrnoException)?.code === "ENOENT"; }
function failure(error: unknown): never {
  if (error instanceof StorageError) throw error;
  throw new StorageError("STORAGE_FAILURE");
}

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly root: string) {}

  async createUploadTarget(input: UploadTargetInput) {
    validateUploadTarget(input);
    return { method: "PUT" as const, url: `/api/uploads/${input.uploadId}/content`, headers: { "content-type": input.contentType, "content-length": String(input.sizeBytes) } };
  }

  private async objectPath(key: string, createDirectories = false): Promise<string> {
    validateObjectKey(key);
    const root = resolve(this.root);
    if (createDirectories) await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await lstat(root)).isSymbolicLink()) throw new StorageError("UNSUPPORTED_UPLOAD");
    const canonicalRoot = await realpath(root);
    const target = resolve(canonicalRoot, key);
    if (!target.startsWith(canonicalRoot + sep)) throw new StorageError("UNSUPPORTED_UPLOAD");
    let current = canonicalRoot;
    for (const segment of key.split("/").slice(0, -1)) {
      current = join(current, segment);
      if (createDirectories) await mkdir(current, { mode: 0o700 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory() || await realpath(current) !== current) throw new StorageError("UNSUPPORTED_UPLOAD");
    }
    try { if ((await lstat(target)).isSymbolicLink()) throw new StorageError("UNSUPPORTED_UPLOAD"); }
    catch (error) { if (!missing(error)) throw error; }
    return target;
  }

  async writeObject(key: string, body: ReadableStream<Uint8Array>, expectedSize: number, contentType: string): Promise<void> {
    validateObjectMetadata(key, expectedSize, contentType);
    let temporary: string | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const target = await this.objectPath(key, true);
      temporary = join(dirname(target), `.${randomUUID()}.partial`);
      // This private object is created at runtime, not a deployment asset.
      handle = await open(/* turbopackIgnore: true */ temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      reader = body.getReader();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > expectedSize) throw new StorageError("UPLOAD_SIZE_MISMATCH");
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await handle.write(value, offset, value.byteLength - offset);
          if (bytesWritten === 0) throw new StorageError("STORAGE_FAILURE");
          offset += bytesWritten;
        }
      }
      if (total !== expectedSize) throw new StorageError("UPLOAD_SIZE_MISMATCH");
      await handle.close(); handle = undefined;
      // A hard link publishes atomically without overwriting an existing object.
      await this.objectPath(key);
      await link(temporary, target).catch((error) => { if (error.code === "EEXIST") throw new StorageError("UPLOAD_CONFLICT"); throw error; });
    } catch (error) {
      await reader?.cancel().catch(() => {});
      failure(error);
    } finally {
      reader?.releaseLock();
      await handle?.close().catch(() => {});
      if (temporary) await unlink(temporary).catch(() => {});
    }
  }

  async verifyObject(key: string, expectedSize: number, contentType?: UploadContentType): Promise<boolean> {
    validateObjectMetadata(key, expectedSize, contentType);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(await this.objectPath(key), constants.O_RDONLY | constants.O_NOFOLLOW);
      const metadata = await handle.stat();
      return metadata.isFile() && metadata.size === expectedSize;
    } catch (error) { if (missing(error)) return false; return failure(error); }
    finally { await handle?.close(); }
  }

  async openObject(key: string): Promise<ReadableStream<Uint8Array>> {
    validateObjectKey(key);
    try {
      const handle = await open(await this.objectPath(key), constants.O_RDONLY | constants.O_NOFOLLOW);
      const metadata = await handle.stat();
      if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_UPLOAD_BYTES) { await handle.close(); throw new StorageError("UNSUPPORTED_UPLOAD"); }
      // FileHandle owns the stream resource; only bounded chunks enter memory.
      let closed = false;
      const close = async () => { if (!closed) { closed = true; await handle.close(); } };
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = new Uint8Array(64 * 1024);
            const { bytesRead } = await handle.read(chunk);
            if (bytesRead === 0) { await close(); controller.close(); }
            else controller.enqueue(chunk.subarray(0, bytesRead));
          } catch { await close(); controller.error(new StorageError("STORAGE_FAILURE")); }
        },
        async cancel() { await close(); },
      });
    } catch (error) { if (missing(error)) throw new StorageError("UPLOAD_NOT_FOUND"); failure(error); }
  }

  async deleteObject(key: string): Promise<void> {
    validateObjectKey(key);
    try {
      const target = await this.objectPath(key);
      if (!(await lstat(target)).isFile()) throw new StorageError("UNSUPPORTED_UPLOAD");
      await unlink(target);
    } catch (error) { if (!missing(error)) failure(error); }
  }
}
