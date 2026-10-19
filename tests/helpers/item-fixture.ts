import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createItemService } from "@/features/items/item-service";
import { DrizzleItemRepository } from "@/server/db/drizzle-item-repository";
import { uploads } from "@/server/db/schema";
import { FakeStorageProvider } from "./fake-storage-provider";
import { wardrobeFixture } from "./wardrobe-fixture";

export async function itemFixture() {
  const f = await wardrobeFixture();
  const repository = new DrizzleItemRepository(f.database);
  const provider = new FakeStorageProvider();
  const today = () => "2026-10-19";
  const service = createItemService({ repository, provider, today });
  async function upload(bytes?: Buffer, options: { userId?: string; kind?: "wardrobe-original" | "inspiration"; status?: string; contentType?: string } = {}) {
    const data = bytes ?? await sharp({ create: { width: 2, height: 3, channels: 3, background: "red" } }).jpeg().toBuffer();
    const id = randomUUID();
    const objectKey = `private/${id}`;
    await f.database.insert(uploads).values({ id, userId: options.userId ?? f.user.id, objectKey, kind: options.kind ?? "wardrobe-original", contentType: options.contentType ?? "image/jpeg", sizeBytes: data.length, status: options.status ?? "completed", completedAt: options.status === "pending" ? null : f.now() });
    provider.objects.set(objectKey, data);
    return { id, objectKey, data };
  }
  const complete = { name: "Shirt", categoryId: "tops", wardrobeId: f.source.id, zoneId: f.source.zones[0]!.id };
  return { ...f, wardrobeRepository: f.repository, repository, provider, today, service, upload, complete };
}
