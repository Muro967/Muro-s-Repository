import { z } from "zod";

import { AiError } from "./ai-types";

export type ProviderConfig = { kind: "openai" | "qwen"; model: string; apiKey: string; baseUrl: string };
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function endpoint(config: ProviderConfig, suffix: string) {
  const url = new URL(`${config.baseUrl.replace(/\/$/, "")}/${suffix}`);
  const base = new URL(config.baseUrl);
  if (url.protocol !== "https:" || url.origin !== base.origin || url.username || url.password) throw new AiError("AI_UNAVAILABLE");
  return url.toString();
}

function safeError(status: number) {
  if (status === 429) return new AiError("AI_RATE_LIMITED");
  return new AiError("AI_UNAVAILABLE");
}

export async function postJson(config: ProviderConfig, url: string, body: unknown, request: FetchLike) {
  let response: Response;
  try {
    response = await request(url, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new AiError("AI_TIMEOUT");
    throw new AiError("AI_UNAVAILABLE");
  }
  if (!response.ok) throw safeError(response.status);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 1_000_000) throw new AiError("AI_INVALID_RESPONSE");
  const text = await response.text();
  if (text.length > 1_000_000) throw new AiError("AI_INVALID_RESPONSE");
  try { return JSON.parse(text) as unknown; }
  catch { throw new AiError("AI_INVALID_RESPONSE"); }
}

export async function parseWithOneRepair<T>(schema: z.ZodType<T>, call: (repair: boolean) => Promise<string>): Promise<T> {
  for (const repair of [false, true]) {
    try {
      const parsed = schema.safeParse(JSON.parse(await call(repair)));
      if (parsed.success) return parsed.data;
    } catch (error) {
      if (error instanceof AiError && error.code !== "AI_INVALID_RESPONSE") throw error;
    }
  }
  throw new AiError("AI_INVALID_RESPONSE");
}
