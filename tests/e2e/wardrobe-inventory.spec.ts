import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/account";
import { addGarment, completedUpload, createWardrobe, createZone, evidence, imageBytes, isolatedContext, notFound, origin, readItem, tree } from "./helpers/inventory";

test("registers and manages a private garment through restore", async ({ page, browser }) => {
  await registerAndOnboard(page, "inventory");
  await page.getByRole("link", { name: "衣柜与分区 ›" }).click();
  await createZone(page, "长挂区", "hang");
  await createWardrobe(page, "次卧衣柜");
  await createZone(page, "挂衣区", "hang");
  await page.getByRole("button", { name: "编辑分区", exact: true }).click();
  await page.getByRole("button", { name: "改名次卧衣柜", exact: true }).click();
  await page.getByLabel("衣柜名称", { exact: true }).fill("客房衣柜");
  await page.getByRole("button", { name: "保存衣柜", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "前移客房衣柜", exact: true }).click();
  await expect.poll(async () => (await tree(page))[0].name).toBe("客房衣柜");
  await page.getByRole("button", { name: "测试衣柜 2 个分区", exact: true }).click();
  await page.getByRole("button", { name: "上移长挂区", exact: true }).click();
  await expect.poll(async () => (await tree(page))[1].zones[0].name).toBe("长挂区");
  const item = await addGarment(page, { name: "焦糖风衣", wardrobe: "测试衣柜", zone: "长挂区", format: "jpeg" });
  const bytes = await imageBytes("jpeg");
  const originalUrl = `/api/items/${item.id}/assets/${item.original.id}/content`;
  const original = await page.request.get(originalUrl);
  expect(original.status()).toBe(200);
  expect(original.headers()["cache-control"]).toBe("private, no-store");
  expect(original.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await original.body()).toEqual(bytes);
  await page.goto("/app/search");
  await page.getByRole("searchbox", { name: "搜索衣物" }).fill("焦糖");
  await expect(page.getByRole("img", { name: "焦糖风衣", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "管理焦糖风衣" }).click();
  await page.getByRole("button", { name: "移动衣物", exact: true }).click();
  await page.getByLabel("目标衣柜").selectOption({ label: "客房衣柜" });
  await page.getByLabel("目标分区").selectOption({ label: "挂衣区" });
  await page.getByRole("button", { name: "确认移动" }).click();
  await expect(page.getByText("客房衣柜 · 挂衣区", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "管理焦糖风衣" }).click();
  await page.getByRole("button", { name: "移入回收站", exact: true }).click();
  await expect(page.getByRole("img", { name: "焦糖风衣", exact: true })).toHaveCount(0);
  await page.goto("/app/trash");
  await expect(page.getByText("剩余 30 天", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "恢复焦糖风衣", exact: true }).click();
  await expect(page.getByText("衣物已恢复", { exact: true })).toBeVisible();
  const restored = await readItem(page, item.id);
  expect(restored.status).toBe("active");
  expect(restored.deletedAt).toBeNull();
  expect(restored.original).toEqual(item.original);
  expect(await (await page.request.get(originalUrl)).body()).toEqual(bytes);

  // A retained garment forces relocation before its occupied wardrobe can go.
  await page.goto("/app/wardrobes");
  await page.getByRole("button", { name: "客房衣柜 1 个分区", exact: true }).click();
  await page.getByRole("button", { name: "编辑分区", exact: true }).click();
  await page.getByRole("button", { name: "删除客房衣柜", exact: true }).click();
  await page.getByRole("button", { name: "确认删除衣柜", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "先安置衣物，再删除「客房衣柜」" })).toBeVisible();
  await page.getByRole("button", { name: "长挂区", exact: true }).click();
  await page.getByRole("button", { name: "移到 测试衣柜 › 长挂区", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const location = (await tree(page))[0];
  expect(location.name).toBe("测试衣柜");
  expect((await readItem(page, item.id)).wardrobeId).toBe(location.id);
  await addGarment(page, { name: "米白衬衫", wardrobe: "测试衣柜", zone: "长挂区", format: "png" });
  await addGarment(page, { name: "雾蓝外套", wardrobe: "测试衣柜", zone: "长挂区", format: "webp" });

  const intruder = await browser.newContext(isolatedContext);
  try {
    const other = await intruder.newPage();
    await registerAndOnboard(other, "intruder");
    const ownLocation = (await tree(other))[0];
    const ownDraft = await other.request.post("/api/items", { headers: { origin }, data: {} });
    expect(ownDraft.status()).toBe(201);
    const ownId = (await ownDraft.json()).item.id;
    const ownUploadId = await completedUpload(other.request);
    const unknown = "00000000-0000-4000-8000-000000000000";
    const probes = [
      { method: "PATCH", path: `/api/wardrobes/${location.id}`, missing: `/api/wardrobes/${unknown}`, data: { name: "不可修改" } },
      { method: "DELETE", path: `/api/wardrobes/${location.id}`, missing: `/api/wardrobes/${unknown}`, data: {} },
      { method: "POST", path: `/api/wardrobes/${location.id}/zones`, missing: `/api/wardrobes/${unknown}/zones`, data: { name: "不可添加", kind: "hang" } },
      { method: "POST", path: `/api/wardrobes/${location.id}/zones/reorder`, missing: `/api/wardrobes/${unknown}/zones/reorder`, data: { orderedIds: [location.zones[0].id] } },
      { method: "PATCH", path: `/api/zones/${location.zones[0].id}`, missing: `/api/zones/${unknown}`, data: { name: "不可修改" } },
      { method: "DELETE", path: `/api/zones/${location.zones[0].id}`, missing: `/api/zones/${unknown}`, data: {} },
      { method: "GET", path: `/api/items/${item.id}`, missing: `/api/items/${unknown}` },
      { method: "GET", path: `/api/items?wardrobeId=${location.id}`, missing: `/api/items?wardrobeId=${unknown}` },
      { method: "PATCH", path: `/api/items/${item.id}`, missing: `/api/items/${unknown}`, data: { name: "不可修改" } },
      { method: "DELETE", path: `/api/items/${item.id}`, missing: `/api/items/${unknown}`, data: {} },
      { method: "POST", path: `/api/items/${item.id}/activate`, missing: `/api/items/${unknown}/activate`, data: {} },
      { method: "POST", path: `/api/items/${item.id}/restore`, missing: `/api/items/${unknown}/restore`, data: {} },
      { method: "POST", path: `/api/items/${item.id}/move`, missing: `/api/items/${unknown}/move`, data: { wardrobeId: ownLocation.id, zoneId: ownLocation.zones[0].id } },
      { method: "GET", path: originalUrl, missing: `/api/items/${unknown}/assets/${unknown}/content` },
      { method: "GET", path: `/api/items/${ownId}/assets/${item.original.id}/content`, missing: `/api/items/${ownId}/assets/${unknown}/content` },
      { method: "PUT", path: `/api/items/${item.id}/original`, missing: `/api/items/${unknown}/original`, data: { uploadId: ownUploadId } },
      { method: "PUT", path: `/api/items/${ownId}/original`, missing: `/api/items/${ownId}/original`, data: { uploadId: item.testUploadId }, missingData: { uploadId: unknown } },
      { method: "POST", path: `/api/uploads/${item.testUploadId}/complete`, missing: `/api/uploads/${unknown}/complete`, data: {} },
      { method: "POST", path: `/api/items/${item.id}/watch`, missing: `/api/items/${unknown}/watch`, data: {} },
      { method: "DELETE", path: `/api/items/${item.id}/watch`, missing: `/api/items/${unknown}/watch`, data: {} },
      { method: "POST", path: `/api/items/${item.id}/disposal`, missing: `/api/items/${unknown}/disposal`, data: { method: "donated", disposedOn: "2020-01-01" } },
    ];
    for (const probe of probes) await notFound(other.request, probe);
    const attachOwned = await other.request.put(`/api/items/${ownId}/original`, { headers: { origin }, data: { uploadId: ownUploadId } });
    expect(attachOwned.status()).toBe(200);
    expect((await tree(other)).every((entry) => entry.id !== location.id)).toBe(true);
    expect((await (await other.request.get("/api/idle")).json()).disposals).toEqual([]);
    expect((await readItem(page, item.id)).name).toBe("焦糖风衣");
  } finally { await intruder.close(); }

  for (const width of [320, 390, 480]) {
    for (const [name, path] of [["wardrobe", "/app/wardrobe"], ["wardrobes", "/app/wardrobes"], ["editor", `/app/items/${item.id}`], ["search", "/app/search"], ["trash", "/app/trash"]]) {
      await page.goto(path);
      await evidence(page, name, width, name !== "wardrobe");
    }
  }
});
