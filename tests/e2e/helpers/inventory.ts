import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

export const origin = `${process.env.E2E_PRODUCTION === "1" ? "https" : "http"}://127.0.0.1:3109`;
export const isolatedContext = { baseURL: origin, ignoreHTTPSErrors: process.env.E2E_PRODUCTION === "1" };
type Wardrobe = { id: string; name: string; zones: { id: string; name: string }[] };
export async function tree(page: Page): Promise<Wardrobe[]> {
  const response = await page.request.get("/api/wardrobes");
  expect(response.status()).toBe(200);
  return (await response.json()).wardrobes;
}
export async function readItem(page: Page, id: string) {
  const response = await page.request.get(`/api/items/${id}`);
  expect(response.status()).toBe(200);
  return (await response.json()).item;
}
export async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱", { exact: true }).fill(`${name}@example.test`);
  await page.getByLabel("密码", { exact: true }).fill("wardrobe-e2e-password-2026");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/wardrobe$/);
}
export function imageBytes(format: "png" | "jpeg" | "webp") {
  // Generated solid geometry, no user/reference photograph or embedded metadata.
  return readFile(`.data/e2e/fixtures/generated.${format}`);
}
export async function createWardrobe(page: Page, name: string) {
  await page.getByRole("button", { name: "＋ 新建衣柜", exact: true }).click();
  await page.getByLabel("衣柜名称", { exact: true }).fill(name);
  await page.getByRole("button", { name: "保存衣柜", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
export async function createZone(page: Page, name: string, kind: string) {
  await page.getByRole("button", { name: "＋ 添加分区", exact: true }).click();
  await page.getByLabel("分区名称", { exact: true }).fill(name);
  await page.getByLabel("分区类型", { exact: true }).selectOption(kind);
  await page.getByRole("button", { name: "保存分区", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
export async function addGarment(page: Page, input: { name: string; wardrobe: string; zone: string; format: "jpeg" | "png" | "webp" }) {
  // The editor's effect fetch proves hydration before a hidden file input changes.
  const locations = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/wardrobes");
  await page.goto("/app/items/new");
  expect((await locations).status()).toBe(200);
  // Hold the actual upload briefly so immediate local preview is observable.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/uploads", async (route) => { await held; await route.continue(); }, { times: 1 });
  const created = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/uploads");
  await page.getByLabel("从相册选择", { exact: true }).setInputFiles({ name: `generated.${input.format}`, mimeType: `image/${input.format}`, buffer: await imageBytes(input.format) });
  try { await expect(page.getByRole("img", { name: "衣物照片预览" })).toHaveAttribute("src", /^blob:/); }
  finally { release(); }
  const target = await created;
  expect(target.status()).toBe(201);
  const { uploadId } = await target.json();
  await expect(page.getByText("照片已上传", { exact: true })).toBeVisible();
  await page.getByLabel("名称", { exact: true }).fill(input.name);
  await page.getByRole("combobox", { name: "分类", exact: true }).selectOption("outerwear");
  await page.getByRole("button", { name: "选择衣柜与分区" }).click();
  const dialog = page.getByRole("dialog", { name: "放在哪里", exact: true });
  await dialog.getByRole("button", { name: input.wardrobe, exact: true }).click();
  await dialog.getByRole("button", { name: input.zone, exact: true }).click();
  await dialog.getByRole("button", { name: `移到 ${input.wardrobe} › ${input.zone}`, exact: true }).click();
  const save = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/api\/items\/[^/]+$/.test(response.url()));
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  const draft = (await (await save).json()).item;
  expect(draft.status).toBe("draft");
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.goto(`/app/items/${draft.id}`);
  await expect(page.getByLabel("名称", { exact: true })).toHaveValue(input.name);
  await expect(page.getByRole("img", { name: "衣物照片预览" })).toHaveJSProperty("naturalWidth", 240);
  await page.getByRole("button", { name: "保存到衣橱", exact: true }).click();
  await expect(page.getByText("已保存到衣橱", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "衣物照片预览" })).toHaveJSProperty("naturalWidth", 240);
  const item = await readItem(page, draft.id);
  expect(item.status).toBe("active");
  return { ...item, testUploadId: uploadId };
}
export async function completedUpload(request: APIRequestContext) {
  const bytes = await imageBytes("png");
  const created = await request.post("/api/uploads", { headers: { origin }, data: { kind: "wardrobe-original", contentType: "image/png", sizeBytes: bytes.length } });
  expect(created.status()).toBe(201);
  const target = await created.json();
  const put = await request.put(target.url, { headers: { ...target.headers, origin }, data: bytes });
  expect(put.status()).toBe(200);
  const complete = await request.post(`/api/uploads/${target.uploadId}/complete`, { headers: { origin }, data: {} });
  expect(complete.status()).toBe(200);
  expect(await complete.json()).toEqual({ uploadId: target.uploadId, status: "completed" });
  return target.uploadId as string;
}
export async function notFound(request: APIRequestContext, probe: { method: string; path: string; missing: string; data?: unknown; missingData?: unknown }) {
  const foreign = await request.fetch(probe.path, { method: probe.method, headers: { origin }, ...(probe.data === undefined ? {} : { data: probe.data }) });
  const missing = await request.fetch(probe.missing, { method: probe.method, headers: { origin }, ...(probe.data === undefined ? {} : { data: probe.missingData ?? probe.data }) });
  expect(foreign.status(), `${probe.method} ${probe.path}`).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await foreign.json()).toEqual(await missing.json());
  expect(foreign.headers()["cache-control"]).toContain("no-store");
}
export async function evidence(page: Page, name: string, width: number, detail: boolean) {
  await page.setViewportSize({ width, height: 844 });
  // Capture loaded content, rather than a successful SSR shell before its effects.
  if (name === "wardrobe") await expect(page.getByRole("img", { name: "焦糖风衣", exact: true })).toBeVisible();
  if (name === "wardrobes") {
    const list = page.getByRole("region", { name: "所选分区的衣物", exact: true });
    await expect(list.getByText("共 3 件", { exact: true })).toBeVisible();
    for (const garment of ["焦糖风衣", "米白衬衫", "雾蓝外套"]) await expect(list.getByRole("img", { name: garment, exact: true })).toHaveJSProperty("naturalWidth", 240);
  }
  if (name === "editor") await expect(page.getByLabel("名称", { exact: true })).toHaveValue("焦糖风衣");
  if (name === "search") await expect(page.getByRole("heading", { name: /^找到 \d+ 件$/ })).toBeVisible();
  if (name === "trash") await expect(page.getByRole("heading", { name: "回收站是空的", exact: true })).toBeVisible();
  if (name === "idle") await expect(page.getByRole("button", { name: "全部闲置 1", exact: true })).toBeVisible();
  if (name === "settings") await expect(page.getByLabel("闲置天数", { exact: true })).toHaveValue("120");
  if (name === "profile") await expect(page.getByText("120 天 / 观察 45 天", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await expect(page.getByRole("navigation", { name: "主要页面" })).toHaveCount(detail ? 0 : 1);
  const dialog = page.getByRole("dialog");
  const scope = await dialog.count() ? dialog : page.locator("main");
  const controls = scope.locator("button:visible, a:visible, input:not([type=radio]):visible, select:visible, textarea:visible, summary:visible, label:has(input[type=radio]):visible");
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box!.width, `${name}: ${await control.innerText()}`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${name}: ${await control.innerText()}`).toBeGreaterThanOrEqual(44);
  }
  // Programmatic focus followed by keyboard navigation checks actual :focus-visible.
  const first = controls.first();
  await first.focus();
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  // An empty detail page has only its back link; Tab passes through browser chrome.
  if (await focused.count() === 0) await page.keyboard.press("Tab");
  await expect(focused).toHaveCount(1);
  const outline = await focused.evaluate((element) => {
    const style = getComputedStyle(element.matches('input[type="radio"]') ? element.nextElementSibling! : element);
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.fillStyle = style.outlineColor;
    probe.fillRect(0, 0, 1, 1);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), alpha: probe.getImageData(0, 0, 1, 1).data[3] };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.style).not.toBe("hidden");
  expect(outline.width).toBeGreaterThan(0);
  expect(outline.alpha).toBeGreaterThan(0);
  await page.screenshot({ path: `output/playwright/task10/${process.env.E2E_PRODUCTION === "1" ? "production" : "development"}-${name}-${width}.png`, fullPage: true, animations: "disabled", caret: "hide", timeout: 15_000 });
}
