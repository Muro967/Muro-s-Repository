import { expect, test } from "@playwright/test";
import { inviteCodeFor } from "./helpers/create-invite";
import { registerAndOnboard } from "./helpers/account";

test("registers by invitation, saves onboarding, logs out and returns after login", async ({ page, context }) => {
  await registerAndOnboard(page, "auth");
  const session = (await context.cookies()).find((cookie) => cookie.name === "aiw_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  await page.getByRole("link", { name: "我的", exact: true }).click();
  await expect(page.getByText("纽约", { exact: true })).toBeVisible();
  await expect(page.getByText("中长发 · 偏直")).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).some((cookie) => cookie.name === "aiw_session")).toBe(false);
  await page.goto("/app/wardrobe");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("邮箱", { exact: true }).fill("auth@example.test");
  await page.getByLabel("密码", { exact: true }).fill("wardrobe-e2e-password-2026");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/wardrobe$/);
  await expect(page.getByText("这里还没有衣物")).toBeVisible();

  const second = await context.browser()!.newContext();
  try {
    const response = await second.request.post("http://127.0.0.1:3109/api/auth/register", {
      headers: { origin: "http://127.0.0.1:3109" },
      data: { inviteCode: inviteCodeFor("auth"), email: "second@example.test", password: "wardrobe-e2e-password-2026", name: "Second" },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_INVITE");
  } finally { await second.close(); }
});

test("redirects anonymous visitors from all protected pages", async ({ page }) => {
  for (const path of ["wardrobe", "outfits", "inspiration", "profile", "onboarding"]) {
    await page.goto(`/app/${path}`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
  }
});
