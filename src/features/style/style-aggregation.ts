import { createHash } from "node:crypto";

import type {
  StyleInspiration,
  StyleProfileDraft,
} from "./style-types";

type Count = { count: number; latestConfirmed: string };

function rank(
  inspirations: StyleInspiration[],
  field: "colorNames" | "silhouettes" | "combinations",
) {
  const counts = new Map<string, Count>();
  for (const inspiration of inspirations) {
    for (const value of new Set(inspiration[field].map((item) => item.trim()).filter(Boolean))) {
      const current = counts.get(value) ?? { count: 0, latestConfirmed: "" };
      current.count += 1;
      if (
        inspiration.confirmedFields.includes(field)
        && inspiration.updatedAt > current.latestConfirmed
      ) {
        current.latestConfirmed = inspiration.updatedAt;
      }
      counts.set(value, current);
    }
  }
  return [...counts.entries()]
    .sort(([leftValue, left], [rightValue, right]) =>
      right.count - left.count
      || right.latestConfirmed.localeCompare(left.latestConfirmed)
      || leftValue.localeCompare(rightValue, "zh-CN"))
    .slice(0, 5)
    .map(([value]) => value);
}

function formality(inspirations: StyleInspiration[]) {
  const counts = new Map<string, number>();
  for (const item of inspirations) {
    const value = item.formality?.trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftValue, left], [rightValue, right]) =>
      right - left || leftValue.localeCompare(rightValue, "zh-CN"))[0]?.[0] ?? null;
}

function inputVersion(inspirations: StyleInspiration[]) {
  const canonical = inspirations
    .map(({ id, version }) => ({ id, version }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function aggregateStyleProfile(inspirations: StyleInspiration[]):
  | { status: { kind: "insufficient"; remaining: number }; validCount: number }
  | {
      status: {
        kind: "ready";
        profile: StyleProfileDraft;
        inputVersion: string;
      };
      validCount: number;
    } {
  const valid = inspirations.filter((item) =>
    item.styleTags.some((value) => value.trim())
    || item.colorNames.some((value) => value.trim()));
  if (valid.length < 5) {
    return {
      status: { kind: "insufficient", remaining: 5 - valid.length },
      validCount: valid.length,
    };
  }
  const recent = [...valid]
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
    .slice(0, 3)
    .map(({ id }) => id);
  return {
    status: {
      kind: "ready",
      profile: {
        preferredColors: rank(valid, "colorNames"),
        preferredSilhouettes: rank(valid, "silhouettes"),
        commonCombinations: rank(valid, "combinations"),
        formalityTendency: formality(valid),
        likedExamples: recent,
      },
      inputVersion: inputVersion(valid),
    },
    validCount: valid.length,
  };
}
