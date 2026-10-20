import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { IdleError, type DisposalInput, type IdleItem, type IdleRepository, type IdleTransaction, type SavedIdleSettings } from "@/features/idle/idle-repository";
import { disposalRecords, itemAssets, items, users, userSettings } from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

type Transaction = Parameters<Parameters<PgliteAppDatabase["transaction"]>[0]>[0];
const settingFields = { idleDays: userSettings.idleDays, watchDays: userSettings.watchDays, timeZone: userSettings.timeZone, seasonOverride: userSettings.seasonOverride };
const itemFields = { id: items.id, name: items.name, categoryId: items.categoryId, wardrobeId: items.wardrobeId, zoneId: items.zoneId, status: items.status, addedOn: items.addedOn, manualLastWornOn: items.manualLastWornOn, seasonIds: items.seasonIds, watchStartedOn: items.watchStartedOn, watchDueOn: items.watchDueOn, deletedAt: items.deletedAt, assetId: itemAssets.id };
const disposalFields = { id: disposalRecords.id, itemId: disposalRecords.itemId, method: disposalRecords.method, disposedOn: disposalRecords.disposedOn, saleAmountMinor: disposalRecords.saleAmountMinor, currency: disposalRecords.currency, platform: disposalRecords.platform, recipient: disposalRecords.recipient, notes: disposalRecords.notes };
const itemFilter = (userId: string, id: string) => and(eq(items.userId, userId), eq(items.id, id));
function publicItem({ assetId, ...item }: Omit<IdleItem, "original"> & { assetId: string | null }): IdleItem {
  return { ...item, original: assetId ? { assetId, contentUrl: `/api/items/${item.id}/assets/${assetId}/content` } : null };
}
async function settings(db: Transaction, userId: string) {
  const [value] = await db.select(settingFields).from(userSettings).where(eq(userSettings.userId, userId));
  if (!value) throw new IdleError("NOT_FOUND");
  return value;
}
function projections(db: Transaction, userId: string) {
  return db.select(itemFields).from(items).leftJoin(itemAssets, and(eq(itemAssets.userId, userId), eq(itemAssets.itemId, items.id), eq(itemAssets.role, "original")));
}
export class DrizzleIdleRepository implements IdleRepository {
  private readonly db: PgliteAppDatabase;
  constructor(database: AppDatabase) { this.db = database as PgliteAppDatabase; }
  async readSnapshot(userId: string) {
    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(sql`set transaction isolation level repeatable read`);
        const value = await settings(tx, userId);
        const owned = await projections(tx, userId).where(eq(items.userId, userId)).orderBy(asc(items.id));
        const disposals = await tx.select(disposalFields).from(disposalRecords).where(eq(disposalRecords.userId, userId)).orderBy(asc(disposalRecords.id));
        return { settings: value, items: owned.map(publicItem), disposals };
      });
    } catch (error) { if (error instanceof IdleError) throw error; throw new Error("Idle lookup failed"); }
  }
  async write<T>(userId: string, action: (transaction: IdleTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async (tx) => {
        // All inventory writers take this tenant lock before settings or item locks.
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        if (!user) throw new IdleError("NOT_FOUND");
        return action({
          readSettings: () => settings(tx, userId),
          updateSettings: async (patch: Partial<SavedIdleSettings>) => {
            const [value] = await tx.update(userSettings).set(patch).where(eq(userSettings.userId, userId)).returning(settingFields);
            if (!value) throw new IdleError("NOT_FOUND");
            return value;
          },
          findItem: async (id) => {
            // Lock the owned item first; do not lock the nullable side of a left join.
            const [item] = await tx.select({ id: items.id }).from(items).where(itemFilter(userId, id)).for("update");
            if (!item) throw new IdleError("NOT_FOUND");
            const [value] = await projections(tx, userId).where(itemFilter(userId, id));
            return publicItem(value!);
          },
          setWatch: async (id, state) => { await tx.update(items).set({ ...state, updatedAt: new Date() }).where(itemFilter(userId, id)); },
          findDisposal: async (id) => {
            const [value] = await tx.select(disposalFields).from(disposalRecords).where(and(eq(disposalRecords.userId, userId), eq(disposalRecords.itemId, id)));
            return value ?? null;
          },
          insertDisposal: async (id: string, input: DisposalInput) => {
            const [value] = await tx.insert(disposalRecords).values({ ...input, userId, itemId: id }).returning(disposalFields);
            return value!;
          },
        });
      });
    } catch (error) { if (error instanceof IdleError) throw error; throw new Error("Idle persistence failed"); }
  }
}
