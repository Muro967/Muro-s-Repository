import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { hashPassword } from "../../../src/features/auth/crypto";
import { schema } from "../../../src/server/db/schema";
import type { AppDatabase } from "../../../src/server/db/types";

// Called only by the guarded reset, before Next opens its single PGlite writer.
// Dates are relative to real UTC today; production has no test clock/backdoor.
export async function seedIdleInventory(database: AppDatabase, uploadRoot: string) {
  const today = new Date().toISOString().slice(0, 10);
  const fixtureRoot = join(uploadRoot, "..", "fixtures");
  await mkdir(fixtureRoot, { recursive: true, mode: 0o700 });
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp({ create: { width: 240, height: 240, channels: 3, background: { r: 181, g: 137, b: 98 } } }).toFormat(format).toBuffer();
    await writeFile(join(fixtureRoot, `generated.${format}`), bytes, { flag: "wx" });
  }
  const ago = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const passwordHash = await hashPassword("wardrobe-e2e-password-2026");
  const [outsider] = await database.insert(schema.users).values({ email: "outsider@example.test", name: "隔离测试", passwordHash, onboardingComplete: true }).returning();
  await database.insert(schema.userSettings).values({ userId: outsider.id });
  const [user] = await database.insert(schema.users).values({ email: "idle@example.test", name: "测试衣橱", passwordHash, onboardingComplete: true }).returning();
  await database.insert(schema.userSettings).values({ userId: user.id, seasonOverride: "autumn" });
  const [wardrobe] = await database.insert(schema.wardrobes).values({ userId: user.id, name: "旧衣衣柜" }).returning();
  const [zone] = await database.insert(schema.zones).values({ userId: user.id, wardrobeId: wardrobe.id, name: "挂衣区", kind: "hang" }).returning();
  const fixtures = [
    { name: "焦糖旧风衣", status: "active" as const },
    { name: "蓝色旧衬衫", status: "active" as const },
    { name: "燕麦旧围巾", status: "watching" as const, watchStartedOn: ago(35), watchDueOn: ago(5) },
    { name: "非当季夏裙", status: "active" as const, seasonIds: ["summer" as const] },
    { name: "新入库外套", status: "active" as const, addedOn: today },
    { name: "未完成草稿", status: "draft" as const },
    { name: "回收站旧衣", status: "active" as const, deletedAt: new Date() },
    { name: "历史捐赠", status: "disposed" as const },
  ];
  const bytes = await sharp({ create: { width: 240, height: 240, channels: 3, background: "#b58962" } }).png().toBuffer();
  for (const fixture of fixtures) {
    const [item] = await database.insert(schema.items).values({ userId: user.id, wardrobeId: wardrobe.id, zoneId: zone.id, categoryId: "outerwear", addedOn: ago(200), manualLastWornOn: ago(150), ...fixture }).returning();
    const objectKey = `users/${user.id}/wardrobe-original/${today.slice(0, 4)}/${today.slice(5, 7)}/${randomUUID()}.png`;
    const path = join(uploadRoot, objectKey);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    const [upload] = await database.insert(schema.uploads).values({ userId: user.id, objectKey, kind: "wardrobe-original", contentType: "image/png", sizeBytes: bytes.length, status: "completed", completedAt: new Date() }).returning();
    await database.insert(schema.itemAssets).values({ userId: user.id, itemId: item.id, uploadId: upload.id, role: "original" });
    if (fixture.status === "disposed") await database.insert(schema.disposalRecords).values({ userId: user.id, itemId: item.id, method: "donated", disposedOn: ago(10) });
  }
}
