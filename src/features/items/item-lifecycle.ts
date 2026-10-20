export function calendarDate(now: Date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** Recovery expires thirty calendar dates after deletion (UTC by default). */
export function restoreWindow(deletedAt: string | Date, today: string, timeZone = "UTC") {
  const deletedOn = typeof deletedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deletedAt) ? deletedAt : calendarDate(new Date(deletedAt), timeZone);
  const remainingDays = Math.max(0, 30 - (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${deletedOn}T00:00:00Z`)) / 86_400_000);
  return { remainingDays, canRestore: remainingDays > 0 };
}
