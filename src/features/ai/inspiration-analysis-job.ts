import type { StorageProvider } from "../storage/storage-provider";
import { verifyCompletedImage } from "../storage/verified-image";
import { AiError, type AiProvider } from "./ai-types";
import type { ProcessingJobRepository } from "./processing-job-repository";

async function imageBytes(objectKey: string, expectedSize: number, storage: StorageProvider) {
  const reader = (await storage.openObject(objectKey)).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > expectedSize) throw new AiError("AI_UNAVAILABLE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (size !== expectedSize) throw new AiError("AI_UNAVAILABLE");
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function runInspirationAnalysisJob(jobId: string, dependencies: {
  repository: ProcessingJobRepository;
  provider: AiProvider;
  storage: StorageProvider;
  now: () => Date;
}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const claim = await dependencies.repository.claim(jobId, dependencies.now());
    if (!claim) return;
    try {
      await verifyCompletedImage(claim.upload, dependencies.storage);
      const image = await imageBytes(claim.upload.objectKey, claim.upload.sizeBytes, dependencies.storage);
      const analysis = await dependencies.provider.analyzeInspiration({ image, mimeType: claim.upload.contentType });
      await dependencies.repository.succeed(jobId, dependencies.provider.kind, analysis, dependencies.now());
      return;
    } catch (error) {
      const code = error instanceof AiError ? error.code : "AI_UNAVAILABLE";
      const state = await dependencies.repository.fail(jobId, code, dependencies.now());
      if (state === "failed") return;
    }
  }
}
