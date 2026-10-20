import { idleClient, moneyToMinor } from "@/features/idle/idle-client";
test.each([["1.01", "CNY", 101], ["180", "JPY", 180], ["0.001", "KWD", 1], ["21474836.47", "CNY", 2147483647]])("converts %s %s without binary floating-point rounding", (amount, currency, expected) => { expect(moneyToMinor(amount as string, currency as string)).toBe(expected); });
test.each([["1.1", "JPY"], ["0.001", "CNY"], ["21474836.48", "CNY"], ["-1", "CNY"], ["1e3", "CNY"], ["", "CNY"]])("rejects unsupported precision, range and syntax: %s %s", (amount, currency) => { expect(() => moneyToMinor(amount, currency)).toThrow(); });
test("reports connection failures in Chinese", async () => {
  vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
  try { await expect(idleClient.watch("b3702bc6-e5de-45b6-92b6-1e9f8e23b130")).rejects.toThrow("暂时无法连接，请检查网络后重试。"); }
  finally { vi.unstubAllGlobals(); }
});
