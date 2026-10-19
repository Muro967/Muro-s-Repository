import { expect, test } from "@playwright/test";

test("production registers the worker, serves icons and a private-data-free offline fallback", async ({ page, context, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  for (const size of ["192x192", "512x512"]) {
    const icon = manifest.icons.find((value: { sizes: string }) => value.sizes === size);
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await page.goto("/login");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(await page.evaluate(async () => {
    const result = await navigator.serviceWorker.getRegistration();
    return new URL(result!.active!.scriptURL).pathname;
  })).toBe("/sw.js");
  await page.evaluate(async () => { await fetch("/api/auth/session"); });
  const paths = await page.evaluate(async () => {
    const entries = await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((entry) => new URL(entry.url).pathname)));
    return entries.flat().sort();
  });
  expect(paths).toEqual(["/apple-touch-icon.png", "/icons/icon-192.png", "/icons/icon-512.png", "/offline"]);
  await context.setOffline(true);
  await page.goto("/public-offline-check");
  await expect(page.getByRole("heading", { name: "现在无法连接网络" })).toBeVisible();
  await page.locator('link[rel="stylesheet"]').evaluateAll((stylesheets) => stylesheets.forEach((sheet) => sheet.remove()));
  const main = page.getByRole("main");
  await expect.poll(() => main.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(242, 238, 232)");
  await expect.poll(() => main.evaluate((element) => getComputedStyle(element).display)).toBe("grid");
  const retry = page.getByRole("link", { name: "重新连接" });
  const retryBounds = await retry.boundingBox();
  expect(retryBounds?.width).toBeGreaterThanOrEqual(44);
  expect(retryBounds?.height).toBeGreaterThanOrEqual(44);
  await expect.poll(() => retry.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(110, 123, 106)");
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  expect(await retry.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  expect(await retry.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  expect(await page.evaluate(async () => {
    try { await fetch("/api/auth/session"); return true; } catch { return false; }
  })).toBe(false);
  await context.setOffline(false);
});
