import { restoreWindow } from "@/features/items/item-lifecycle";

test("uses UTC calendar days with day 29 allowed and day 30 expired", () => {
  expect(restoreWindow("2026-10-01T23:59:59.000Z", "2026-10-30")).toEqual({ remainingDays: 1, canRestore: true });
  expect(restoreWindow("2026-10-01T23:59:59.000Z", "2026-10-31")).toEqual({ remainingDays: 0, canRestore: false });
});
test("uses the user's calendar date for deletion across UTC midnight", () => {
 expect(restoreWindow("2026-10-01T01:00:00Z", "2026-10-29", "America/Los_Angeles")).toEqual({ remainingDays: 1, canRestore: true });
 expect(restoreWindow("2026-10-01T01:00:00Z", "2026-10-30", "America/Los_Angeles")).toEqual({ remainingDays: 0, canRestore: false });
});
