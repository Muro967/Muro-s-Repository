import { createRecreationService } from "@/features/recreation/recreation-service";
import { RecreationError, type RecreationRepository } from "@/features/recreation/recreation-repository";

const userId = "30000000-0000-4000-8000-000000000001";
const inspirationId = "10000000-0000-4000-8000-000000000001";
const input = {
  inspiration: { id: inspirationId, version: 1, styleTags: [], colorNames: ["米白"], silhouettes: [], keyItems: [], combinations: [], formality: null },
  styleProfile: null,
  rules: [],
  candidates: [
    { id: "a", userId, name: "米白上衣", categoryId: "tops" as const, accessoryId: null, colorNames: ["米白"], styleIds: [], material: null, fit: null, length: null, formality: null, status: "active" as const, deletedAt: null, updatedAt: "2026-10-19T00:00:00.000Z" },
    { id: "b", userId, name: "黑色长裤", categoryId: "bottoms" as const, accessoryId: null, colorNames: ["黑色"], styleIds: [], material: null, fit: null, length: null, formality: null, status: "active" as const, deletedAt: null, updatedAt: "2026-10-19T00:00:00.000Z" },
  ],
};
const saved = { id: "50000000-0000-4000-8000-000000000001", inspirationId, mode: "rules" as const, items: [], similarities: [], missing: ["鞋履"], createdAt: "2026-10-20T00:00:00.000Z" };

test("rebuilds once when candidates change during save", async () => {
  let saves = 0;
  const repository: RecreationRepository = {
    readInputs: vi.fn(async () => input),
    save: vi.fn(async () => ++saves === 1 ? "CANDIDATES_CHANGED" : saved),
    find: vi.fn(async () => saved),
  };
  await expect(createRecreationService({ repository }).create(userId, inspirationId)).resolves.toEqual(saved);
  expect(repository.readInputs).toHaveBeenCalledTimes(2);
});

test("fails closed after a second candidate race and hides unknown records", async () => {
  const repository: RecreationRepository = {
    readInputs: vi.fn(async () => input),
    save: vi.fn(async () => "CANDIDATES_CHANGED" as const),
    find: vi.fn(async () => null),
  };
  await expect(createRecreationService({ repository }).create(userId, inspirationId)).rejects.toMatchObject({ code: "CANDIDATES_CHANGED" });
  await expect(createRecreationService({ repository }).read(userId, saved.id)).rejects.toEqual(new RecreationError("NOT_FOUND"));
});
