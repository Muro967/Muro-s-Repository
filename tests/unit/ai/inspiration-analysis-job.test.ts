// @vitest-environment node

import sharp from "sharp";

import { runInspirationAnalysisJob } from "@/features/ai/inspiration-analysis-job";
import type { AiProvider } from "@/features/ai/ai-types";
import type { ProcessingJobRepository } from "@/features/ai/processing-job-repository";
import { FakeStorageProvider } from "../../helpers/fake-storage-provider";

vi.mock("server-only", () => ({}));

test("verifies the private image, analyzes it and marks the job successful", async () => {
  const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: "gray" } }).jpeg().toBuffer();
  const storage = new FakeStorageProvider();
  storage.objects.set("private/image", bytes);
  const claim = {
    id: "40000000-0000-4000-8000-000000000001", userId: "u", targetInspirationId: "i", inputVersion: 1,
    status: "running" as const, attempts: 1,
    upload: { id: "20000000-0000-4000-8000-000000000001", objectKey: "private/image", contentType: "image/jpeg" as const, sizeBytes: bytes.length },
    target: { styleTags: [], colorNames: [], silhouettes: [], keyItems: [], combinations: [], formality: null, confirmedFields: [], version: 1 },
  };
  const analysis = { styleTags: ["极简"], colorNames: ["米白"], silhouettes: [], keyItems: [], combinations: [], formality: null };
  const repository: ProcessingJobRepository = {
    enqueue: vi.fn(), claim: vi.fn().mockResolvedValueOnce(claim), succeed: vi.fn(), fail: vi.fn(),
  };
  const provider: AiProvider = { kind: "openai", analyzeInspiration: vi.fn(async () => analysis), suggestStyleProfile: vi.fn(), recreate: vi.fn() };
  await runInspirationAnalysisJob(claim.id, { repository, provider, storage, now: () => new Date("2026-10-20") });
  expect(provider.analyzeInspiration).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "image/jpeg" }));
  expect(repository.succeed).toHaveBeenCalledWith(claim.id, "openai", analysis, expect.any(Date));
});

test("retries once and then records a safe failure code", async () => {
  const repository: ProcessingJobRepository = {
    enqueue: vi.fn(),
    claim: vi.fn(async () => ({ id: "j", userId: "u", targetInspirationId: "i", inputVersion: 1, status: "running" as const, attempts: 1, upload: { id: "x", objectKey: "missing", contentType: "image/jpeg" as const, sizeBytes: 1 }, target: { styleTags: [], colorNames: [], silhouettes: [], keyItems: [], combinations: [], formality: null, confirmedFields: [], version: 1 } })),
    succeed: vi.fn(), fail: vi.fn().mockResolvedValueOnce("retry").mockResolvedValueOnce("failed"),
  };
  const provider: AiProvider = { kind: "qwen", analyzeInspiration: vi.fn(), suggestStyleProfile: vi.fn(), recreate: vi.fn() };
  await runInspirationAnalysisJob("j", { repository, provider, storage: new FakeStorageProvider(), now: () => new Date() });
  expect(repository.claim).toHaveBeenCalledTimes(2);
  expect(repository.fail).toHaveBeenNthCalledWith(2, "j", "AI_UNAVAILABLE", expect.any(Date));
});
