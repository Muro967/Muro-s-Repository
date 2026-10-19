// @vitest-environment node

import { dateOnlySchema, pastOrTodayDateSchema } from "@/features/items/item-validation";

test.each(["2024-02-29", "2026-01-01", "2026-04-30"])("accepts real canonical calendar date %s", (date) => {
  expect(dateOnlySchema.parse(date)).toBe(date);
});

test.each([
  "2026-02-29",
  "2024-02-30",
  "2026-04-31",
  "2026-00-10",
  "2026-13-01",
  "2026-01-00",
  "2026-01-32",
])("rejects impossible calendar date %s", (date) => {
  expect(dateOnlySchema.safeParse(date).success).toBe(false);
});

test.each(["2026-1-01", "2026-01-1", "26-01-01", "2026/01/01", "2026-01-01T00:00:00Z", " 2026-01-01", "2026-01-01\n", "", null, 20260101])(
  "rejects non-canonical date %s",
  (date) => {
    expect(dateOnlySchema.safeParse(date).success).toBe(false);
  },
);

test("accepts past dates and today against the supplied date", () => {
  const schema = pastOrTodayDateSchema("2026-04-02");

  expect(schema.parse("2024-02-29")).toBe("2024-02-29");
  expect(schema.parse("2026-04-02")).toBe("2026-04-02");
});

test("rejects a date later than the supplied today", () => {
  expect(pastOrTodayDateSchema("2026-04-02").safeParse("2026-04-03").success).toBe(false);
});

test("still rejects impossible dates before today", () => {
  expect(pastOrTodayDateSchema("2026-04-02").safeParse("2026-02-29").success).toBe(false);
});

test.each(["2026-02-29", "2026-4-02", "2026-04-02T00:00:00Z"])("rejects invalid today %s when creating the schema", (today) => {
  expect(() => pastOrTodayDateSchema(today)).toThrow();
});
