import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { WardrobeError, type CreateZoneInput, type WardrobeRepository, type WardrobeTree, type Zone } from "@/features/wardrobe/wardrobe-repository";
import { items, users, wardrobes, zones } from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

type Transaction = Parameters<Parameters<PgliteAppDatabase["transaction"]>[0]>[0];
type WardrobeRow = typeof wardrobes.$inferSelect;
type ZoneRow = typeof zones.$inferSelect;
type LockedLocations = { wardrobes: WardrobeRow[]; zones: ZoneRow[] };
const zoneFields = { id: zones.id, wardrobeId: zones.wardrobeId, name: zones.name, kind: zones.kind, sortOrder: zones.sortOrder };
const wardrobeFields = { id: wardrobes.id, name: wardrobes.name, sortOrder: wardrobes.sortOrder };
function owned<T extends { id: string }>(rows: T[], id: string): T {
  const row = rows.find((row) => row.id === id);
  if (!row) throw new WardrobeError("NOT_FOUND");
  return row;
}
function fullOrder(siblings: { id: string }[], allOwned: { id: string }[], ids: string[]) {
  if (ids.some((id) => !allOwned.some((row) => row.id === id))) throw new WardrobeError("NOT_FOUND");
  if (ids.length !== siblings.length || new Set(ids).size !== ids.length || ids.some((id) => !siblings.some((row) => row.id === id))) throw new WardrobeError("INVALID_INPUT");
}
function nextOrder(rows: { sortOrder: number }[]) { return Math.max(-1, ...rows.map((row) => row.sortOrder)) + 1; }

export class DrizzleWardrobeRepository implements WardrobeRepository {
  private readonly db: PgliteAppDatabase;
  constructor(database: AppDatabase) { this.db = database as PgliteAppDatabase; }

  private async write<T>(userId: string, action: (tx: Transaction, locations: LockedLocations) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async (tx) => {
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        if (!user) throw new WardrobeError("NOT_FOUND");
        // All location writes use the same user -> wardrobes -> zones lock order.
        // Locking owned siblings also makes complete-list validation atomic.
        const ownedWardrobes = await tx.select().from(wardrobes).where(eq(wardrobes.userId, userId)).orderBy(asc(wardrobes.id)).for("update");
        const ownedZones = await tx.select().from(zones).where(eq(zones.userId, userId)).orderBy(asc(zones.id)).for("update");
        return action(tx, { wardrobes: ownedWardrobes, zones: ownedZones });
      });
    } catch (error) {
      if (error instanceof WardrobeError) throw error;
      throw new Error("Wardrobe persistence failed");
    }
  }

  async list(userId: string): Promise<WardrobeTree[]> {
    try {
      const rows = await this.db.select({ wardrobe: wardrobeFields, zone: zoneFields }).from(wardrobes)
        .leftJoin(zones, and(eq(zones.userId, wardrobes.userId), eq(zones.wardrobeId, wardrobes.id)))
        .where(eq(wardrobes.userId, userId)).orderBy(asc(wardrobes.sortOrder), asc(wardrobes.id), asc(zones.sortOrder), asc(zones.id));
      const result = new Map<string, WardrobeTree>();
      for (const row of rows) {
        if (!result.has(row.wardrobe.id)) result.set(row.wardrobe.id, { ...row.wardrobe, zones: [] });
        if (row.zone) result.get(row.wardrobe.id)!.zones.push(row.zone);
      }
      return [...result.values()];
    } catch { throw new Error("Wardrobe lookup failed"); }
  }

  createWardrobe(userId: string, input: { name: string }): Promise<WardrobeTree> {
    return this.write(userId, async (tx, locations) => {
      const [row] = await tx.insert(wardrobes).values({ userId, name: input.name, sortOrder: nextOrder(locations.wardrobes) }).returning(wardrobeFields);
      return { ...row!, zones: [] };
    });
  }
  renameWardrobe(userId: string, id: string, name: string): Promise<void> {
    return this.write(userId, async (tx, locations) => {
      owned(locations.wardrobes, id);
      await tx.update(wardrobes).set({ name, updatedAt: new Date() }).where(and(eq(wardrobes.userId, userId), eq(wardrobes.id, id)));
    });
  }
  reorderWardrobes(userId: string, ids: string[]): Promise<void> {
    return this.write(userId, async (tx, locations) => {
      fullOrder(locations.wardrobes, locations.wardrobes, ids);
      for (const [sortOrder, id] of ids.entries()) await tx.update(wardrobes).set({ sortOrder, updatedAt: new Date() }).where(and(eq(wardrobes.userId, userId), eq(wardrobes.id, id)));
    });
  }
  createZone(userId: string, wardrobeId: string, input: CreateZoneInput): Promise<Zone> {
    return this.write(userId, async (tx, locations) => {
      owned(locations.wardrobes, wardrobeId);
      const [row] = await tx.insert(zones).values({ userId, wardrobeId, ...input, sortOrder: nextOrder(locations.zones.filter((zone) => zone.wardrobeId === wardrobeId)) }).returning(zoneFields);
      return row!;
    });
  }
  renameZone(userId: string, id: string, name: string): Promise<void> {
    return this.write(userId, async (tx, locations) => {
      owned(locations.zones, id);
      await tx.update(zones).set({ name, updatedAt: new Date() }).where(and(eq(zones.userId, userId), eq(zones.id, id)));
    });
  }
  reorderZones(userId: string, wardrobeId: string, ids: string[]): Promise<void> {
    return this.write(userId, async (tx, locations) => {
      owned(locations.wardrobes, wardrobeId);
      fullOrder(locations.zones.filter((zone) => zone.wardrobeId === wardrobeId), locations.zones, ids);
      for (const [sortOrder, id] of ids.entries()) await tx.update(zones).set({ sortOrder, updatedAt: new Date() }).where(and(eq(zones.userId, userId), eq(zones.id, id)));
    });
  }
  deleteWardrobe(userId: string, id: string, destinationZoneId?: string): Promise<void> {
    return this.write(userId, async (tx, locations) => {
      owned(locations.wardrobes, id);
      const target = destinationZoneId ? owned(locations.zones, destinationZoneId) : undefined;
      if (locations.wardrobes.length === 1) throw new WardrobeError("LAST_WARDROBE");
      if (target?.wardrobeId === id) throw new WardrobeError("LOCATION_REQUIRED");
      const filter = and(eq(items.userId, userId), eq(items.wardrobeId, id));
      const retained = await tx.select({ id: items.id }).from(items).where(filter).limit(1);
      if (retained.length && !target) throw new WardrobeError("LOCATION_REQUIRED");
      if (target) await tx.update(items).set({ wardrobeId: target.wardrobeId, zoneId: target.id, updatedAt: new Date() }).where(filter);
      const sourceZones = locations.zones.filter((zone) => zone.wardrobeId === id).map((zone) => zone.id);
      if (sourceZones.length) await tx.delete(zones).where(and(eq(zones.userId, userId), inArray(zones.id, sourceZones)));
      await tx.delete(wardrobes).where(and(eq(wardrobes.userId, userId), eq(wardrobes.id, id)));
    });
  }
  deleteZone(userId: string, id: string, destinationZoneId?: string): Promise<void> {
    return this.write(userId, async (tx, locations) => {
      owned(locations.zones, id);
      const target = destinationZoneId ? owned(locations.zones, destinationZoneId) : undefined;
      if (target?.id === id) throw new WardrobeError("LOCATION_REQUIRED");
      const filter = and(eq(items.userId, userId), eq(items.zoneId, id));
      const retained = await tx.select({ id: items.id }).from(items).where(filter).limit(1);
      if (retained.length && !target) throw new WardrobeError("LOCATION_REQUIRED");
      if (target) await tx.update(items).set({ wardrobeId: target.wardrobeId, zoneId: target.id, updatedAt: new Date() }).where(filter);
      await tx.delete(zones).where(and(eq(zones.userId, userId), eq(zones.id, id)));
    });
  }
}
