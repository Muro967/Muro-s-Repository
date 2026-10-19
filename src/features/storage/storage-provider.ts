import { z } from "zod";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const uploadSchema = z.object({
  kind: z.enum(["wardrobe-original", "inspiration", "wear-photo"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
}).strict();
export type UploadKind = z.infer<typeof uploadSchema>["kind"];
export type UploadContentType = z.infer<typeof uploadSchema>["contentType"];
export type UploadInput = z.infer<typeof uploadSchema>;
export type UploadTarget = { method: "PUT"; url: string; headers: Record<string, string> };
export type UploadTargetInput = { uploadId: string; objectKey: string; contentType: UploadContentType; sizeBytes: number };
export type StorageErrorCode = "UNSUPPORTED_UPLOAD" | "UPLOAD_NOT_FOUND" | "UPLOAD_INCOMPLETE" | "UPLOAD_SIZE_MISMATCH" | "UPLOAD_CONFLICT" | "STORAGE_FAILURE";
export class StorageError extends Error {
  constructor(public readonly code: StorageErrorCode) { super(code); this.name = "StorageError"; }
}
export const uploadIdSchema = z.uuid();
export const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const objectKeyPattern = /^users\/([a-zA-Z0-9_-]{1,128})\/(wardrobe-original|inspiration|wear-photo)\/(\d{4})\/(0[1-9]|1[0-2])\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/;

export function parseObjectKey(objectKey: string, contentType?: string): { userId: string; kind: UploadKind } {
  const matched = objectKeyPattern.exec(objectKey);
  if (!matched || (contentType !== undefined && extensions[contentType as UploadContentType] !== matched[6])) {
    throw new StorageError("UNSUPPORTED_UPLOAD");
  }
  return { userId: matched[1], kind: matched[2] as UploadKind };
}
export function validateObjectKey(objectKey: string, contentType?: string): void {
  parseObjectKey(objectKey, contentType);
}
export function validateObjectMetadata(objectKey: string, sizeBytes: number, contentType?: string): void {
  validateObjectKey(objectKey, contentType);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) throw new StorageError("UNSUPPORTED_UPLOAD");
}
export function validateUploadTarget(input: UploadTargetInput): void {
  validateObjectMetadata(input.objectKey, input.sizeBytes, input.contentType);
  if (!uploadIdSchema.safeParse(input.uploadId).success) throw new StorageError("UNSUPPORTED_UPLOAD");
}

export interface StorageProvider {
  createUploadTarget(input: UploadTargetInput): Promise<UploadTarget>;
  verifyObject(objectKey: string, expectedSizeBytes: number, expectedContentType?: UploadContentType): Promise<boolean>;
  openObject(objectKey: string): Promise<ReadableStream<Uint8Array>>;
  deleteObject(objectKey: string): Promise<void>;
}
