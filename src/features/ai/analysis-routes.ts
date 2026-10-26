import "server-only";

import type { AuthRepository } from "../auth/auth-repository";
import { readSession } from "../auth/auth-service";
import { requestSessionToken } from "../auth/session-cookie";
import { apiError, jsonResponse, readJsonBody } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";
import type { AiProvider } from "./ai-types";
import { ProcessingJobError, type ProcessingJobRepository } from "./processing-job-repository";

export function createAnalysisHandler(dependencies: {
  appUrl: string;
  authRepository: AuthRepository;
  now: () => Date;
  provider: AiProvider | null;
  repository: ProcessingJobRepository;
  schedule: (jobId: string) => void;
}) {
  return async (request: Request, inspirationId: string) => {
    try { assertSameOrigin(request, dependencies.appUrl); }
    catch { return apiError("ORIGIN_MISMATCH", 403, "Request origin is not allowed."); }
    try {
      const token = requestSessionToken(request);
      const user = token ? await readSession(token, dependencies.authRepository, dependencies.now()) : null;
      if (!user) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
      const body = await readJsonBody(request);
      if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value) || Object.keys(body.value).length > 0) {
        return apiError("INVALID_INPUT", 400, "An empty JSON object is required.");
      }
      if (!dependencies.provider) return apiError("AI_UNAVAILABLE", 503, "AI analysis is not configured.");
      const job = await dependencies.repository.enqueue(user.id, inspirationId, dependencies.provider.kind, dependencies.now());
      dependencies.schedule(job.id);
      return jsonResponse({ jobId: job.id, status: "queued" }, 202);
    } catch (error) {
      if (error instanceof ProcessingJobError && error.code === "NOT_FOUND") return apiError("NOT_FOUND", 404, "The inspiration was not found.");
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };
}
