import { readAiEnv } from "@/features/ai/ai-provider";

test("defaults to rules even when a vendor key happens to exist", () => {
  expect(readAiEnv({ OPENAI_API_KEY: "secret" })).toEqual({ provider: "none" });
  expect(readAiEnv({})).toEqual({ provider: "none" });
});

test("requires a complete explicit configuration without leaking secrets", () => {
  for (const environment of [
    { AI_PROVIDER: "openai" },
    { AI_PROVIDER: "qwen", AI_MODEL: "qwen-vl", AI_API_KEY: "secret" },
  ]) {
    let message = "";
    try { readAiEnv(environment); } catch (error) { message = String(error); }
    expect(message).toContain("Invalid AI configuration");
    expect(message).not.toContain("secret");
  }
});

test("normalizes openai and qwen endpoints", () => {
  expect(readAiEnv({ AI_PROVIDER: "openai", AI_MODEL: "gpt-test", AI_API_KEY: "secret" })).toMatchObject({ kind: "openai", baseUrl: "https://api.openai.com/v1" });
  expect(readAiEnv({ AI_PROVIDER: "qwen", AI_MODEL: "qwen-test", AI_API_KEY: "secret", AI_BASE_URL: "https://dashscope.example/compatible-mode/v1/" })).toMatchObject({ kind: "qwen", baseUrl: "https://dashscope.example/compatible-mode/v1" });
});
