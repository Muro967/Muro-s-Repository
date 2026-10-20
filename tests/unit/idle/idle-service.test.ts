// @vitest-environment node
import { disposalInputSchema } from "@/features/idle/idle-service";
import { idleSettingsSchema } from "@/features/idle/idle-settings-service";

vi.mock("server-only", () => ({}));
const base = { disposedOn: "2026-10-19" };
test("validates each disposal method's fields without coercion or unknown properties", () => {
  const schema = disposalInputSchema("2026-10-19");
  for (const input of [
    { method: "sold", saleAmountMinor: 18000, currency: "CNY", platform: "闲鱼" },
    { method: "sold" }, { method: "sold", platform: "闲鱼" },
    { method: "sold", saleAmountMinor: 0, currency: "CNY" },
    { method: "gifted" },
    { method: "gifted", recipient: "朋友" },
    ...["donated", "recycled", "upcycled", "discarded"].map((method) => ({ method })),
  ]) expect(schema.safeParse({ ...base, ...input }).success).toBe(true);
  for (const input of [
    { method: "sold", saleAmountMinor: 100 }, { method: "sold", currency: "CNY" },
    { method: "sold", saleAmountMinor: -1, currency: "CNY", platform: "闲鱼" },
    { method: "sold", saleAmountMinor: 1.1, currency: "CNY", platform: "闲鱼" },
    { method: "sold", saleAmountMinor: "100", currency: "CNY", platform: "闲鱼" },
    { method: "sold", saleAmountMinor: 2147483648, currency: "CNY", platform: "闲鱼" },
    { method: "sold", saleAmountMinor: 100, currency: "cny", platform: "闲鱼" },
    { method: "sold", saleAmountMinor: 100, currency: "ZZZ" },
    { method: "sold", saleAmountMinor: 100, currency: "CNY", platform: " " },
    { method: "sold", recipient: "朋友" },
    { method: "gifted", recipient: " " }, { method: "gifted", recipient: "Friend", currency: "CNY" },
    { method: "gifted", saleAmountMinor: 0 }, { method: "gifted", platform: "闲鱼" },
    ...["donated", "recycled", "upcycled", "discarded"].flatMap((method) => ["recipient", "saleAmountMinor", "currency", "platform"].map((field) => ({ method, [field]: field === "saleAmountMinor" ? 0 : "x" }))),
    { method: "donated", userId: "other" }, { method: "donated", disposedOn: "2026-10-20" },
    { method: "donated", disposedOn: "2026-02-30" }, { method: "donated", notes: "😀".repeat(501) },
  ]) expect(schema.safeParse({ ...base, ...input }).success, JSON.stringify(input)).toBe(false);
  expect(schema.safeParse({ ...base, method: "donated", notes: "😀".repeat(500) }).success).toBe(true);
});

test("validates exact settings integer ranges, timezone and nullable override", () => {
  expect(idleSettingsSchema.safeParse({}).success).toBe(false);
  for (const input of [
    { idleDays: 1, watchDays: 1, timeZone: "America/New_York", seasonOverride: null },
    { idleDays: 3650, watchDays: 365, timeZone: "UTC", seasonOverride: "autumn" },
  ]) expect(idleSettingsSchema.safeParse(input).success).toBe(true);
  for (const input of [
    { idleDays: 0 }, { idleDays: 3651 }, { idleDays: 1.5 }, { idleDays: "90" }, { idleDays: Infinity },
    { watchDays: 0 }, { watchDays: 366 }, { watchDays: NaN }, { timeZone: "not/a-zone" }, { timeZone: "+01:00" },
    { seasonOverride: "monsoon" }, { userId: "other" },
  ]) expect(idleSettingsSchema.safeParse({ idleDays: 90, watchDays: 30, timeZone: "UTC", seasonOverride: null, ...input }).success).toBe(false);
});
