import "server-only";
import { z } from "zod";
import { calendarDate } from "../items/item-lifecycle";
import { pastOrTodayDateSchema } from "../items/item-validation";
import { calculateIdleStatistics, deriveIdleState } from "./idle-policy";
import { disposalMethods, IdleError, type IdleRepository, type SavedIdleSettings } from "./idle-repository";

const text = (max: number) => z.string().trim().refine((value) => [...value].length > 0 && [...value].length <= max);
const currencies = new Set(Intl.supportedValuesOf("currency"));
export function disposalInputSchema(today: string) {
  const common = { disposedOn: pastOrTodayDateSchema(today), notes: z.string().refine((value) => [...value].length <= 500).optional() };
  return z.discriminatedUnion("method", [
    z.strictObject({ ...common, method: z.literal("sold"), saleAmountMinor: z.number().int().min(0).max(2147483647).optional(), currency: z.string().regex(/^[A-Z]{3}$/).refine((value) => currencies.has(value)).optional(), platform: text(120).optional() }),
    z.strictObject({ ...common, method: z.literal("gifted"), recipient: text(120).optional() }),
    z.strictObject({ ...common, method: z.literal("donated") }),
    z.strictObject({ ...common, method: z.literal("recycled") }),
    z.strictObject({ ...common, method: z.literal("upcycled") }),
    z.strictObject({ ...common, method: z.literal("discarded") }),
  ]).refine((value) => value.method !== "sold" || (value.saleAmountMinor === undefined) === (value.currency === undefined));
}
function resourceId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new IdleError("NOT_FOUND");
  return id;
}
function context(settings: SavedIdleSettings, now: Date) {
  const today = calendarDate(now, settings.timeZone);
  const month = Number(today.slice(5, 7));
  const currentSeason = settings.seasonOverride ?? (month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter");
  return { today, currentSeason } as const;
}
function emptyInput(input: unknown) {
  if (!z.strictObject({}).safeParse(input).success) throw new IdleError("INVALID_INPUT");
}
export function createIdleService(repository: IdleRepository, now: () => Date = () => new Date()) {
  return {
    async readIdleDashboard(userId: string) {
      const snapshot = await repository.readSnapshot(userId);
      const { today, currentSeason } = context(snapshot.settings, now());
      const items = snapshot.items.map((item) => ({ ...item, ...deriveIdleState(item, snapshot.settings, { today, currentSeason }) }));
      const retained = new Map(items.filter((item) => !item.deletedAt && item.status === "disposed").map((item) => [item.id, item]));
      const disposals = snapshot.disposals.filter((record) => retained.has(record.itemId)).map((record) => ({ ...record, item: retained.get(record.itemId)! }));
      const methodTotals = Object.fromEntries(disposalMethods.map((method) => [method, 0])) as Record<typeof disposalMethods[number], number>;
      const soldIncomeByCurrency: Record<string, number> = {};
      for (const record of disposals) {
        methodTotals[record.method]++;
        if (record.method === "sold" && record.currency && record.saleAmountMinor !== null) soldIncomeByCurrency[record.currency] = (soldIncomeByCurrency[record.currency] ?? 0) + record.saleAmountMinor;
      }
      return { items: items.filter((item) => !item.deletedAt && (item.isIdle || item.status === "watching")), disposals, statistics: { ...calculateIdleStatistics(items), methodTotals, soldIncomeByCurrency }, settings: snapshot.settings, today, currentSeason };
    },
    async startWatching(userId: string, id: string, input: unknown = {}) {
      resourceId(id); emptyInput(input);
      return repository.write(userId, async (tx) => {
        const item = await tx.findItem(id);
        if (item.deletedAt) throw new IdleError("INVALID_STATE");
        if (item.status === "watching") return item;
        const settings = await tx.readSettings();
        const current = context(settings, now());
        if (item.status !== "active" || !deriveIdleState(item, settings, current).isIdle) throw new IdleError("INVALID_STATE");
        const due = new Date(`${current.today}T00:00:00.000Z`);
        due.setUTCDate(due.getUTCDate() + settings.watchDays);
        await tx.setWatch(id, { status: "watching", watchStartedOn: current.today, watchDueOn: due.toISOString().slice(0, 10) });
        return tx.findItem(id);
      });
    },
    async cancelWatching(userId: string, id: string, input: unknown = {}) {
      resourceId(id); emptyInput(input);
      return repository.write(userId, async (tx) => {
        const item = await tx.findItem(id);
        if (item.deletedAt || !["active", "watching"].includes(item.status)) throw new IdleError("INVALID_STATE");
        if (item.status === "watching") await tx.setWatch(id, { status: "active", watchStartedOn: null, watchDueOn: null });
        return tx.findItem(id);
      });
    },
    async disposeItem(userId: string, id: string, input: unknown) {
      resourceId(id);
      return repository.write(userId, async (tx) => {
        const item = await tx.findItem(id);
        const settings = await tx.readSettings();
        const parsed = disposalInputSchema(context(settings, now()).today).safeParse(input);
        if (!parsed.success) throw new IdleError("INVALID_INPUT");
        if (item.deletedAt) throw new IdleError("INVALID_STATE");
        const existing = await tx.findDisposal(id);
        if (item.status === "disposed" && existing) return existing;
        if (!["active", "watching"].includes(item.status) || existing) throw new IdleError("INVALID_STATE");
        const record = await tx.insertDisposal(id, parsed.data);
        await tx.setWatch(id, { status: "disposed", watchStartedOn: null, watchDueOn: null });
        return record;
      });
    },
  };
}
