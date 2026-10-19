import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { ItemError, type CreateDraftInput, type EditableItemPatch, type ItemDetail, type ItemRepository, type OriginalUpload, type VerifiedImage } from "@/features/items/item-repository";
import type { UploadContentType } from "@/features/storage/storage-provider";
import { itemAssets, items, uploads, users, wardrobes, zones } from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

type Transaction = Parameters<Parameters<PgliteAppDatabase["transaction"]>[0]>[0];
type ItemRow = typeof items.$inferSelect;
type Locations = { wardrobes: (typeof wardrobes.$inferSelect)[]; zones: (typeof zones.$inferSelect)[] };
const originalFields = { id: uploads.id, objectKey: uploads.objectKey, contentType: uploads.contentType, sizeBytes: uploads.sizeBytes };
const originalFilter = (userId: string) => and(eq(uploads.userId, userId), eq(uploads.kind, "wardrobe-original"), eq(uploads.status, "completed"));
function editable(item: ItemRow) {
  if (item.deletedAt || !["draft", "active"].includes(item.status)) throw new ItemError("ITEM_NOT_EDITABLE");
}
function location(item: Pick<ItemRow, "wardrobeId" | "zoneId">, locations: Locations) {
  if (item.zoneId && !item.wardrobeId) throw new ItemError("INVALID_INPUT");
  if (item.wardrobeId && !locations.wardrobes.some((w) => w.id === item.wardrobeId)) throw new ItemError("NOT_FOUND");
  if (item.zoneId && !locations.zones.some((z) => z.id === item.zoneId && z.wardrobeId === item.wardrobeId)) throw new ItemError("NOT_FOUND");
}
function complete(item: ItemRow) {
  if (!item.name.trim() || !item.categoryId || !item.wardrobeId || !item.zoneId) throw new ItemError("ITEM_INCOMPLETE");
}
function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return ("code" in error && error.code === "23505") || ("cause" in error && uniqueViolation(error.cause));
}
export class DrizzleItemRepository implements ItemRepository {
  private readonly db: PgliteAppDatabase;
  constructor(database: AppDatabase) { this.db = database as PgliteAppDatabase; }
  private async write<T>(userId: string, action: (tx: Transaction, locations: Locations) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async (tx) => {
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        if (!user) throw new ItemError("NOT_FOUND");
        // Match container writes: user -> owned wardrobes -> owned zones -> resources.
        const ownedWardrobes = await tx.select().from(wardrobes).where(eq(wardrobes.userId, userId)).orderBy(asc(wardrobes.id)).for("update");
        const ownedZones = await tx.select().from(zones).where(eq(zones.userId, userId)).orderBy(asc(zones.id)).for("update");
        return action(tx, { wardrobes: ownedWardrobes, zones: ownedZones });
      });
    } catch (error) {
      if (error instanceof ItemError) throw error;
      if (uniqueViolation(error)) throw new ItemError("ASSET_CONFLICT");
      throw new Error("Item persistence failed");
    }
  }
  private async lockedItem(tx: Transaction, userId: string, id: string) {
    const [item] = await tx.select().from(items).where(and(eq(items.userId, userId), eq(items.id, id))).for("update");
    if (!item) throw new ItemError("NOT_FOUND");
    return item;
  }
  private async detail(db: Transaction | PgliteAppDatabase, item: ItemRow): Promise<ItemDetail> {
    const [original] = await db.select({ id: itemAssets.id, uploadId: itemAssets.uploadId }).from(itemAssets).where(and(eq(itemAssets.userId, item.userId), eq(itemAssets.itemId, item.id), eq(itemAssets.role, "original")));
    const { userId: _userId, ...publicItem } = item;
    void _userId;
    return { ...publicItem, original: original ?? null };
  }
  createDraft(userId: string, input: CreateDraftInput) {
    return this.write(userId, async (tx, locations) => {
      location({ wardrobeId: input.wardrobeId ?? null, zoneId: input.zoneId ?? null }, locations);
      const [item] = await tx.insert(items).values({ ...input, userId, status: "draft" }).returning();
      return this.detail(tx, item!);
    });
  }
  updateItem(userId: string, id: string, patch: EditableItemPatch) {
    return this.write(userId, async (tx, locations) => {
      const item = await this.lockedItem(tx, userId, id);
      editable(item);
      const merged = { ...item, ...patch };
      location(merged, locations);
      if (item.status === "active") {
        complete(merged);
        if (!await this.boundOriginal(tx, userId, id)) throw new ItemError("ITEM_INCOMPLETE");
      }
      const [updated] = await tx.update(items).set({ ...patch, updatedAt: new Date() }).where(and(eq(items.userId, userId), eq(items.id, id))).returning();
      return this.detail(tx, updated!);
    });
  }
  private async boundOriginal(tx: Transaction, userId: string, id: string) {
    const [asset] = await tx.select({ id: itemAssets.id, completedAt: uploads.completedAt }).from(itemAssets)
      .innerJoin(uploads, and(eq(uploads.id, itemAssets.uploadId), eq(uploads.userId, itemAssets.userId)))
      .where(and(eq(itemAssets.userId, userId), eq(itemAssets.itemId, id), eq(itemAssets.role, "original"), originalFilter(userId)));
    return asset?.completedAt ? asset : null;
  }
  activateItem(userId: string, id: string, today: string) {
    return this.write(userId, async (tx, locations) => {
      const item = await this.lockedItem(tx, userId, id);
      editable(item);
      if (item.status === "active") return this.detail(tx, item);
      location(item, locations); complete(item);
      if (!await this.boundOriginal(tx, userId, id)) throw new ItemError("ITEM_INCOMPLETE");
      const [updated] = await tx.update(items).set({ status: "active", addedOn: today, updatedAt: new Date() }).where(and(eq(items.userId, userId), eq(items.id, id))).returning();
      return this.detail(tx, updated!);
    });
  }
  attachOriginal(userId: string, id: string, uploadId: string, image: VerifiedImage) {
    return this.write(userId, async (tx) => {
      editable(await this.lockedItem(tx, userId, id));
      const [upload] = await tx.select().from(uploads).where(and(eq(uploads.id, uploadId), originalFilter(userId))).for("update");
      if (!upload?.completedAt) throw new ItemError("NOT_FOUND");
      if (upload.objectKey !== image.objectKey || upload.contentType !== image.contentType || upload.sizeBytes !== image.sizeBytes || upload.id !== image.id) throw new ItemError("ASSET_CONFLICT");
      const [bound] = await tx.select().from(itemAssets).where(eq(itemAssets.uploadId, uploadId)).for("update");
      if (bound) {
        if (bound.userId === userId && bound.itemId === id && bound.role === "original") return;
        throw new ItemError("ASSET_CONFLICT");
      }
      await tx.delete(itemAssets).where(and(eq(itemAssets.userId, userId), eq(itemAssets.itemId, id), eq(itemAssets.role, "original")));
      await tx.insert(itemAssets).values({ userId, itemId: id, uploadId, role: "original" });
    });
  }
  async findItem(userId: string, id: string) {
    try {
      const [item] = await this.db.select().from(items).where(and(eq(items.userId, userId), eq(items.id, id)));
      return item ? await this.detail(this.db, item) : null;
    } catch { throw new Error("Item lookup failed"); }
  }
  async findCompletedOriginalUpload(userId: string, id: string): Promise<OriginalUpload | null> {
    try {
      const [upload] = await this.db.select({ ...originalFields, completedAt: uploads.completedAt }).from(uploads).where(and(eq(uploads.id, id), originalFilter(userId)));
      return upload?.completedAt ? { id: upload.id, objectKey: upload.objectKey, contentType: upload.contentType as UploadContentType, sizeBytes: upload.sizeBytes } : null;
    } catch { throw new Error("Item lookup failed"); }
  }
  async findPrivateImage(userId: string, itemId: string, assetId: string): Promise<OriginalUpload | null> {
    try {
      const [upload] = await this.db.select({ ...originalFields, completedAt: uploads.completedAt }).from(items)
        .innerJoin(itemAssets, and(eq(itemAssets.itemId, items.id), eq(itemAssets.userId, items.userId)))
        .innerJoin(uploads, and(eq(uploads.id, itemAssets.uploadId), eq(uploads.userId, itemAssets.userId)))
        .where(and(eq(items.userId, userId), eq(items.id, itemId), eq(itemAssets.id, assetId), eq(itemAssets.role, "original"), originalFilter(userId)));
      if (!upload?.completedAt || !["image/jpeg", "image/png", "image/webp"].includes(upload.contentType)) return null;
      return { id: upload.id, objectKey: upload.objectKey, contentType: upload.contentType as UploadContentType, sizeBytes: upload.sizeBytes };
    } catch { throw new Error("Item image lookup failed"); }
  }
}
