// @vitest-environment node

import { deriveIdleState } from "@/features/idle/idle-policy";
import type { IdlePolicyItem } from "@/features/idle/idle-types";

const settings = { idleDays: 90, watchDays: 30 };
const context = { today: "2026-04-02", currentSeason: "spring" } as const;
const activeItem = {
  status: "active",
  addedOn: "2026-01-01",
  manualLastWornOn: "2026-01-01",
  seasonIds: [],
} as const;

test("treats day 90 as active and day 91 as idle", () => {
  expect(deriveIdleState(activeItem, settings, { ...context, today: "2026-04-01" }).isIdle).toBe(false);
  expect(deriveIdleState(activeItem, settings, context).isIdle).toBe(true);
});

test.each([
  ["draft", { status: "draft" }],
  ["disposed", { status: "disposed" }],
  ["deleted", { deletedAt: new Date("2026-03-01T00:00:00Z") }],
  ["missing activation date", { addedOn: null }],
  ["within the 30-day grace period", { addedOn: "2026-03-04", manualLastWornOn: "2025-01-01" }],
  ["explicitly off-season", { seasonIds: ["winter"] }],
] satisfies [string, Partial<IdlePolicyItem>][])("excludes an item that is %s", (_label, overrides) => {
  expect(deriveIdleState({ ...activeItem, ...overrides }, settings, context)).toEqual({
    isIdle: false,
    isWatching: false,
    isWatchOverdue: false,
  });
});

test("includes an eligible item on day 30 of the grace period", () => {
  expect(deriveIdleState({ ...activeItem, addedOn: "2026-03-03" }, settings, context).isIdle).toBe(true);
});

test.each([
  ["unknown", []],
  ["current", ["spring"]],
  ["year-round", ["spring", "summer", "autumn", "winter"]],
] satisfies [string, IdlePolicyItem["seasonIds"]][])("includes %s seasons", (_label, seasonIds) => {
  expect(deriveIdleState({ ...activeItem, seasonIds }, settings, context).isIdle).toBe(true);
});

test("uses addedOn when no manual wear date exists", () => {
  expect(deriveIdleState({ ...activeItem, manualLastWornOn: null }, settings, context).isIdle).toBe(true);
});

test("uses a recent manual wear date to reset idle age", () => {
  expect(deriveIdleState({ ...activeItem, manualLastWornOn: "2026-04-01" }, settings, context).isIdle).toBe(false);
});

test("honors the configured idle threshold", () => {
  expect(deriveIdleState(activeItem, { idleDays: 91, watchDays: 30 }, context).isIdle).toBe(false);
});

test.each([
  ["2026-04-01", true],
  ["2026-04-02", false],
  ["2026-04-03", false],
  [null, false],
] as const)("marks an idle watch due %s overdue only after its due date", (watchDueOn, isWatchOverdue) => {
  expect(deriveIdleState({ ...activeItem, status: "watching", watchDueOn }, settings, context)).toEqual({
    isIdle: true,
    isWatching: true,
    isWatchOverdue,
  });
});

test("keeps a recently worn item watching without marking it overdue", () => {
  expect(deriveIdleState({
    ...activeItem,
    status: "watching",
    manualLastWornOn: "2026-04-01",
    watchDueOn: "2026-04-01",
  }, settings, context)).toEqual({ isIdle: false, isWatching: true, isWatchOverdue: false });
});

test("counts calendar days across leap day", () => {
  expect(deriveIdleState({
    ...activeItem,
    addedOn: "2024-01-01",
    manualLastWornOn: "2024-02-28",
  }, { idleDays: 1, watchDays: 30 }, { ...context, today: "2024-03-01" }).isIdle).toBe(true);
});

test("counts spring daylight-saving transition as calendar days", () => {
  expect(deriveIdleState({
    ...activeItem,
    manualLastWornOn: "2026-03-07",
  }, { idleDays: 1, watchDays: 30 }, { ...context, today: "2026-03-09" }).isIdle).toBe(true);
});
