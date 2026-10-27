import { buildRuleRecreation } from "@/features/recreation/recreation-engine";
import type { RecreationCandidate } from "@/features/recreation/recreation-types";

const inspiration = {
  id: "10000000-0000-4000-8000-000000000001",
  version: 2,
  styleTags: ["极简"],
  colorNames: ["米白", "黑色"],
  silhouettes: ["宽松"],
  keyItems: ["衬衫", "阔腿裤"],
  combinations: ["衬衫+阔腿裤"],
  formality: "通勤",
};

function candidate(id: string, categoryId: RecreationCandidate["categoryId"], patch: Partial<RecreationCandidate> = {}): RecreationCandidate {
  return {
    id,
    userId: "30000000-0000-4000-8000-000000000001",
    name: categoryId === "tops" ? "米白衬衫" : "黑色阔腿裤",
    categoryId,
    accessoryId: null,
    colorNames: categoryId === "tops" ? ["米白"] : ["黑色"],
    styleIds: ["minimalist"],
    material: "棉",
    fit: "宽松",
    length: "常规",
    formality: "通勤",
    status: "active",
    deletedAt: null,
    updatedAt: "2026-10-19T00:00:00.000Z",
    ...patch,
  };
}

test("uses only active owned candidates and reports a missing shoe slot", () => {
  const active = [candidate("a", "tops"), candidate("b", "bottoms")];
  const result = buildRuleRecreation({
    userId: active[0]!.userId,
    inspiration,
    styleProfile: null,
    enabledRules: [],
    candidates: [
      ...active,
      candidate("c", "shoes", { status: "draft" }),
      candidate("d", "outerwear", { userId: "someone-else" }),
      candidate("e", "bags", { deletedAt: "2026-10-20T00:00:00.000Z" }),
    ],
  });
  expect(result.items.map(({ itemId }) => itemId)).toEqual(["a", "b"]);
  expect(result.missing).toEqual(["鞋履"]);
});

test("applies structured disliked rules before scoring", () => {
  const result = buildRuleRecreation({
    userId: "30000000-0000-4000-8000-000000000001",
    inspiration,
    styleProfile: null,
    enabledRules: [{ type: "color", value: "亮红", enabled: true }],
    candidates: [
      candidate("red", "tops", { colorNames: ["亮红"], updatedAt: "2026-10-21T00:00:00.000Z" }),
      candidate("cream", "tops"),
      candidate("bottom", "bottoms"),
      candidate("shoe", "shoes", { name: "黑色乐福鞋", colorNames: ["黑色"] }),
    ],
  });
  expect(result.items.map(({ itemId }) => itemId)).toEqual(["cream", "bottom", "shoe"]);
  expect(result.items.some(({ itemId }) => itemId === "red")).toBe(false);
});

test("uses stable score, updatedAt and id ordering and switches to a dress foundation", () => {
  const dressInspiration = { ...inspiration, keyItems: ["连衣裙"], combinations: ["连衣裙+鞋"] };
  const result = buildRuleRecreation({
    userId: "30000000-0000-4000-8000-000000000001",
    inspiration: dressInspiration,
    styleProfile: null,
    enabledRules: [{ type: "text", value: "不要太隆重", enabled: true }],
    candidates: [
      candidate("z", "dresses", { name: "米白连衣裙", updatedAt: "2026-10-20T00:00:00.000Z" }),
      candidate("a", "dresses", { name: "米白连衣裙", updatedAt: "2026-10-20T00:00:00.000Z" }),
      candidate("top", "tops"), candidate("bottom", "bottoms"),
    ],
  });
  expect(result.items).toEqual([expect.objectContaining({ itemId: "a", slot: "连衣裙" })]);
  expect(result.similarities).toContain("参考了你的说明：不要太隆重");
});
