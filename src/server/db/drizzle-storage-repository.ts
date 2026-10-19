import "server-only";
import { and, eq } from "drizzle-orm";
import type { StorageRepository, UploadRecord } from "../../features/storage/storage-repository";
import { parseObjectKey, StorageError, validateObjectMetadata } from "../../features/storage/storage-provider";
import { uploads } from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

export class DrizzleStorageRepository implements StorageRepository {
  private readonly db: PgliteAppDatabase;
  constructor(database: AppDatabase) { this.db = database as unknown as PgliteAppDatabase; }
  async create(record: UploadRecord): Promise<void> {
    validateObjectMetadata(record.objectKey, record.sizeBytes, record.contentType);
    if (!record.objectKey.startsWith(`users/${record.userId}/`) || record.status !== "pending") throw new StorageError("UNSUPPORTED_UPLOAD");
    const { kind } = parseObjectKey(record.objectKey, record.contentType);
    try { await this.db.insert(uploads).values({ ...record, kind }); }
    catch { throw new StorageError("STORAGE_FAILURE"); }
  }
  async findOwned(uploadId: string, userId: string): Promise<UploadRecord | null> {
    try {
      const [record] = await this.db.select().from(uploads).where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId))).limit(1);
      if (!record) return null;
      validateObjectMetadata(record.objectKey, record.sizeBytes, record.contentType);
      if (record.status !== "pending" && record.status !== "completed") throw new StorageError("STORAGE_FAILURE");
      return record as UploadRecord;
    } catch { throw new StorageError("STORAGE_FAILURE"); }
  }
  async completePending(uploadId: string, userId: string, now: Date): Promise<boolean> {
    try {
      const changed = await this.db.update(uploads).set({ status: "completed", completedAt: now })
        .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId), eq(uploads.status, "pending")))
        .returning({ id: uploads.id });
      return changed.length === 1;
    } catch { throw new StorageError("STORAGE_FAILURE"); }
  }
}
