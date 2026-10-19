import { z } from "zod";

export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}, { message: "Expected a real calendar date in YYYY-MM-DD format." });

export function pastOrTodayDateSchema(today: string) {
  const canonicalToday = dateOnlySchema.parse(today);
  return dateOnlySchema.refine((value) => value <= canonicalToday, {
    message: "Date must not be in the future.",
  });
}
