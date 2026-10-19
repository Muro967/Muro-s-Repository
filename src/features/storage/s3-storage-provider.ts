import "server-only";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { MAX_UPLOAD_BYTES, StorageError, validateObjectKey, validateObjectMetadata, validateUploadTarget, type StorageProvider, type UploadContentType, type UploadTargetInput } from "./storage-provider";

const configurationSchema = z.object({
  endpoint: z.string().url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  }).optional(),
  region: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  accessKeyId: z.string().min(1).max(256),
  secretAccessKey: z.string().min(1).max(256),
});
export type S3StorageConfiguration = z.infer<typeof configurationSchema>;
function notFound(error: unknown): boolean {
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value?.name === "NoSuchKey" || value?.name === "NotFound" || value?.$metadata?.httpStatusCode === 404;
}
function contentType(value: string | undefined): value is UploadContentType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(configuration: S3StorageConfiguration) {
    const parsed = configurationSchema.safeParse(configuration);
    if (!parsed.success) throw new Error("Invalid storage configuration");
    const config = parsed.data;
    this.bucket = config.bucket;
    this.client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: Boolean(config.endpoint),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  }
  async createUploadTarget(input: UploadTargetInput) {
    validateUploadTarget(input);
    try {
      // S3 objects are private by default; no public ACL or public object URL is created.
      const command = new PutObjectCommand({ Bucket: this.bucket, Key: input.objectKey,
        ContentType: input.contentType, ContentLength: input.sizeBytes, IfNoneMatch: "*" });
      const url = await getSignedUrl(this.client, command, { expiresIn: 300,
        signableHeaders: new Set(["content-type", "content-length", "if-none-match"]) });
      return { method: "PUT" as const, url, headers: { "content-type": input.contentType, "content-length": String(input.sizeBytes), "if-none-match": "*" } };
    } catch { throw new StorageError("STORAGE_FAILURE"); }
  }
  async verifyObject(key: string, size: number, expectedType?: UploadContentType): Promise<boolean> {
    validateObjectMetadata(key, size, expectedType);
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      try { validateObjectKey(key, result.ContentType); } catch { return false; }
      return result.ContentLength === size && contentType(result.ContentType) && (expectedType === undefined || result.ContentType === expectedType);
    } catch (error) { if (notFound(error)) return false; throw new StorageError("STORAGE_FAILURE"); }
  }
  async openObject(key: string): Promise<ReadableStream<Uint8Array>> {
    validateObjectKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      let validType = contentType(result.ContentType);
      try { validateObjectKey(key, result.ContentType); } catch { validType = false; }
      if (!validType || !Number.isSafeInteger(result.ContentLength) || result.ContentLength === undefined || result.ContentLength <= 0 || result.ContentLength > MAX_UPLOAD_BYTES || !result.Body) {
        await result.Body?.transformToWebStream().cancel();
        throw new StorageError("STORAGE_FAILURE");
      }
      const reader = result.Body.transformToWebStream().getReader();
      const expectedSize = result.ContentLength;
      let total = 0;
      let released = false;
      const release = () => { if (!released) { released = true; reader.releaseLock(); } };
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              if (total !== expectedSize) throw new StorageError("STORAGE_FAILURE");
              release(); controller.close(); return;
            }
            total += value.byteLength;
            if (total > expectedSize) throw new StorageError("STORAGE_FAILURE");
            controller.enqueue(value);
          } catch {
            await reader.cancel().catch(() => {}); release();
            controller.error(new StorageError("STORAGE_FAILURE"));
          }
        },
        async cancel() { await reader.cancel().catch(() => {}); release(); },
      });
    } catch (error) { if (notFound(error)) throw new StorageError("UPLOAD_NOT_FOUND"); throw new StorageError("STORAGE_FAILURE"); }
  }
  async deleteObject(key: string): Promise<void> {
    validateObjectKey(key);
    try { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
    catch (error) { if (!notFound(error)) throw new StorageError("STORAGE_FAILURE"); }
  }
}
