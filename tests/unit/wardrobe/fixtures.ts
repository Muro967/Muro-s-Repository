import type { WardrobeTree } from "@/features/wardrobe/wardrobe-repository";

export const wardrobes: WardrobeTree[] = [
  { id: "w1", name: "主卧衣柜", sortOrder: 0, zones: [
    { id: "z1", wardrobeId: "w1", name: "短挂区", kind: "hang", sortOrder: 0 },
    { id: "z2", wardrobeId: "w1", name: "叠放层", kind: "shelf", sortOrder: 1 },
    { id: "z3", wardrobeId: "w1", name: "抽屉", kind: "drawer", sortOrder: 2 },
    { id: "z4", wardrobeId: "w1", name: "鞋层", kind: "shoe", sortOrder: 3 },
  ] },
  { id: "w2", name: "次卧衣柜", sortOrder: 1, zones: [{ id: "z5", wardrobeId: "w2", name: "长挂区", kind: "hang", sortOrder: 0 }] },
];
