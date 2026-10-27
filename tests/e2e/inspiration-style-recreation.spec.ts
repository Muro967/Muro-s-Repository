import { expect, test } from "@playwright/test";

import { registerAndOnboard } from "./helpers/account";
import { addGarment, imageBytes } from "./helpers/inventory";

test("collects five inspirations, edits the style manual and recreates a look from owned clothes", async ({ page }) => {
  await registerAndOnboard(page, "inspiration");
  for (const garment of [
    { name: "米白衬衫", category: "tops", format: "jpeg" as const },
    { name: "黑色阔腿裤", category: "bottoms", format: "png" as const },
    { name: "黑色乐福鞋", category: "shoes", format: "webp" as const },
  ]) {
    await addGarment(page, { ...garment, wardrobe: "测试衣柜", zone: "默认挂衣区" });
  }

  const formats = ["jpeg", "png", "webp", "jpeg", "png"] as const;
  for (const [index, format] of formats.entries()) {
    await page.goto("/app/inspiration/new");
    const picker = page.getByLabel("从相册添加灵感", { exact: true });
    await expect.poll(() => picker.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")))).toBe(true);
    await picker.setInputFiles({
      name: `look-${index}.${format}`,
      mimeType: `image/${format}`,
      buffer: await imageBytes(format),
    });
    await expect(page.getByAltText("灵感图预览")).toHaveAttribute("src", /^blob:/);
    await page.getByLabel("名称", { exact: true }).fill(`通勤灵感 ${index + 1}`);
    await page.getByLabel("风格标签", { exact: true }).fill("极简 / 通勤");
    await page.getByLabel("主要色系", { exact: true }).fill(index === 4 ? "灰绿" : "米白 / 黑色");
    await page.getByLabel("关键单品", { exact: true }).fill("衬衫 / 阔腿裤");
    await page.getByLabel("正式程度", { exact: true }).fill("通勤");
    await page.getByRole("button", { name: "保存灵感", exact: true }).click();
    await expect(page.getByText("已保存。", { exact: false })).toBeVisible();
    await page.goto("/app/inspiration");
    if (index < 4) await expect(page.getByText(`再添加 ${4 - index} 张，就能形成你的风格说明书`, { exact: true })).toBeVisible();
  }

  await page.getByRole("link", { name: /查看并编辑风格说明书/ }).click();
  await page.getByRole("button", { name: "整理说明书" }).click();
  await expect(page.getByRole("heading", { name: "你的风格说明书" })).toBeVisible();
  await page.getByLabel("偏爱色系", { exact: true }).fill("米白、黑色、灰绿");
  await page.getByRole("button", { name: "保存说明书" }).click();
  await page.getByLabel("新增不喜欢规则", { exact: true }).fill("不要豹纹");
  await page.getByRole("button", { name: "添加规则" }).click();
  await expect(page.getByText("不要豹纹", { exact: true })).toBeVisible();

  const list = await (await page.request.get("/api/inspirations")).json();
  const source = list.inspirations[0];
  await page.goto(`/app/inspiration/${source.id}`);
  await page.getByRole("link", { name: "用我的衣服复刻" }).click();
  await page.getByRole("button", { name: "开始规则复刻" }).click();
  await expect(page.getByRole("heading", { name: "用我的衣服复刻" })).toBeVisible();
  await expect(page.getByText("规则预览", { exact: true })).toBeVisible();
  for (const name of ["米白衬衫", "黑色阔腿裤", "黑色乐福鞋"]) await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByText(/购买/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
});
