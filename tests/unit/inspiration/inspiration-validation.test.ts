import {
  isValidInspiration,
  parseEditableInspiration,
  parseInspirationPatch,
} from "@/features/inspiration/inspiration-validation";

test("normalizes editable text lists and applies creation defaults", () => {
  expect(parseEditableInspiration({
    name: "  秋日通勤  ",
    styleTags: [" 法式 ", "法式", "", " 极简 "],
    colorNames: [" 米白 ", "米白", "灰绿"],
  })).toEqual({
    name: "秋日通勤",
    styleTags: ["法式", "极简"],
    colorNames: ["米白", "灰绿"],
    silhouettes: [],
    keyItems: [],
    combinations: [],
    formality: null,
    notes: null,
    confirmedFields: [],
  });
});

test("accepts the documented field limits", () => {
  expect(parseEditableInspiration({
    name: "衣".repeat(80),
    notes: "注".repeat(1000),
    styleTags: ["一", "二", "三"],
    colorNames: Array.from({ length: 12 }, (_, index) => `色${index}`),
  }).name).toHaveLength(80);
});

test.each([
  ["name above 80 characters", { name: "衣".repeat(81) }],
  ["notes above 1000 characters", { notes: "注".repeat(1001) }],
  ["more than three style tags", { styleTags: ["一", "二", "三", "四"] }],
  ["more than twelve colors", { colorNames: Array.from({ length: 13 }, (_, index) => `色${index}`) }],
  ["unknown confirmed field", { confirmedFields: ["analysisStatus"] }],
  ["unknown editable property", { source: "openai" }],
])("rejects %s", (_name, input) => {
  expect(() => parseEditableInspiration(input)).toThrow();
});

test.each([
  { analysisStatus: "ready" },
  { analysisSource: "openai" },
  { version: 2 },
  { userId: "10000000-0000-4000-8000-000000000001" },
  { uploadId: "20000000-0000-4000-8000-000000000001" },
  { deletedAt: null },
  {},
])("patch rejects protected or empty input %#", (input) => {
  expect(() => parseInspirationPatch(input)).toThrow();
});

test("patch returns only normalized editable fields that were supplied", () => {
  expect(parseInspirationPatch({
    styleTags: [" 法式 ", "法式"],
    notes: "  喜欢这个比例  ",
    confirmedFields: ["styleTags", "styleTags", "name"],
  })).toEqual({
    styleTags: ["法式"],
    notes: "喜欢这个比例",
    confirmedFields: ["styleTags", "name"],
  });
});

test.each([
  [{ deletedAt: null, uploadReady: true, styleTags: ["法式"], colorNames: [] }, true],
  [{ deletedAt: null, uploadReady: true, styleTags: [], colorNames: ["米白"] }, true],
  [{ deletedAt: null, uploadReady: true, styleTags: [], colorNames: [] }, false],
  [{ deletedAt: null, uploadReady: true, styleTags: ["   "], colorNames: [] }, false],
  [{ deletedAt: new Date(), uploadReady: true, styleTags: ["法式"], colorNames: [] }, false],
  [{ deletedAt: null, uploadReady: false, styleTags: ["法式"], colorNames: [] }, false],
])("counts only uploaded, undeleted inspirations with a style or color %#", (input, expected) => {
  expect(isValidInspiration(input)).toBe(expected);
});
