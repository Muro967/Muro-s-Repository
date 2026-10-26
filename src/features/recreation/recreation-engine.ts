import { itemCategories, itemStyles } from "../items/item-catalog";
import type { CategoryId } from "../items/item-types";
import type { RecreationCandidate, RecreationDraft, RuleRecreationInput } from "./recreation-types";

const categoryLabels = new Map(itemCategories.map((entry) => [entry.id, entry.label]));
const styleLabels = new Map(itemStyles.map((entry) => [entry.id, entry.label]));
const structuredRuleTypes = new Set(["color", "style", "fit", "material", "formality"]);

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[\s/＋+、，,·_-]/g, "");
}

function looselyMatches(left: string, right: string) {
  const a = normalized(left);
  const b = normalized(right);
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}

function valuesForRule(candidate: RecreationCandidate, type: string) {
  if (type === "color") return candidate.colorNames;
  if (type === "style") return candidate.styleIds.flatMap((id) => [id, styleLabels.get(id) ?? id]);
  if (type === "fit") return [candidate.fit ?? "", candidate.length ?? ""];
  if (type === "material") return [candidate.material ?? ""];
  if (type === "formality") return [candidate.formality ?? ""];
  return [];
}

function excluded(candidate: RecreationCandidate, input: RuleRecreationInput) {
  return input.enabledRules.some((rule) => rule.enabled && structuredRuleTypes.has(rule.type) &&
    valuesForRule(candidate, rule.type).some((value) => looselyMatches(value, rule.value)));
}

function score(candidate: RecreationCandidate, input: RuleRecreationInput) {
  const category = categoryLabels.get(candidate.categoryId) ?? candidate.categoryId;
  const searchable = [candidate.name, category, candidate.material ?? "", candidate.fit ?? "", candidate.length ?? ""];
  let value = 0;
  for (const keyItem of input.inspiration.keyItems) {
    if (searchable.some((part) => looselyMatches(part, keyItem))) value += 8;
  }
  for (const color of input.inspiration.colorNames) {
    if (candidate.colorNames.some((part) => looselyMatches(part, color))) value += 5;
  }
  for (const style of input.inspiration.styleTags) {
    if (candidate.styleIds.some((id) => looselyMatches(id, style) || looselyMatches(styleLabels.get(id) ?? id, style))) value += 4;
  }
  for (const silhouette of input.inspiration.silhouettes) {
    if ([candidate.fit, candidate.length].some((part) => part && looselyMatches(part, silhouette))) value += 3;
  }
  if (input.inspiration.formality && candidate.formality && looselyMatches(candidate.formality, input.inspiration.formality)) value += 3;
  for (const combination of input.inspiration.combinations) {
    if (searchable.some((part) => looselyMatches(combination, part))) value += 2;
  }
  if (input.styleProfile?.preferredColors.some((color) => candidate.colorNames.some((part) => looselyMatches(part, color)))) value += 1;
  if (input.styleProfile?.preferredSilhouettes.some((shape) => [candidate.fit, candidate.length].some((part) => part && looselyMatches(part, shape)))) value += 1;
  return value;
}

function desiredDress(input: RuleRecreationInput) {
  return [...input.inspiration.keyItems, ...input.inspiration.combinations]
    .some((value) => /连衣裙|裙装|连体/.test(value));
}

function bestFor(categoryId: CategoryId, candidates: RecreationCandidate[], input: RuleRecreationInput) {
  return candidates.filter((entry) => entry.categoryId === categoryId)
    .map((entry) => ({ entry, score: score(entry, input) }))
    .sort((left, right) => right.score - left.score ||
      right.entry.updatedAt.localeCompare(left.entry.updatedAt) ||
      left.entry.id.localeCompare(right.entry.id))[0];
}

export function eligibleRecreationCandidates(input: RuleRecreationInput) {
  return input.candidates.filter((entry) =>
    entry.userId === input.userId && entry.status === "active" && entry.deletedAt === null && !excluded(entry, input));
}

export function buildRuleRecreation(input: RuleRecreationInput): RecreationDraft {
  const ownedActive = input.candidates.filter((entry) =>
    entry.userId === input.userId && entry.status === "active" && entry.deletedAt === null);
  const candidates = eligibleRecreationCandidates(input);
  const slots: Array<{ categoryId: CategoryId; label: string; required: boolean }> = desiredDress(input)
    ? [{ categoryId: "dresses", label: "连衣裙", required: true }]
    : [{ categoryId: "tops", label: "上装", required: true }, { categoryId: "bottoms", label: "下装", required: true }];
  slots.push(
    { categoryId: "shoes", label: "鞋履", required: true },
    { categoryId: "outerwear", label: "外套", required: false },
    { categoryId: "bags", label: "包袋", required: false },
    { categoryId: "accessories", label: "配饰", required: false },
  );

  const items: RecreationDraft["items"] = [];
  const missing: string[] = [];
  for (const slot of slots) {
    const choice = bestFor(slot.categoryId, candidates, input);
    if (choice) items.push({ itemId: choice.entry.id, slot: slot.label, score: choice.score });
    else if (slot.required) missing.push(slot.label);
  }

  const similarities = [
    ...input.inspiration.colorNames.slice(0, 2).map((color) => `呼应灵感里的${color}`),
    ...input.inspiration.styleTags.slice(0, 2).map((style) => `保留${style}风格`),
    ...input.enabledRules.filter((rule) => rule.enabled && rule.type === "text")
      .map((rule) => `参考了你的说明：${rule.value}`),
  ].slice(0, 5);

  return {
    mode: "rules",
    items,
    similarities,
    missing,
    inputSnapshot: {
      inspiration: input.inspiration,
      styleProfileInputVersion: input.styleProfile?.inputVersion ?? null,
      enabledRules: input.enabledRules.filter((rule) => rule.enabled).map(({ type, value }) => ({ type, value })),
      candidateVersions: ownedActive.map(({ id, updatedAt }) => ({ itemId: id, updatedAt })),
    },
  };
}
