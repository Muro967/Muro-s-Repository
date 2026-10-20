import type { SeasonId } from "../items/item-types";
import type { IdlePolicyItem, IdleSettings } from "./idle-types";

export const disposalMethods = ["sold", "gifted", "donated", "recycled", "upcycled", "discarded"] as const;
export type DisposalMethod = typeof disposalMethods[number];
export type SavedIdleSettings = IdleSettings & { timeZone: string; seasonOverride: SeasonId | null };
export type IdleItem = IdlePolicyItem & {
  id: string; name: string; categoryId: string | null; wardrobeId: string | null; zoneId: string | null;
  watchStartedOn: string | null; watchDueOn: string | null;
  original: { assetId: string; contentUrl: string } | null;
};
export type DisposalInput = {
  method: DisposalMethod; disposedOn: string; saleAmountMinor?: number; currency?: string;
  platform?: string; recipient?: string; notes?: string;
};
export type DisposalRecord = {
  id: string; itemId: string; method: DisposalMethod; disposedOn: string; saleAmountMinor: number | null;
  currency: string | null; platform: string | null; recipient: string | null; notes: string | null;
};
export type IdleSnapshot = { settings: SavedIdleSettings; items: IdleItem[]; disposals: DisposalRecord[] };
export class IdleError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATE") { super(code); this.name = "IdleError"; }
}
export interface IdleTransaction {
  readSettings(): Promise<SavedIdleSettings>;
  updateSettings(patch: Partial<SavedIdleSettings>): Promise<SavedIdleSettings>;
  findItem(id: string): Promise<IdleItem>;
  setWatch(id: string, state: { status: "active" | "watching" | "disposed"; watchStartedOn: string | null; watchDueOn: string | null }): Promise<void>;
  findDisposal(id: string): Promise<DisposalRecord | null>;
  insertDisposal(id: string, input: DisposalInput): Promise<DisposalRecord>;
}
export interface IdleRepository {
  readSnapshot(userId: string): Promise<IdleSnapshot>;
  write<T>(userId: string, action: (transaction: IdleTransaction) => Promise<T>): Promise<T>;
}
