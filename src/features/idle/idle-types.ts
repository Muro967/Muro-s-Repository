import type { ItemStatus, SeasonId } from "../items/item-types";

export type IdlePolicyItem = {
  status: ItemStatus;
  addedOn: string | null;
  manualLastWornOn: string | null;
  seasonIds: readonly SeasonId[];
  watchDueOn?: string | null;
  deletedAt?: Date | null;
};

export type IdleSettings = {
  idleDays: number;
  watchDays: number;
};

export type IdleContext = {
  today: string;
  currentSeason: SeasonId;
};

export type IdleState = {
  isIdle: boolean;
  isWatching: boolean;
  isWatchOverdue: boolean;
};

export type IdleStatisticsItem = {
  status: ItemStatus;
  isIdle: boolean;
  deletedAt?: Date | null;
};

export type IdleStatistics = {
  availableCount: number;
  idleCount: number;
  disposedCount: number;
  idleRate: number;
  disposalRate: number;
};
