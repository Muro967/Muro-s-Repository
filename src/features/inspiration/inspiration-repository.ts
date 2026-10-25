import type { CompletedImageUpload, VerifiedImage } from "../storage/verified-image";
import type {
  EditableInspiration,
  EditableInspirationPatch,
  InspirationDetail,
} from "./inspiration-types";

export type CompletedInspirationUpload = CompletedImageUpload;

export type InspirationErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_IMAGE"
  | "ASSET_CONFLICT"
  | "VERSION_CONFLICT";

export class InspirationError extends Error {
  constructor(readonly code: InspirationErrorCode) {
    super(code);
    this.name = "InspirationError";
  }
}

export interface InspirationRepository {
  list(userId: string): Promise<InspirationDetail[]>;
  find(userId: string, id: string): Promise<InspirationDetail | null>;
  findCompletedUpload(userId: string, uploadId: string): Promise<CompletedInspirationUpload | null>;
  create(
    userId: string,
    uploadId: string,
    image: VerifiedImage,
    input: EditableInspiration,
  ): Promise<InspirationDetail>;
  update(
    userId: string,
    id: string,
    expectedVersion: number,
    patch: EditableInspirationPatch,
  ): Promise<InspirationDetail>;
  softDelete(
    userId: string,
    id: string,
    expectedVersion: number,
    now: Date,
  ): Promise<void>;
  findPrivateImage(userId: string, id: string): Promise<CompletedInspirationUpload | null>;
}
