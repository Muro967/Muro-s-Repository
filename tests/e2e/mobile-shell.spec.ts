import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/account";

test.use({ isMobile: true, hasTouch: true });

for (const width of [320, 390, 480]) {
  test(`${width}×844 supports four usable tabs without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await registerAndOnboard(page, `mobile-${width}`);
    const navigation = page.getByRole("navigation", { name: "主要页面" });
    for (const [label, path] of [["衣橱", "wardrobe"], ["搭配", "outfits"], ["灵感", "inspiration"], ["我的", "profile"]]) {
      await navigation.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/app/${path}$`));
      await expect(navigation.getByRole("link")).toHaveCount(4);
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      for (const link of await navigation.getByRole("link").all()) {
        await expect(link).toBeInViewport();
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: `output/playwright/mobile-${width}.png`, fullPage: true });
  });
}
