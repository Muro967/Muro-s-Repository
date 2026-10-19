import type { IdleContext, IdlePolicyItem, IdleSettings, IdleState, IdleStatistics, IdleStatisticsItem } from "./idle-types";

function calendarDaysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000;
}

function notIdle(): IdleState {
  return { isIdle: false, isWatching: false, isWatchOverdue: false };
}

export function deriveIdleState(item: IdlePolicyItem, settings: IdleSettings, context: IdleContext): IdleState {
  if (item.deletedAt || !item.addedOn || (item.status !== "active" && item.status !== "watching")) return notIdle();
  if (calendarDaysBetween(item.addedOn, context.today) < 30) return notIdle();
  if (item.seasonIds.length > 0 && !item.seasonIds.includes(context.currentSeason)) return notIdle();

  const baseline = item.manualLastWornOn ?? item.addedOn;
  const isIdle = calendarDaysBetween(baseline, context.today) > settings.idleDays;
  return {
    isIdle,
    isWatching: item.status === "watching",
    isWatchOverdue: isIdle && item.status === "watching" && Boolean(item.watchDueOn && item.watchDueOn < context.today),
  };
}

export function calculateIdleStatistics(items: readonly IdleStatisticsItem[]): IdleStatistics {
  let availableCount = 0;
  let idleCount = 0;
  let disposedCount = 0;

  for (const item of items) {
    if (item.deletedAt) continue;
    if (item.status === "active" || item.status === "watching") {
      availableCount += 1;
      if (item.isIdle) idleCount += 1;
    } else if (item.status === "disposed") {
      disposedCount += 1;
    }
  }

  const disposalTotal = disposedCount + idleCount;
  return {
    availableCount,
    idleCount,
    disposedCount,
    idleRate: availableCount === 0 ? 0 : idleCount / availableCount,
    disposalRate: disposalTotal === 0 ? 0 : disposedCount / disposalTotal,
  };
}
