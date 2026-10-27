import type { AiRecreationInput } from "../recreation/recreation-types";
import type { StyleSuggestionInput } from "../style/style-types";
import { aiRecreationDraftSchema, inspirationAnalysisSchema, styleProfileDraftSchema, type AiProvider } from "./ai-types";
import { endpoint, parseWithOneRepair, postJson, type FetchLike, type ProviderConfig } from "./provider-http";

function contentText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const choices = (value as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return "";
  const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>).message : null;
  return message && typeof message === "object" && typeof (message as Record<string, unknown>).content === "string" ? (message as Record<string, unknown>).content as string : "";
}

export function createQwenProvider(config: ProviderConfig, request: FetchLike = fetch): AiProvider {
  const url = endpoint(config, "chat/completions");
  const call = async (prompt: string, image: { image: Uint8Array; mimeType: string } | null, repair: boolean) => {
    const content: unknown[] = [{ type: "text", text: `${prompt}${repair ? "\nReturn corrected JSON only." : ""}` }];
    if (image) content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${Buffer.from(image.image).toString("base64")}` } });
    return contentText(await postJson(config, url, {
      model: config.model,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }, request));
  };
  return {
    kind: "qwen",
    analyzeInspiration: (input) => parseWithOneRepair(inspirationAnalysisSchema, (repair) => call("Analyze this outfit inspiration. Return structured JSON.", input, repair)),
    suggestStyleProfile: (input: StyleSuggestionInput) => parseWithOneRepair(styleProfileDraftSchema, (repair) => call(`Summarize these style inputs as JSON: ${JSON.stringify(input)}`, null, repair)),
    recreate: (input: AiRecreationInput) => parseWithOneRepair(aiRecreationDraftSchema, (repair) => call(`Select only candidate tokens and return JSON: ${JSON.stringify(input)}`, null, repair)),
  };
}
