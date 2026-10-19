// @vitest-environment node

import { calculateIdleStatistics } from "@/features/idle/idle-policy";

test("returns zero counts and rates for no items", () => {
  expect(calculateIdleStatistics([])).toEqual({
    availableCount: 0,
    idleCount: 0,
    disposedCount: 0,
    idleRate: 0,
    disposalRate: 0,
  });
});

test("counts available and disposed items using raw ratios", () => {
  expect(calculateIdleStatistics([
    { status: "active", isIdle: true },
    { status: "watching", isIdle: true },
    { status: "active", isIdle: false },
    { status: "watching", isIdle: false },
    { status: "active", isIdle: false },
    { status: "disposed", isIdle: false },
  ])).toEqual({
    availableCount: 5,
    idleCount: 2,
    disposedCount: 1,
    idleRate: 0.4,
    disposalRate: 1 / 3,
  });
});

test("excludes drafts and all soft-deleted items from every count", () => {
  const deletedAt = new Date("2026-04-01T00:00:00Z");

  expect(calculateIdleStatistics([
    { status: "draft", isIdle: true },
    { status: "active", isIdle: true, deletedAt },
    { status: "watching", isIdle: true, deletedAt },
    { status: "disposed", isIdle: true, deletedAt },
    { status: "active", isIdle: false, deletedAt: null },
  ])).toEqual({
    availableCount: 1,
    idleCount: 0,
    disposedCount: 0,
    idleRate: 0,
    disposalRate: 0,
  });
});

test("does not treat a disposed item's stale idle projection as idle", () => {
  expect(calculateIdleStatistics([{ status: "disposed", isIdle: true }])).toEqual({
    availableCount: 0,
    idleCount: 0,
    disposedCount: 1,
    idleRate: 0,
    disposalRate: 1,
  });
});
