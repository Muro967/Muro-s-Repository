import { expect, type Page } from "@playwright/test";
import { inviteCodeFor } from "./create-invite";

export async function registerAndOnboard(page: Page, name: string) {
  await page.goto("/register");
  await page.getByLabel("邀请码", { exact: true }).fill(inviteCodeFor(name));
  await page.getByLabel("邮箱", { exact: true }).fill(`${name}@example.test`);
  await page.getByLabel("密码", { exact: true }).fill("wardrobe-e2e-password-2026");
  await page.getByLabel("昵称", { exact: true }).fill("Muro");
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
  await page.getByLabel("常用城市", { exact: true }).fill("纽约");
  await page.getByLabel("发长", { exact: true }).selectOption("中长发");
  await page.getByLabel("发质", { exact: true }).selectOption("偏直");
  await page.getByLabel("第一个衣柜名称", { exact: true }).fill("测试衣柜");
  await page.getByRole("button", { name: "开启我的衣橱" }).click();
  await expect(page).toHaveURL(/\/app\/wardrobe$/);
  await expect(page.getByText("衣橱还是空的")).toBeVisible();
}
