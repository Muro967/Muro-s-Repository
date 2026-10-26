import type { InspirationAnalysis, InspirationAnalysisTarget, InspirationAnalysisSource } from "../inspiration/inspiration-types";
import type { CompletedImageUpload } from "../storage/verified-image";

export type ProcessingJob = {
  id: string;
  userId: string;
  targetInspirationId: string;
  inputVersion: number;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
};

export type AnalysisJobClaim = ProcessingJob & {
  status: "running";
  upload: CompletedImageUpload;
  target: InspirationAnalysisTarget;
};

export class ProcessingJobError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_STATE") {
    super(code);
    this.name = "ProcessingJobError";
  }
}

export interface ProcessingJobRepository {
  enqueue(userId: string, inspirationId: string, source: InspirationAnalysisSource, now: Date): Promise<ProcessingJob>;
  claim(jobId: string, now: Date): Promise<AnalysisJobClaim | null>;
  succeed(jobId: string, source: InspirationAnalysisSource, analysis: InspirationAnalysis, now: Date): Promise<void>;
  fail(jobId: string, errorCode: string, now: Date): Promise<"retry" | "failed">;
}
