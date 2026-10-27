// @vitest-environment node

import { createAnalysisHandler } from "@/features/ai/analysis-routes";
import type { AiProvider } from "@/features/ai/ai-types";
import type { ProcessingJobRepository } from "@/features/ai/processing-job-repository";
import { hashInviteCode } from "@/features/auth/crypto";
import { jsonRequest } from "../../helpers/http-request";
import { testAuthRouteDeps } from "../../helpers/test-auth-route-deps";

vi.mock("server-only", () => ({}));

const inspirationId = "10000000-0000-4000-8000-000000000001";

test("returns 202 only for configured, authenticated, same-origin analysis", async () => {
  const auth = testAuthRouteDeps();
  const registered = await auth.repository.register({ inviteHash: hashInviteCode(auth.inviteCode, auth.invitePepper), email: "a@example.com", passwordHash: "hash", name: "A", sessionHash: "unused", sessionExpiresAt: new Date("2030-01-01"), now: auth.now() });
  const token = auth.createSessionToken();
  // Use the repository's normal auth registration path to obtain a valid session token hash.
  const { hashSessionToken } = await import("@/features/auth/crypto");
  await auth.repository.createSession(registered.id, hashSessionToken(token), new Date("2030-01-01"));
  const job = { id: "40000000-0000-4000-8000-000000000001", userId: registered.id, targetInspirationId: inspirationId, inputVersion: 1, status: "queued" as const, attempts: 0 };
  const repository: ProcessingJobRepository = { enqueue: vi.fn(async () => job), claim: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
  const provider: AiProvider = { kind: "openai", analyzeInspiration: vi.fn(), suggestStyleProfile: vi.fn(), recreate: vi.fn() };
  const schedule = vi.fn();
  const handler = createAnalysisHandler({ appUrl: auth.appUrl, authRepository: auth.repository, now: auth.now, provider, repository, schedule });
  const request = jsonRequest(`/api/inspirations/${inspirationId}/analysis`, {});
  request.headers.set("cookie", `aiw_session=${token}`);
  const response = await handler(request, inspirationId);
  expect(response.status).toBe(202);
  expect(schedule).toHaveBeenCalledWith(job.id);

  const unavailable = createAnalysisHandler({ appUrl: auth.appUrl, authRepository: auth.repository, now: auth.now, provider: null, repository, schedule });
  const retry = jsonRequest(`/api/inspirations/${inspirationId}/analysis`, {}); retry.headers.set("cookie", `aiw_session=${token}`);
  expect((await unavailable(retry, inspirationId)).status).toBe(503);
});
