import type { AiProvider } from "./ai-types";
import { createOpenAiProvider } from "./openai-provider";
import { createQwenProvider } from "./qwen-provider";

export type AiEnvironment = { provider: "none" } | {
  kind: "openai" | "qwen";
  model: string;
  apiKey: string;
  baseUrl: string;
};

function safeBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("Invalid AI configuration");
  }
}

export function readAiEnv(environment: Record<string, string | undefined> = process.env): AiEnvironment {
  const provider = environment.AI_PROVIDER?.trim() || "none";
  if (provider === "none") return { provider: "none" };
  if (provider !== "openai" && provider !== "qwen") throw new Error("Invalid AI configuration");
  const model = environment.AI_MODEL?.trim();
  const apiKey = (environment.AI_API_KEY ?? (provider === "openai" ? environment.OPENAI_API_KEY : environment.DASHSCOPE_API_KEY))?.trim();
  const configuredBase = environment.AI_BASE_URL?.trim();
  if (!model || !apiKey || (provider === "qwen" && !configuredBase)) throw new Error("Invalid AI configuration");
  return {
    kind: provider,
    model,
    apiKey,
    baseUrl: safeBaseUrl(configuredBase || "https://api.openai.com/v1"),
  };
}

export function createAiProvider(environment: AiEnvironment = readAiEnv()): AiProvider | null {
  if ("provider" in environment) return null;
  return environment.kind === "openai" ? createOpenAiProvider(environment) : createQwenProvider(environment);
}

export function publicAiStatus(environment: AiEnvironment = readAiEnv()) {
  if ("provider" in environment) return { available: false, label: "规则模式" };
  return { available: true, label: environment.kind === "openai" ? "GPT AI" : "通义千问" };
}
