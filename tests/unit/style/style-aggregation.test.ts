import { aggregateStyleProfile } from "@/features/style/style-aggregation";
import type { StyleInspiration } from "@/features/style/style-types";

const inspiration = (
  id: number,
  overrides: Partial<StyleInspiration> = {},
): StyleInspiration => ({
  id: `10000000-0000-4000-8000-00000000000${id}`,
  version: 1,
  styleTags: ["法式"],
  colorNames: ["米白"],
  silhouettes: ["宽松"],
  keyItems: ["风衣"],
  combinations: ["风衣+阔腿裤"],
  formality: "通勤",
  confirmedFields: [],
  updatedAt: `2026-10-${String(10 + id).padStart(2, "0")}T00:00:00.000Z`,
  ...overrides,
});

test("reports the exact gap before five valid inspirations", () => {
  expect(aggregateStyleProfile([1, 2, 3, 4].map((id) => inspiration(id))))
    .toEqual({ status: { kind: "insufficient", remaining: 1 }, validCount: 4 });
});

test("aggregates the top five values, deduplicates each image and produces a stable version", () => {
  const values = [
    inspiration(1, { colorNames: ["米白", "米白", "灰绿"] }),
    inspiration(2, { colorNames: ["灰绿", "豆沙"], silhouettes: ["直筒"] }),
    inspiration(3, { colorNames: ["豆沙"], combinations: ["针织衫+半裙"], formality: "休闲" }),
    inspiration(4),
    inspiration(5),
  ];
  const first = aggregateStyleProfile(values);
  const second = aggregateStyleProfile([...values].reverse());
  expect(first.status.kind).toBe("ready");
  if (first.status.kind !== "ready" || second.status.kind !== "ready") throw new Error("expected ready");
  expect(first.status.profile.preferredColors).toEqual(["米白", "豆沙", "灰绿"]);
  expect(first.status.profile.preferredSilhouettes).toEqual(["宽松", "直筒"]);
  expect(first.status.profile.commonCombinations).toEqual(["风衣+阔腿裤", "针织衫+半裙"]);
  expect(first.status.profile.likedExamples).toHaveLength(3);
  expect(first.status.inputVersion).toBe(second.status.inputVersion);
});

test("breaks count ties by recent confirmation and then stable Chinese text order", () => {
  const values = [
    inspiration(1, { colorNames: ["豆沙"], confirmedFields: ["colorNames"], updatedAt: "2026-10-20T00:00:00.000Z" }),
    inspiration(2, { colorNames: ["灰绿"], confirmedFields: ["colorNames"], updatedAt: "2026-10-19T00:00:00.000Z" }),
    inspiration(3, { colorNames: ["米白"] }),
    inspiration(4, { colorNames: ["雾蓝"] }),
    inspiration(5, { colorNames: ["燕麦"] }),
  ];
  const result = aggregateStyleProfile(values);
  if (result.status.kind !== "ready") throw new Error("expected ready");
  expect(result.status.profile.preferredColors.slice(0, 2)).toEqual(["豆沙", "灰绿"]);
});
