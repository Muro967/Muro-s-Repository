import "server-only";

import { after } from "next/server";

import { createAnalysisHandler } from "@/features/ai/analysis-routes";
import { createAiProvider, readAiEnv } from "@/features/ai/ai-provider";
import { runInspirationAnalysisJob } from "@/features/ai/inspiration-analysis-job";
import { getProductionAuthRouteDependencies } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { DrizzleProcessingJobRepository } from "@/server/db/drizzle-processing-job-repository";
import { apiError } from "@/server/http/json";
import { createStorageProvider } from "@/server/storage";

function production() {
  const auth = getProductionAuthRouteDependencies();
  const provider = createAiProvider(readAiEnv());
  const repository = new DrizzleProcessingJobRepository(getDb());
  const storage = createStorageProvider();
  return { auth, provider, repository, storage };
}

export async function runProductionAnalysisJob(jobId: string) {
  const { auth, provider, repository, storage } = production();
  if (!provider) return;
  await runInspirationAnalysisJob(jobId, { repository, provider, storage, now: auth.now });
}

type Context = { params: Promise<{ inspirationId: string }> };
export function bindProductionAnalysisHandler() {
  return async (request: Request, context: Context) => {
    try {
      const { inspirationId } = await context.params;
      const { auth, provider, repository } = production();
      return createAnalysisHandler({
        appUrl: auth.appUrl,
        authRepository: auth.repository,
        now: auth.now,
        provider,
        repository,
        schedule: (jobId) => after(() => runProductionAnalysisJob(jobId)),
      })(request, inspirationId);
    } catch {
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };
}
