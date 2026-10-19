import type { AccessoryId, CategoryId, ItemStatus, SeasonId, StyleId } from "./item-types";
import type { UploadContentType } from "../storage/storage-provider";

export type EditableItemPatch = Partial<{
  name: string; categoryId: CategoryId | null; accessoryId: AccessoryId | null;
  colorNames: string[]; colorHexes: string[]; styleIds: StyleId[]; seasonIds: SeasonId[];
  thickness: string | null; material: string | null; fit: string | null; length: string | null;
  formality: string | null; brand: string | null; notes: string | null;
  wardrobeId: string | null; zoneId: string | null; manualLastWornOn: string | null;
}>;
export type CreateDraftInput = EditableItemPatch;
export type ItemDetail = Required<EditableItemPatch> & {
  id: string; status: ItemStatus; addedOn: string | null; watchStartedOn: string | null;
  watchDueOn: string | null; deletedAt: Date | null; createdAt: Date; updatedAt: Date;
  original: { id: string; uploadId: string } | null;
};
export type OriginalUpload = { id: string; objectKey: string; contentType: UploadContentType; sizeBytes: number };
export type VerifiedImage = OriginalUpload & { width: number; height: number };
export class ItemError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_INPUT" | "ITEM_INCOMPLETE" | "ITEM_NOT_EDITABLE" | "INVALID_IMAGE" | "ASSET_CONFLICT") {
    super(code); this.name = "ItemError";
  }
}
export interface ItemRepository {
  createDraft(userId: string, input: CreateDraftInput): Promise<ItemDetail>;
  updateItem(userId: string, itemId: string, patch: EditableItemPatch): Promise<ItemDetail>;
  attachOriginal(userId: string, itemId: string, uploadId: string, image: VerifiedImage): Promise<void>;
  activateItem(userId: string, itemId: string, today: string): Promise<ItemDetail>;
  findItem(userId: string, itemId: string): Promise<ItemDetail | null>;
  findCompletedOriginalUpload(userId: string, uploadId: string): Promise<OriginalUpload | null>;
  findPrivateImage(userId: string, itemId: string, assetId: string): Promise<OriginalUpload | null>;
}
