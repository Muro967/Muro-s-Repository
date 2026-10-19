import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { accessorySubcategories, itemCategories, itemStyles, seasons } from "./item-catalog";
import { ItemError, type ItemRepository, type OriginalUpload, type VerifiedImage } from "./item-repository";
import { pastOrTodayDateSchema } from "./item-validation";
import { MAX_UPLOAD_BYTES, type StorageProvider } from "../storage/storage-provider";

const boundedText = (max: number, min = 0) => z.string().trim().refine((value) => [...value].length >= min && [...value].length <= max);
const unique = <T extends z.ZodType>(schema: T, max: number) => z.array(schema).max(max).refine((values) => new Set(values).size === values.length);
export function editableItemSchema(today: string) {
  return z.strictObject({
    name: boundedText(80).optional(),
    categoryId: z.enum(itemCategories.map(({ id }) => id)).nullable().optional(),
    accessoryId: z.enum(accessorySubcategories.map(({ id }) => id)).nullable().optional(),
    colorNames: unique(boundedText(32, 1), 8).optional(),
    colorHexes: unique(z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((s) => s.toUpperCase()), 8).optional(),
    styleIds: unique(z.enum(itemStyles.map(({ id }) => id)), 12).optional(),
    seasonIds: unique(z.enum(seasons.map(({ id }) => id)), 4).optional(),
    thickness: boundedText(80).nullable().optional(), material: boundedText(80).nullable().optional(),
    fit: boundedText(80).nullable().optional(), length: boundedText(80).nullable().optional(),
    formality: boundedText(80).nullable().optional(), brand: boundedText(80).nullable().optional(),
    notes: boundedText(1000).nullable().optional(), wardrobeId: z.uuid().nullable().optional(),
    zoneId: z.uuid().nullable().optional(), manualLastWornOn: pastOrTodayDateSchema(today).nullable().optional(),
  });
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ItemError("INVALID_INPUT");
  return parsed.data;
}
export function itemResourceId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new ItemError("NOT_FOUND");
  return id;
}
function assertStaticPng(bytes: Buffer): void {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new ItemError("INVALID_IMAGE");
  let offset = 8;
  let ended = false;
  while (offset < bytes.length) {
    // A chunk needs its length, four-byte type, payload and four-byte CRC.
    const remaining = bytes.length - offset;
    if (remaining < 12) throw new ItemError("INVALID_IMAGE");
    const length = bytes.readUInt32BE(offset);
    if (length > remaining - 12) throw new ItemError("INVALID_IMAGE");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    // libvips can expose only APNG's default image, without metadata.pages.
    if (type === "acTL" || type === "fcTL" || type === "fdAT") throw new ItemError("INVALID_IMAGE");
    offset += length + 12;
    if (ended) throw new ItemError("INVALID_IMAGE");
    if (type === "IEND") {
      if (length !== 0) throw new ItemError("INVALID_IMAGE");
      ended = true;
    }
  }
  if (!ended) throw new ItemError("INVALID_IMAGE");
}
async function verifyImage(upload: OriginalUpload, provider: StorageProvider): Promise<VerifiedImage> {
  const stream = await provider.openObject(upload.objectKey);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES || size > upload.sizeBytes) throw new ItemError("INVALID_IMAGE");
      chunks.push(value);
    }
    if (size !== upload.sizeBytes) throw new ItemError("INVALID_IMAGE");
    const bytes = Buffer.concat(chunks);
    if (upload.contentType === "image/png") assertStaticPng(bytes);
    const options = { limitInputPixels: 40_000_000, failOn: "warning" as const, animated: true };
    const metadata = await sharp(bytes, options).metadata();
    const mime = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[metadata.format as string];
    if (!mime || mime !== upload.contentType || !metadata.width || !metadata.height || metadata.width > 12_000 || metadata.height > 12_000 || metadata.width * metadata.height > 40_000_000 || (metadata.pages ?? 1) !== 1) throw new ItemError("INVALID_IMAGE");
    // metadata alone accepts truncated files; force the decoder to read all pixels.
    await sharp(bytes, options).raw().toBuffer();
    return { ...upload, width: metadata.width, height: metadata.height };
  } catch { throw new ItemError("INVALID_IMAGE"); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export type ItemServiceDependencies = { repository: ItemRepository; provider: StorageProvider; today: () => string };
export function createItemService({ repository, provider, today }: ItemServiceDependencies) {
  return {
    async createDraft(userId: string, input: unknown) { return repository.createDraft(userId, parse(editableItemSchema(today()), input)); },
    async updateItem(userId: string, id: string, input: unknown) { return repository.updateItem(userId, itemResourceId(id), parse(editableItemSchema(today()), input)); },
    async readItem(userId: string, id: string) {
      const item = await repository.findItem(userId, itemResourceId(id));
      if (!item) throw new ItemError("NOT_FOUND");
      return item;
    },
    async activateItem(userId: string, id: string, input: unknown = {}) {
      parse(z.strictObject({}), input);
      return repository.activateItem(userId, itemResourceId(id), today());
    },
    async attachOriginal(userId: string, id: string, uploadId: string) {
      itemResourceId(id); itemResourceId(uploadId);
      const item = await repository.findItem(userId, id);
      if (!item) throw new ItemError("NOT_FOUND");
      if (item.deletedAt || !["draft", "active"].includes(item.status)) throw new ItemError("ITEM_NOT_EDITABLE");
      const upload = await repository.findCompletedOriginalUpload(userId, uploadId);
      if (!upload) throw new ItemError("NOT_FOUND");
      const image = await verifyImage(upload, provider);
      await repository.attachOriginal(userId, id, uploadId, image);
    },
  };
}
