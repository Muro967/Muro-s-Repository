import type { AiRecreationInput } from "../recreation/recreation-types";
import type { StyleSuggestionInput } from "../style/style-types";
import { aiRecreationDraftSchema, inspirationAnalysisSchema, styleProfileDraftSchema, type AiProvider } from "./ai-types";
import { endpoint, parseWithOneRepair, postJson, type FetchLike, type ProviderConfig } from "./provider-http";

function outputText(value: unknown) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.output_text === "string") return record.output_text;
    const output = Array.isArray(record.output) ? record.output : [];
    for (const entry of output) {
      const content = entry && typeof entry === "object" && Array.isArray((entry as Record<string, unknown>).content) ? (entry as Record<string, unknown>).content as unknown[] : [];
      for (const part of content) if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") return (part as Record<string, unknown>).text as string;
    }
  }
  return "";
}

export function createOpenAiProvider(config: ProviderConfig, request: FetchLike = fetch): AiProvider {
  const url = endpoint(config, "responses");
  const call = async (prompt: string, image: { image: Uint8Array; mimeType: string } | null, repair: boolean) => {
    const content: unknown[] = [{ type: "input_text", text: `${prompt}${repair ? "\nReturn corrected JSON only." : ""}` }];
    if (image) content.push({ type: "input_image", image_url: `data:${image.mimeType};base64,${Buffer.from(image.image).toString("base64")}` });
    return outputText(await postJson(config, url, {
      model: config.model,
      store: false,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } },
    }, request));
  };
  return {
    kind: "openai",
    analyzeInspiration: (input) => parseWithOneRepair(inspirationAnalysisSchema, (repair) => call("Analyze this outfit inspiration. Return structured JSON.", input, repair)),
    suggestStyleProfile: (input: StyleSuggestionInput) => parseWithOneRepair(styleProfileDraftSchema, (repair) => call(`Summarize these style inputs as JSON: ${JSON.stringify(input)}`, null, repair)),
    recreate: (input: AiRecreationInput) => parseWithOneRepair(aiRecreationDraftSchema, (repair) => call(`Select only candidate tokens and return JSON: ${JSON.stringify(input)}`, null, repair)),
  };
}
