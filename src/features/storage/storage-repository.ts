import type { UploadContentType } from "./storage-provider";

export type UploadRecord = {
  id: string; userId: string; objectKey: string; contentType: UploadContentType;
  sizeBytes: number; status: "pending" | "completed"; createdAt: Date; completedAt: Date | null;
};
export interface StorageRepository {
  create(upload: UploadRecord): Promise<void>;
  findOwned(uploadId: string, userId: string): Promise<UploadRecord | null>;
  completePending(uploadId: string, userId: string, now: Date): Promise<boolean>;
}
