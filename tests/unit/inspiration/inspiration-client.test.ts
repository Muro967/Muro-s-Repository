import { inspirationClient } from "@/features/inspiration/inspiration-client";

const id = "b3702bc6-e5de-45b6-92b6-1e9f8e23b130";
const value = {
  id,
  imageUrl: `/api/inspirations/${id}/image`,
  name: "秋日通勤",
  styleTags: ["法式"],
  colorNames: ["灰绿"],
  silhouettes: [],
  keyItems: [],
  combinations: [],
  formality: null,
  notes: null,
  confirmedFields: [],
  analysisStatus: "manual",
  analysisSource: null,
  analysisErrorCode: null,
  version: 1,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

test("uses no-store requests and validates public inspiration responses", async () => {
  const calls: Array<[string, RequestInit]> = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    calls.push([path, init]);
    return new Response(JSON.stringify(path === "/api/inspirations"
      ? { inspirations: [value] }
      : { inspiration: value }));
  });
  await expect(inspirationClient.list()).resolves.toEqual([value]);
  await expect(inspirationClient.read(id)).resolves.toEqual(value);
  expect(calls.every(([, init]) => init.cache === "no-store" && init.credentials === "same-origin")).toBe(true);
});

test("maps stable API errors to readable messages", async () => {
  vi.stubGlobal("fetch", async () => new Response(
    JSON.stringify({ error: { code: "VERSION_CONFLICT" } }),
    { status: 409 },
  ));
  await expect(inspirationClient.update(id, { expectedVersion: 1, name: "新名称" }))
    .rejects.toMatchObject({ code: "VERSION_CONFLICT", message: expect.stringContaining("更新") });
});

test("rejects a success response that leaks or misses the public contract", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
    inspiration: { ...value, userId: id },
  })));
  await expect(inspirationClient.read(id)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
