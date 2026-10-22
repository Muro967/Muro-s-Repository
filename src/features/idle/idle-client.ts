import { z } from "zod";
import { ItemClientError, itemRequest } from "../items/item-upload-client";
import { seasons } from "../items/item-catalog";
import type { DisposalInput, DisposalMethod } from "./idle-repository";

export const disposalChoices: { id: DisposalMethod; label: string; description: string }[] = [
  { id: "sold", label: "二手卖出", description: "记录售价和平台" },
  { id: "gifted", label: "送给朋友", description: "记下送给谁" },
  { id: "donated", label: "捐赠", description: "公益机构或旧衣箱" },
  { id: "recycled", label: "旧衣回收", description: "回收点或上门回收" },
  { id: "upcycled", label: "改造", description: "改成别的单品" },
  { id: "discarded", label: "丢弃", description: "破损无法再穿" },
];
const methodSchema = z.enum(["sold", "gifted", "donated", "recycled", "upcycled", "discarded"]);
export const idleSettingsSchema = z.object({ idleDays: z.number().int().min(1).max(3650), watchDays: z.number().int().min(1).max(365), timeZone: z.string(), seasonOverride: z.enum(seasons.map(({ id }) => id)).nullable() });
export type ClientIdleSettings = z.infer<typeof idleSettingsSchema>;
const itemSchema = z.object({
  id: z.uuid(), name: z.string(), categoryId: z.string().nullable(), wardrobeId: z.uuid().nullable(), zoneId: z.uuid().nullable(),
  status: z.enum(["draft", "active", "watching", "disposed"]), addedOn: z.iso.date().nullable(), manualLastWornOn: z.iso.date().nullable(),
  seasonIds: z.array(z.enum(seasons.map(({ id }) => id))), watchStartedOn: z.iso.date().nullable(), watchDueOn: z.iso.date().nullable(), deletedAt: z.string().nullable(),
  original: z.object({ assetId: z.uuid(), contentUrl: z.string() }).nullable(), isIdle: z.boolean(), isWatching: z.boolean(), isWatchOverdue: z.boolean(),
}).superRefine((item, ctx) => {
  if (item.original && item.original.contentUrl !== `/api/items/${item.id}/assets/${item.original.assetId}/content`) ctx.addIssue({ code: "custom", message: "Invalid private image" });
});
const disposalSchema = z.object({ id: z.uuid(), itemId: z.uuid(), method: methodSchema, disposedOn: z.iso.date(), saleAmountMinor: z.number().int().nonnegative().nullable(), currency: z.string().nullable(), platform: z.string().nullable(), recipient: z.string().nullable(), notes: z.string().nullable() });
export const idleDashboardSchema = z.object({
  items: z.array(itemSchema), disposals: z.array(disposalSchema.extend({ item: itemSchema })),
  statistics: z.object({ availableCount: z.number().int().nonnegative(), idleCount: z.number().int().nonnegative(), disposedCount: z.number().int().nonnegative(), idleRate: z.number().min(0).max(1), disposalRate: z.number().min(0).max(1), methodTotals: z.record(methodSchema, z.number().int().nonnegative()), soldIncomeByCurrency: z.record(z.string(), z.number().int().nonnegative()) }),
  settings: idleSettingsSchema, today: z.iso.date(), currentSeason: z.enum(seasons.map(({ id }) => id)),
});
export type IdleDashboardData = z.infer<typeof idleDashboardSchema>;
export const idleTimeZone = (data: IdleDashboardData) => data.settings.timeZone;
export type ClientIdleItem = z.infer<typeof itemSchema>;
async function idleRequest<T>(path: string, method: string, schema: z.ZodType<T>, body?: unknown, signal?: AbortSignal) {
  try { return await itemRequest(path, method, schema, body, signal); }
  catch (error) {
    if (signal?.aborted || error instanceof ItemClientError) throw error;
    throw new Error("暂时无法连接，请检查网络后重试。");
  }
}
export const idleClient = {
  read: (signal?: AbortSignal) => idleRequest("/api/idle", "GET", idleDashboardSchema, undefined, signal),
  async readSettings(signal?: AbortSignal) { return (await idleRequest("/api/settings/idle", "GET", z.object({ settings: idleSettingsSchema }), undefined, signal)).settings; },
  async saveSettings(settings: ClientIdleSettings, signal?: AbortSignal) { return (await idleRequest("/api/settings/idle", "PATCH", z.object({ settings: idleSettingsSchema }), settings, signal)).settings; },
  watch: (id: string, cancel = false, signal?: AbortSignal) => idleRequest(`/api/items/${encodeURIComponent(id)}/watch`, cancel ? "DELETE" : "POST", z.object({ item: z.object({ id: z.uuid(), status: z.enum(["active", "watching"]) }) }), {}, signal),
  dispose: (id: string, input: DisposalInput, signal?: AbortSignal) => idleRequest(`/api/items/${encodeURIComponent(id)}/disposal`, "POST", z.object({ disposal: disposalSchema }), input, signal),
};

export const currencyCodes = Intl.supportedValuesOf("currency");
function fractionDigits(currency: string) {
  if (!currencyCodes.includes(currency)) throw new Error("请选择有效的币种。");
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}
/** Decimal text -> integer minor units. Never multiply binary decimal floats. */
export function moneyToMinor(amount: string, currency: string): number {
  const digits = fractionDigits(currency);
  if (!/^\d+(?:\.\d+)?$/.test(amount)) throw new Error("请填写有效的非负售价。");
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > digits) throw new Error(`${currency} 售价最多填写 ${digits} 位小数。`);
  const minor = BigInt(whole!) * BigInt(10) ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
  if (minor > BigInt(2147483647)) throw new Error("售价超出可保存范围。");
  return Number(minor);
}
export function formatMinor(amount: number, currency: string) {
  const digits = fractionDigits(currency); const value = BigInt(amount).toString().padStart(digits + 1, "0");
  return `${currency} ${digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value}`;
}
export function dateDays(start: string, end: string) { return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000; }
