import { z } from "zod";

import {
  inspirationAnalysisSources,
  inspirationAnalysisStatuses,
  inspirationFields,
  type EditableInspiration,
  type EditableInspirationPatch,
  type InspirationDetail,
} from "./inspiration-types";

const inspirationSchema = z.strictObject({
  id: z.uuid(),
  imageUrl: z.string().regex(/^\/api\/inspirations\/[0-9a-f-]+\/image$/),
  name: z.string(),
  styleTags: z.array(z.string()),
  colorNames: z.array(z.string()),
  silhouettes: z.array(z.string()),
  keyItems: z.array(z.string()),
  combinations: z.array(z.string()),
  formality: z.string().nullable(),
  notes: z.string().nullable(),
  confirmedFields: z.array(z.enum(inspirationFields)),
  analysisStatus: z.enum(inspirationAnalysisStatuses),
  analysisSource: z.enum(inspirationAnalysisSources).nullable(),
  analysisErrorCode: z.string().nullable(),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export class InspirationClientError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    super(
      code === "UNAUTHORIZED"
        ? "登录已过期，请重新登录。"
        : code === "VERSION_CONFLICT"
          ? "这张灵感已在别处更新，请重新加载后再保存。"
          : code === "INVALID_IMAGE"
            ? "照片无法读取，请换一张完整的 JPEG、PNG 或 WebP 图片。"
            : code === "INVALID_INPUT"
              ? "请检查填写内容后再保存。"
              : code === "ASSET_CONFLICT"
                ? "这张照片已经保存为灵感。"
                : "暂时无法完成，请检查网络后重试。",
    );
    this.name = "InspirationClientError";
  }
}

async function request<T>(
  path: string,
  method: string,
  schema: z.ZodType<T>,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new InspirationClientError("INVALID_RESPONSE", response.status);
  }
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(data);
    throw new InspirationClientError(
      parsed.success ? parsed.data.error.code : "INVALID_RESPONSE",
      response.status,
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new InspirationClientError("INVALID_RESPONSE");
  return parsed.data;
}

export type InspirationClient = {
  list(signal?: AbortSignal): Promise<InspirationDetail[]>;
  read(id: string, signal?: AbortSignal): Promise<InspirationDetail>;
  create(
    input: EditableInspiration & { uploadId: string },
    signal?: AbortSignal,
  ): Promise<InspirationDetail>;
  update(
    id: string,
    input: EditableInspirationPatch & { expectedVersion: number },
    signal?: AbortSignal,
  ): Promise<InspirationDetail>;
  remove(id: string, expectedVersion: number, signal?: AbortSignal): Promise<void>;
  aiStatus(signal?: AbortSignal): Promise<{ available: boolean; label: string }>;
  analyze(id: string, signal?: AbortSignal): Promise<{ jobId: string; status: "queued" }>;
};

export const inspirationClient: InspirationClient = {
  async list(signal) {
    return (await request(
      "/api/inspirations",
      "GET",
      z.strictObject({ inspirations: z.array(inspirationSchema) }),
      undefined,
      signal,
    )).inspirations;
  },
  async read(id, signal) {
    return (await request(
      `/api/inspirations/${encodeURIComponent(id)}`,
      "GET",
      z.strictObject({ inspiration: inspirationSchema }),
      undefined,
      signal,
    )).inspiration;
  },
  async create(input, signal) {
    return (await request(
      "/api/inspirations",
      "POST",
      z.strictObject({ inspiration: inspirationSchema }),
      input,
      signal,
    )).inspiration;
  },
  async update(id, input, signal) {
    return (await request(
      `/api/inspirations/${encodeURIComponent(id)}`,
      "PATCH",
      z.strictObject({ inspiration: inspirationSchema }),
      input,
      signal,
    )).inspiration;
  },
  async remove(id, expectedVersion, signal) {
    await request(
      `/api/inspirations/${encodeURIComponent(id)}`,
      "DELETE",
      z.strictObject({ ok: z.literal(true) }),
      { expectedVersion },
      signal,
    );
  },
  async aiStatus(signal) {
    return request(
      "/api/ai/status",
      "GET",
      z.strictObject({ available: z.boolean(), label: z.string() }),
      undefined,
      signal,
    );
  },
  async analyze(id, signal) {
    return request(
      `/api/inspirations/${encodeURIComponent(id)}/analysis`,
      "POST",
      z.strictObject({ jobId: z.uuid(), status: z.literal("queued") }),
      {},
      signal,
    );
  },
};
