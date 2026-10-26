import "server-only";

import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

import { mergeAnalysis } from "@/features/inspiration/inspiration-analysis";
import type { InspirationAnalysis, InspirationAnalysisSource } from "@/features/inspiration/inspiration-types";
import {
  ProcessingJobError,
  type ProcessingJob,
  type ProcessingJobRepository,
} from "@/features/ai/processing-job-repository";
import type { UploadContentType } from "@/features/storage/storage-provider";

import { inspirations, processingJobs, uploads } from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

type JobRow = typeof processingJobs.$inferSelect;

function publicJob(row: JobRow): ProcessingJob {
  return { id: row.id, userId: row.userId, targetInspirationId: row.targetInspirationId, inputVersion: row.inputVersion, status: row.status, attempts: row.attempts };
}

export class DrizzleProcessingJobRepository implements ProcessingJobRepository {
  private readonly db: PgliteAppDatabase;
  constructor(database: AppDatabase) { this.db = database as PgliteAppDatabase; }

  enqueue(userId: string, inspirationId: string, source: InspirationAnalysisSource, now: Date) {
    return this.db.transaction(async (transaction) => {
      const [target] = await transaction.select().from(inspirations).where(and(
        eq(inspirations.userId, userId), eq(inspirations.id, inspirationId), isNull(inspirations.deletedAt),
      )).for("update");
      if (!target) throw new ProcessingJobError("NOT_FOUND");
      const [existing] = await transaction.select().from(processingJobs).where(and(
        eq(processingJobs.userId, userId), eq(processingJobs.targetInspirationId, inspirationId),
        eq(processingJobs.inputVersion, target.version), or(eq(processingJobs.status, "queued"), eq(processingJobs.status, "running")),
      ));
      if (existing) return publicJob(existing);
      const [created] = await transaction.insert(processingJobs).values({
        userId, targetInspirationId: inspirationId, type: "inspiration-analysis", inputVersion: target.version,
      }).returning();
      await transaction.update(inspirations).set({ analysisStatus: "queued", analysisSource: source, analysisErrorCode: null, updatedAt: now })
        .where(and(eq(inspirations.userId, userId), eq(inspirations.id, inspirationId)));
      return publicJob(created!);
    });
  }

  async claim(jobId: string, now: Date) {
    const lease = new Date(now.getTime() + 60_000);
    return this.db.transaction(async (transaction) => {
      const [claimed] = await transaction.update(processingJobs).set({
        status: "running", attempts: sql`${processingJobs.attempts} + 1`, leaseExpiresAt: lease, nextAttemptAt: null, updatedAt: now,
      }).where(and(
        eq(processingJobs.id, jobId),
        lte(processingJobs.attempts, 1),
        or(
          and(eq(processingJobs.status, "queued"), or(isNull(processingJobs.nextAttemptAt), lte(processingJobs.nextAttemptAt, now))),
          and(eq(processingJobs.status, "running"), lte(processingJobs.leaseExpiresAt, now)),
        ),
      )).returning();
      if (!claimed) return null;
      const [record] = await transaction.select({ inspiration: inspirations, upload: uploads }).from(inspirations)
        .innerJoin(uploads, and(eq(uploads.id, inspirations.uploadId), eq(uploads.userId, inspirations.userId)))
        .where(and(eq(inspirations.userId, claimed.userId), eq(inspirations.id, claimed.targetInspirationId), isNull(inspirations.deletedAt)));
      if (!record || record.upload.status !== "completed" || !record.upload.completedAt) throw new ProcessingJobError("NOT_FOUND");
      await transaction.update(inspirations).set({ analysisStatus: "running", updatedAt: now })
        .where(and(eq(inspirations.userId, claimed.userId), eq(inspirations.id, claimed.targetInspirationId)));
      return {
        ...publicJob(claimed),
        status: "running" as const,
        upload: { id: record.upload.id, objectKey: record.upload.objectKey, contentType: record.upload.contentType as UploadContentType, sizeBytes: record.upload.sizeBytes },
        target: {
          styleTags: record.inspiration.styleTags, colorNames: record.inspiration.colorNames, silhouettes: record.inspiration.silhouettes,
          keyItems: record.inspiration.keyItems, combinations: record.inspiration.combinations, formality: record.inspiration.formality,
          confirmedFields: record.inspiration.confirmedFields, version: record.inspiration.version,
        },
      };
    });
  }

  succeed(jobId: string, source: InspirationAnalysisSource, analysis: InspirationAnalysis, now: Date) {
    return this.db.transaction(async (transaction) => {
      const [job] = await transaction.select().from(processingJobs).where(eq(processingJobs.id, jobId)).for("update");
      if (!job || job.status !== "running") throw new ProcessingJobError("INVALID_STATE");
      const [target] = await transaction.select().from(inspirations).where(and(eq(inspirations.userId, job.userId), eq(inspirations.id, job.targetInspirationId))).for("update");
      if (!target || target.deletedAt) throw new ProcessingJobError("NOT_FOUND");
      const merged = mergeAnalysis({
        styleTags: target.styleTags, colorNames: target.colorNames, silhouettes: target.silhouettes, keyItems: target.keyItems,
        combinations: target.combinations, formality: target.formality, confirmedFields: target.confirmedFields, version: target.version,
      }, analysis, job.inputVersion);
      await transaction.update(inspirations).set({
        ...(merged.applied ? {
          styleTags: merged.styleTags, colorNames: merged.colorNames, silhouettes: merged.silhouettes,
          keyItems: merged.keyItems, combinations: merged.combinations, formality: merged.formality, version: merged.version,
        } : {}),
        analysisStatus: "ready", analysisSource: source, analysisErrorCode: null, updatedAt: now,
      }).where(and(eq(inspirations.userId, job.userId), eq(inspirations.id, job.targetInspirationId)));
      await transaction.update(processingJobs).set({ status: "succeeded", leaseExpiresAt: null, errorCode: null, updatedAt: now }).where(eq(processingJobs.id, jobId));
    });
  }

  fail(jobId: string, errorCode: string, now: Date) {
    return this.db.transaction(async (transaction) => {
      const [job] = await transaction.select().from(processingJobs).where(eq(processingJobs.id, jobId)).for("update");
      if (!job || job.status !== "running") throw new ProcessingJobError("INVALID_STATE");
      const failed = job.attempts >= 2;
      await transaction.update(processingJobs).set({
        status: failed ? "failed" : "queued", leaseExpiresAt: null, nextAttemptAt: failed ? null : now, errorCode, updatedAt: now,
      }).where(eq(processingJobs.id, jobId));
      await transaction.update(inspirations).set({ analysisStatus: failed ? "failed" : "queued", analysisErrorCode: errorCode, updatedAt: now })
        .where(and(eq(inspirations.userId, job.userId), eq(inspirations.id, job.targetInspirationId)));
      return failed ? "failed" as const : "retry" as const;
    });
  }
}
