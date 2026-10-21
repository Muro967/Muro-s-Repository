import { expect, test } from "@playwright/test";
import { evidence, isolatedContext, login, notFound, origin, readItem } from "./helpers/inventory";

test("manages idle garments through observation, manual wear and disposal", async ({ page }) => {
  await login(page, "idle");
  await page.getByRole("link", { name: "查看闲置衣物" }).click();
  await expect(page.getByRole("button", { name: "全部闲置 3", exact: true })).toBeVisible();
  let dashboard = await (await page.request.get("/api/idle")).json();
  expect(dashboard.statistics).toMatchObject({ availableCount: 5, idleCount: 3, disposedCount: 1, idleRate: 0.6, disposalRate: 0.25 });
  await page.getByRole("button", { name: "观察焦糖旧风衣", exact: true }).click();
  await page.getByRole("button", { name: "观察中 2", exact: true }).click();
  await expect(page.getByText("观察剩余 30 天", { exact: true })).toBeVisible();
  await expect(page.getByText("观察已逾期 5 天", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "取消观察焦糖旧风衣", exact: true }).click();
  await expect(page.getByRole("button", { name: "观察中 1", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "燕麦旧围巾", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/items\/[\da-f-]+$/);
  const wearId = page.url().split("/").at(-1)!;
  const wearDate = await page.getByLabel("手动穿着日期", { exact: true }).getAttribute("max");
  await page.getByLabel("手动穿着日期", { exact: true }).fill(wearDate!);
  const wearRequest = page.waitForRequest((request) => request.method() === "PATCH" && request.url().endsWith(`/api/items/${wearId}`));
  await page.getByRole("button", { name: "记录穿着并结束观察", exact: true }).click();
  expect((await wearRequest).postDataJSON()).toEqual({ manualLastWornOn: wearDate });
  await expect(page.getByText("已记录手动穿着日期，已退出观察。", { exact: true })).toBeVisible();
  expect(await readItem(page, wearId)).toMatchObject({ status: "active", manualLastWornOn: wearDate, watchStartedOn: null, watchDueOn: null });
  await page.getByRole("link", { name: "返回闲置衣物", exact: true }).click();
  await expect(page.getByRole("button", { name: "全部闲置 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "处置焦糖旧风衣", exact: true }).click();
  await page.getByRole("radio", { name: /二手卖出/ }).check();
  await page.getByLabel("售价（选填）", { exact: true }).fill("180.00");
  await page.getByRole("button", { name: "闲鱼", exact: true }).click();
  for (const width of [320, 390, 480]) await evidence(page, "disposal-sheet", width, true);
  await page.getByRole("button", { name: "确认：二手卖出", exact: true }).click();
  await expect(page.getByRole("region", { name: "处置汇总" }).getByText("CNY 180.00", { exact: true })).toBeVisible();
  await expect(page.getByText(/闲鱼 · /)).toBeVisible();
  dashboard = await (await page.request.get("/api/idle")).json();
  expect(dashboard.statistics).toMatchObject({ availableCount: 4, idleCount: 1, disposedCount: 2, idleRate: 0.25, disposalRate: 2 / 3, soldIncomeByCurrency: { CNY: 18000 } });
  const sold = dashboard.disposals.find((record: { method: string }) => record.method === "sold");
  const retry = await page.request.post(`/api/items/${sold.itemId}/disposal`, { headers: { origin }, data: { method: "sold", disposedOn: dashboard.today, currency: "CNY", saleAmountMinor: 18000, platform: "闲鱼" } });
  expect((await retry.json()).disposal.id).toBe(sold.id);
  expect((await (await page.request.get("/api/idle")).json()).statistics.soldIncomeByCurrency).toEqual({ CNY: 18000 });
  // Disposal has an item-scoped command, never a public arbitrary-record route.
  const outsider = await page.context().browser()!.newContext(isolatedContext);
  try {
    const other = await outsider.newPage();
    await login(other, "outsider");
    await notFound(other.request, { method: "POST", path: `/api/items/${sold.itemId}/disposal`, missing: "/api/items/00000000-0000-4000-8000-000000000000/disposal", data: { method: "donated", disposedOn: dashboard.today } });
    expect((await (await other.request.get("/api/idle")).json()).disposals.some((record: { id: string }) => record.id === sold.id)).toBe(false);
  } finally { await outsider.close(); }
  await page.goto("/app/settings/idle");
  await page.getByLabel("闲置天数", { exact: true }).fill("120");
  await page.getByLabel("观察天数", { exact: true }).fill("45");
  await page.getByLabel("时区", { exact: true }).fill("Asia/Shanghai");
  await page.getByLabel("当前季节", { exact: true }).selectOption("autumn");
  await page.getByRole("button", { name: "保存规则", exact: true }).click();
  await expect(page.getByText("闲置规则已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("闲置天数", { exact: true })).toHaveValue("120");
  await expect(page.getByLabel("观察天数", { exact: true })).toHaveValue("45");
  await expect(page.getByLabel("时区", { exact: true })).toHaveValue("Asia/Shanghai");
  await expect(page.getByLabel("当前季节", { exact: true })).toHaveValue("autumn");
  for (const width of [320, 390, 480]) {
    for (const [name, path] of [["idle", "/app/idle"], ["settings", "/app/settings/idle"], ["profile", "/app/profile"]]) {
      await page.goto(path);
      await evidence(page, name, width, false);
    }
  }
});
