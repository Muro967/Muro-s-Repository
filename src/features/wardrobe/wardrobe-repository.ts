import type { ZoneKind } from "./wardrobe-types";

export type Zone = { id: string; wardrobeId: string; name: string; kind: ZoneKind; sortOrder: number };
export type WardrobeTree = { id: string; name: string; sortOrder: number; zones: Zone[] };
export type CreateZoneInput = { name: string; kind: ZoneKind };
export class WardrobeError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_INPUT" | "LOCATION_REQUIRED" | "LAST_WARDROBE") {
    super(code);
    this.name = "WardrobeError";
  }
}
export interface WardrobeRepository {
  list(userId: string): Promise<WardrobeTree[]>;
  createWardrobe(userId: string, input: { name: string }): Promise<WardrobeTree>;
  renameWardrobe(userId: string, wardrobeId: string, name: string): Promise<void>;
  reorderWardrobes(userId: string, orderedIds: string[]): Promise<void>;
  deleteWardrobe(userId: string, wardrobeId: string, destinationZoneId?: string): Promise<void>;
  createZone(userId: string, wardrobeId: string, input: CreateZoneInput): Promise<Zone>;
  renameZone(userId: string, zoneId: string, name: string): Promise<void>;
  reorderZones(userId: string, wardrobeId: string, orderedIds: string[]): Promise<void>;
  deleteZone(userId: string, zoneId: string, destinationZoneId?: string): Promise<void>;
}
