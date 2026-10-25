import { z } from "zod";

const targetSchema = z.object({ uploadId: z.uuid(), method: z.literal("PUT"), url: z.string().min(1), headers: z.record(z.string(), z.string()) });
export type UploadSession = { target: z.infer<typeof targetSchema>; stage: "put" | "complete" | "done" };
export type UploadCallbacks = { signal?: AbortSignal; session?: UploadSession; onSession?: (session: UploadSession) => void };
export class ItemClientError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    super(code === "UNAUTHORIZED" ? "登录已过期，请重新登录后重试。" : code === "INVALID_IMAGE" ? "照片无法读取，请选择完整的 JPEG、PNG 或 WebP 照片。" : code === "INVALID_INPUT" ? "请检查填写的资料与日期，再试一次。" : code === "ITEM_INCOMPLETE" ? "资料尚不完整，请检查名称、分类、颜色、照片与位置。" : "暂时无法完成，请检查网络后重试。");
  }
}
export async function itemRequest<T>(path: string, method: string, schema: z.ZodType<T>, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", signal, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  let data: unknown;
  try { data = await response.json(); } catch { throw new ItemClientError("INVALID_RESPONSE", response.status); }
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(data);
    throw new ItemClientError(error.success ? error.data.error.code : "INVALID_RESPONSE", response.status);
  }
  const result = schema.safeParse(data);
  if (!result.success) throw new ItemClientError("INVALID_RESPONSE");
  return result.data;
}

/** The caller keeps the session for this File, so a retry resumes the same upload. */
export async function uploadPrivateImage(
  file: File,
  kind: "wardrobe-original" | "inspiration",
  callbacks: UploadCallbacks = {},
): Promise<{ uploadId: string }> {
  const { signal, onSession } = callbacks;
  let session = callbacks.session;
  if (!session) {
    const target = await itemRequest("/api/uploads", "POST", targetSchema, { kind, contentType: file.type, sizeBytes: file.size }, signal);
    session = { target, stage: "put" }; onSession?.(session);
  }
  const { target } = session;
  const url = new URL(target.url, window.location.href);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new ItemClientError("INVALID_RESPONSE");
  if (session.stage === "put") {
    const headers = new Headers();
    for (const [name, value] of Object.entries(target.headers)) {
      if (!["content-length", "cookie", "host", "origin"].includes(name.toLowerCase())) headers.set(name, value);
    }
    const response = await fetch(target.url, { method: "PUT", headers, body: file, signal, credentials: url.origin === window.location.origin ? "same-origin" : "omit" });
    // A lost successful PUT can return a write-once conflict on retry. Complete
    // verifies the stored object's size/type before accepting it.
    if (!response.ok && ![409, 412].includes(response.status)) throw new ItemClientError("UPLOAD_FAILED", response.status);
    session = { target, stage: "complete" }; onSession?.(session);
  }
  if (session.stage !== "done") {
    await itemRequest(`/api/uploads/${target.uploadId}/complete`, "POST", z.object({ uploadId: z.literal(target.uploadId), status: z.literal("completed") }), {}, signal);
    onSession?.({ target, stage: "done" });
  }
  return { uploadId: target.uploadId };
}

export function uploadOriginal(file: File, callbacks: UploadCallbacks = {}) {
  return uploadPrivateImage(file, "wardrobe-original", callbacks);
}
