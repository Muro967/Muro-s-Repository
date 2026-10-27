import { z } from "zod";

import {
  inspirationFields,
  type EditableInspiration,
  type EditableInspirationPatch,
  type ValidInspirationCandidate,
} from "./inspiration-types";

function uniqueTrimmed(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function textList(maxItems: number, maxLength = 80) {
  return z.array(z.string())
    .transform(uniqueTrimmed)
    .pipe(z.array(z.string().min(1).max(maxLength)).max(maxItems));
}

const nullableText = (maxLength: number) => z.union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  })
  .pipe(z.string().max(maxLength).nullable());

const confirmedFieldsSchema = z.array(z.enum(inspirationFields))
  .transform((values) => [...new Set(values)])
  .pipe(z.array(z.enum(inspirationFields)).max(inspirationFields.length));

const editableShape = {
  name: z.string().trim().max(80),
  styleTags: textList(3),
  colorNames: textList(12),
  silhouettes: textList(12),
  keyItems: textList(12),
  combinations: textList(12, 160),
  formality: nullableText(80),
  notes: nullableText(1000),
  confirmedFields: confirmedFieldsSchema,
};

const editableInspirationSchema = z.strictObject({
  name: editableShape.name.default(""),
  styleTags: editableShape.styleTags.default([]),
  colorNames: editableShape.colorNames.default([]),
  silhouettes: editableShape.silhouettes.default([]),
  keyItems: editableShape.keyItems.default([]),
  combinations: editableShape.combinations.default([]),
  formality: editableShape.formality.default(null),
  notes: editableShape.notes.default(null),
  confirmedFields: editableShape.confirmedFields.default([]),
});

const inspirationPatchSchema = z.strictObject({
  name: editableShape.name.optional(),
  styleTags: editableShape.styleTags.optional(),
  colorNames: editableShape.colorNames.optional(),
  silhouettes: editableShape.silhouettes.optional(),
  keyItems: editableShape.keyItems.optional(),
  combinations: editableShape.combinations.optional(),
  formality: editableShape.formality.optional(),
  notes: editableShape.notes.optional(),
  confirmedFields: editableShape.confirmedFields.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one editable field is required.",
});

export function parseEditableInspiration(input: unknown): EditableInspiration {
  return editableInspirationSchema.parse(input);
}

export function parseInspirationPatch(input: unknown): EditableInspirationPatch {
  return inspirationPatchSchema.parse(input);
}

export function isValidInspiration(input: ValidInspirationCandidate) {
  return input.deletedAt === null
    && input.uploadReady
    && [...input.styleTags, ...input.colorNames].some((value) => value.trim().length > 0);
}
