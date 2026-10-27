import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { createInspirationService } from "@/features/inspiration/inspiration-service";
import { DrizzleInspirationRepository } from "@/server/db/drizzle-inspiration-repository";
import { uploads } from "@/server/db/schema";

import { FakeStorageProvider } from "./fake-storage-provider";
import { wardrobeFixture } from "./wardrobe-fixture";

export async function inspirationFixture() {
  const foundation = await wardrobeFixture();
  const repository = new DrizzleInspirationRepository(foundation.database);
  const provider = new FakeStorageProvider();
  const service = createInspirationService({
    repository,
    provider,
    now: foundation.now,
  });

  async function upload(
    bytes?: Buffer,
    options: {
      userId?: string;
      kind?: "wardrobe-original" | "inspiration";
      status?: "pending" | "completed";
      contentType?: "image/jpeg" | "image/png" | "image/webp";
    } = {},
  ) {
    const data = bytes ?? await sharp({
      create: { width: 2, height: 3, channels: 3, background: "gray" },
    }).jpeg().toBuffer();
    const id = randomUUID();
    const objectKey = `private/${id}`;
    const status = options.status ?? "completed";
    await foundation.database.insert(uploads).values({
      id,
      userId: options.userId ?? foundation.user.id,
      objectKey,
      kind: options.kind ?? "inspiration",
      contentType: options.contentType ?? "image/jpeg",
      sizeBytes: data.length,
      status,
      completedAt: status === "completed" ? foundation.now() : null,
    });
    provider.objects.set(objectKey, data);
    return { id, objectKey, data };
  }

  return { ...foundation, repository, provider, service, upload };
}
