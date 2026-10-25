import {
  inspirationAnalysisFields,
  type InspirationAnalysis,
  type InspirationAnalysisField,
  type InspirationAnalysisMerge,
  type InspirationAnalysisTarget,
} from "./inspiration-types";

function copyTarget(current: InspirationAnalysisTarget): InspirationAnalysisTarget {
  return {
    ...current,
    styleTags: [...current.styleTags],
    colorNames: [...current.colorNames],
    silhouettes: [...current.silhouettes],
    keyItems: [...current.keyItems],
    combinations: [...current.combinations],
    confirmedFields: [...current.confirmedFields],
  };
}

export function mergeAnalysis(
  current: InspirationAnalysisTarget,
  incoming: InspirationAnalysis,
  startedVersion: number,
): InspirationAnalysisMerge {
  const merged = copyTarget(current);
  if (current.version !== startedVersion) {
    return { ...merged, applied: false, appliedFields: [] };
  }

  const appliedFields: InspirationAnalysisField[] = [];
  for (const field of inspirationAnalysisFields) {
    if (current.confirmedFields.includes(field)) continue;
    if (field === "formality") {
      merged.formality = incoming.formality;
    } else {
      merged[field] = [...incoming[field]];
    }
    appliedFields.push(field);
  }

  if (appliedFields.length === 0) {
    return { ...merged, applied: false, appliedFields };
  }

  return {
    ...merged,
    version: current.version + 1,
    applied: true,
    appliedFields,
  };
}
