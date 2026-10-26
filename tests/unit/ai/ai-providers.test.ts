import { createOpenAiProvider } from "@/features/ai/openai-provider";
import { createQwenProvider } from "@/features/ai/qwen-provider";

const analysis = { styleTags: ["极简"], colorNames: ["米白"], silhouettes: ["宽松"], keyItems: ["衬衫"], combinations: ["衬衫+长裤"], formality: "通勤" };

test("maps OpenAI Responses output to the shared analysis shape with safe request options", async () => {
  const request = vi.fn(async (input: string, init: RequestInit) => {
    void input; void init;
    return new Response(JSON.stringify({ output_text: JSON.stringify(analysis) }), { headers: { "content-type": "application/json" } });
  });
  const provider = createOpenAiProvider({ kind: "openai", model: "gpt-test", apiKey: "secret", baseUrl: "https://api.openai.com/v1" }, request);
  await expect(provider.analyzeInspiration({ image: new Uint8Array([1, 2]), mimeType: "image/jpeg" })).resolves.toEqual(analysis);
  expect(request).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({ redirect: "error" }));
  const init = request.mock.calls[0]![1] as RequestInit;
  expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret");
  expect(String(init.body)).toContain('"store":false');
});

test("maps Qwen compatible output and retries malformed structured content once", async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysis) } }] })));
  const provider = createQwenProvider({ kind: "qwen", model: "qwen-test", apiKey: "secret", baseUrl: "https://dashscope.example/v1" }, request);
  await expect(provider.analyzeInspiration({ image: new Uint8Array([1]), mimeType: "image/png" })).resolves.toEqual(analysis);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0]![0]).toBe("https://dashscope.example/v1/chat/completions");
});
