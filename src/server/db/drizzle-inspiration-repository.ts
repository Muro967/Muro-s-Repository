import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import {
  InspirationError,
  type CompletedInspirationUpload,
  type InspirationRepository,
} from "@/features/inspiration/inspiration-repository";
import type {
  EditableInspiration,
  EditableInspirationPatch,
  InspirationDetail,
} from "@/features/inspiration/inspiration-types";
import type { UploadContentType } from "@/features/storage/storage-provider";
import type { VerifiedImage } from "@/features/storage/verified-image";

import { inspirations, uploads, users } from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

type Transaction = Parameters<Parameters<PgliteAppDatabase["transaction"]>[0]>[0];
type InspirationRow = typeof inspirations.$inferSelect;

const uploadFields = {
  id: uploads.id,
  objectKey: uploads.objectKey,
  contentType: uploads.contentType,
  sizeBytes: uploads.sizeBytes,
  completedAt: uploads.completedAt,
};

const completedInspirationUpload = (userId: string) => and(
  eq(uploads.userId, userId),
  eq(uploads.kind, "inspiration"),
  eq(uploads.status, "completed"),
);

function publicDetail(row: InspirationRow): InspirationDetail {
  return {
    id: row.id,
    imageUrl: `/api/inspirations/${row.id}/image`,
    name: row.name,
    styleTags: row.styleTags,
    colorNames: row.colorNames,
    silhouettes: row.silhouettes,
    keyItems: row.keyItems,
    combinations: row.combinations,
    formality: row.formality,
    notes: row.notes,
    confirmedFields: row.confirmedFields,
    analysisStatus: row.analysisStatus,
    analysisSource: row.analysisSource,
    analysisErrorCode: row.analysisErrorCode,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return ("code" in error && error.code === "23505")
    || ("cause" in error && uniqueViolation(error.cause));
}

export class DrizzleInspirationRepository implements InspirationRepository {
  private readonly db: PgliteAppDatabase;

  constructor(database: AppDatabase) {
    this.db = database as PgliteAppDatabase;
  }

  private async write<T>(
    userId: string,
    action: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.transaction(async (transaction) => {
        const [user] = await transaction
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        if (!user) throw new InspirationError("NOT_FOUND");
        return action(transaction);
      });
    } catch (error) {
      if (error instanceof InspirationError) throw error;
      if (uniqueViolation(error)) throw new InspirationError("ASSET_CONFLICT");
      throw new Error("Inspiration persistence failed");
    }
  }

  async list(userId: string) {
    try {
      const rows = await this.db
        .select()
        .from(inspirations)
        .where(and(eq(inspirations.userId, userId), isNull(inspirations.deletedAt)))
        .orderBy(desc(inspirations.createdAt), desc(inspirations.id));
      return rows.map(publicDetail);
    } catch {
      throw new Error("Inspiration lookup failed");
    }
  }

  async find(userId: string, id: string) {
    try {
      const [row] = await this.db
        .select()
        .from(inspirations)
        .where(and(
          eq(inspirations.userId, userId),
          eq(inspirations.id, id),
          isNull(inspirations.deletedAt),
        ));
      return row ? publicDetail(row) : null;
    } catch {
      throw new Error("Inspiration lookup failed");
    }
  }

  async findCompletedUpload(
    userId: string,
    uploadId: string,
  ): Promise<CompletedInspirationUpload | null> {
    try {
      const [upload] = await this.db
        .select(uploadFields)
        .from(uploads)
        .where(and(
          eq(uploads.id, uploadId),
          completedInspirationUpload(userId),
        ));
      if (!upload?.completedAt) return null;
      return {
        id: upload.id,
        objectKey: upload.objectKey,
        contentType: upload.contentType as UploadContentType,
        sizeBytes: upload.sizeBytes,
      };
    } catch {
      throw new Error("Inspiration upload lookup failed");
    }
  }

  create(
    userId: string,
    uploadId: string,
    image: VerifiedImage,
    input: EditableInspiration,
  ) {
    return this.write(userId, async (transaction) => {
      const [upload] = await transaction
        .select()
        .from(uploads)
        .where(and(
          eq(uploads.id, uploadId),
          completedInspirationUpload(userId),
        ))
        .for("update");
      if (!upload?.completedAt) throw new InspirationError("NOT_FOUND");
      if (
        upload.id !== image.id
        || upload.objectKey !== image.objectKey
        || upload.contentType !== image.contentType
        || upload.sizeBytes !== image.sizeBytes
      ) {
        throw new InspirationError("ASSET_CONFLICT");
      }
      const [created] = await transaction
        .insert(inspirations)
        .values({ userId, uploadId, ...input })
        .returning();
      return publicDetail(created!);
    });
  }

  update(
    userId: string,
    id: string,
    expectedVersion: number,
    patch: EditableInspirationPatch,
  ) {
    return this.write(userId, async (transaction) => {
      const [row] = await transaction
        .select()
        .from(inspirations)
        .where(and(eq(inspirations.userId, userId), eq(inspirations.id, id)))
        .for("update");
      if (!row || row.deletedAt) throw new InspirationError("NOT_FOUND");
      if (row.version !== expectedVersion) throw new InspirationError("VERSION_CONFLICT");
      const [updated] = await transaction
        .update(inspirations)
        .set({
          ...patch,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(inspirations.userId, userId), eq(inspirations.id, id)))
        .returning();
      return publicDetail(updated!);
    });
  }

  softDelete(
    userId: string,
    id: string,
    expectedVersion: number,
    now: Date,
  ) {
    return this.write(userId, async (transaction) => {
      const [row] = await transaction
        .select()
        .from(inspirations)
        .where(and(eq(inspirations.userId, userId), eq(inspirations.id, id)))
        .for("update");
      if (!row) throw new InspirationError("NOT_FOUND");
      if (row.deletedAt) return;
      if (row.version !== expectedVersion) throw new InspirationError("VERSION_CONFLICT");
      await transaction
        .update(inspirations)
        .set({ deletedAt: now, version: row.version + 1, updatedAt: now })
        .where(and(eq(inspirations.userId, userId), eq(inspirations.id, id)));
    });
  }

  async findPrivateImage(
    userId: string,
    id: string,
  ): Promise<CompletedInspirationUpload | null> {
    try {
      const [upload] = await this.db
        .select(uploadFields)
        .from(inspirations)
        .innerJoin(uploads, and(
          eq(uploads.id, inspirations.uploadId),
          eq(uploads.userId, inspirations.userId),
        ))
        .where(and(
          eq(inspirations.userId, userId),
          eq(inspirations.id, id),
          isNull(inspirations.deletedAt),
          completedInspirationUpload(userId),
        ));
      if (!upload?.completedAt) return null;
      if (!["image/jpeg", "image/png", "image/webp"].includes(upload.contentType)) return null;
      return {
        id: upload.id,
        objectKey: upload.objectKey,
        contentType: upload.contentType as UploadContentType,
        sizeBytes: upload.sizeBytes,
      };
    } catch {
      throw new Error("Inspiration image lookup failed");
    }
  }
}
