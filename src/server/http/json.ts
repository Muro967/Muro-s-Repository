import { z } from "zod";

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "INVALID_STATE"
  | "INVALID_INVITE"
  | "EMAIL_IN_USE"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "ORIGIN_MISMATCH"
  | "UNSUPPORTED_UPLOAD"
  | "UPLOAD_NOT_FOUND"
  | "UPLOAD_INCOMPLETE"
  | "UPLOAD_SIZE_MISMATCH"
  | "UPLOAD_CONFLICT"
  | "NOT_FOUND"
  | "LOCATION_REQUIRED"
  | "LAST_WARDROBE"
  | "ITEM_INCOMPLETE"
  | "ITEM_NOT_EDITABLE"
  | "INVALID_IMAGE"
  | "ASSET_CONFLICT"
  | "VERSION_CONFLICT"
  | "CANDIDATES_CHANGED"
  | "AI_UNAVAILABLE"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_INVALID_RESPONSE"
  | "RESTORE_EXPIRED"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
};

const maxJsonBytes = 16 * 1024;

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function apiError(
  code: ApiErrorCode,
  status: number,
  message: string,
  fields?: Record<string, string>,
  headers?: HeadersInit,
): Response {
  const error: ApiErrorBody["error"] = { code, message };
  if (fields && Object.keys(fields).length > 0) error.fields = fields;
  return jsonResponse({ error }, status, headers);
}

export async function readJsonBody(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false }
> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return { ok: false };
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxJsonBytes)) {
    return { ok: false };
  }
  if (!request.body || request.bodyUsed || request.body.locked) return { ok: false };
  const reader = request.body.getReader();
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let rawBody = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxJsonBytes) {
        await reader.cancel();
        return { ok: false };
      }
      rawBody += decoder.decode(value, { stream: true });
    }
    rawBody += decoder.decode();
    return { ok: true, value: JSON.parse(rawBody) as unknown };
  } catch {
    await reader.cancel().catch(() => {});
    return { ok: false };
  } finally {
    reader.releaseLock();
  }
}

export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.length === 0 ? "_form" : issue.path.join(".");
    // Zod's default unrecognized-key messages contain attacker-controlled keys.
    fields[path] ??= issue.code === "unrecognized_keys" ? "Unexpected fields are not allowed." : "Invalid value.";
  }
  return fields;
}
