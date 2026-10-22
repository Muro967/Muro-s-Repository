import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WardrobeBrowser } from "@/features/items/wardrobe-browser";
import { browserResponse, browserItem, browserWardrobes, json } from "../../helpers/item-browser-fixture";
afterEach(() => vi.unstubAllGlobals());

test("a missing later page is not an empty wardrobe and can return to the first page", async () => {
 vi.stubGlobal("fetch", async (url: string) => json(url === "/api/wardrobes" ? { wardrobes: browserWardrobes } : url.includes("cursor=") ? { ...browserResponse, items: [], total: 1 } : { ...browserResponse, nextCursor: "page2" }));
 render(<WardrobeBrowser />);
 await userEvent.click(await screen.findByRole("button", { name: "下一页" }));
 expect(await screen.findByText("这一页没有衣物")).toBeVisible();
 expect(screen.queryByText("这里还没有衣物")).not.toBeInTheDocument();
 await userEvent.click(screen.getByRole("button", { name: "返回第一页" }));
 expect(await screen.findByText("燕麦针织开衫")).toBeVisible();
});

test("a mutation on a later wardrobe page reloads the first page", async () => {
 let deleted = false;
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (url === "/api/wardrobes") return json({ wardrobes: browserWardrobes });
  if (init?.method === "DELETE") { deleted = true; return json({ ok: true }); }
  return json({ ...browserResponse, items: url.includes("cursor=") && deleted ? [] : [{ ...browserResponse.items[0], name: deleted ? "第一页衣物" : "燕麦针织开衫" }], nextCursor: url.includes("cursor=") ? null : "page2" });
 });
 render(<WardrobeBrowser />);
 await userEvent.click(await screen.findByRole("button", { name: "下一页" }));
 await userEvent.click(await screen.findByRole("button", { name: "管理燕麦针织开衫" }));
 await userEvent.click(screen.getByRole("button", { name: "移入回收站" }));
 expect(await screen.findByText("第一页衣物")).toBeVisible();
 expect(screen.queryByRole("button", { name: "返回第一页" })).not.toBeInTheDocument();
});
test("shows real counts location private image and draft editing entry without fabricated wear counts", async () => {
 const urls: string[] = [];
 vi.stubGlobal("fetch", async (url: string) => {
  urls.push(url); if (url === "/api/wardrobes") return json({ wardrobes: browserWardrobes });
  return json(url.includes("scope=drafts") ? { ...browserResponse, items: [{ ...browserResponse.items[0], name: "待补全草稿", status: "draft" }], total: 1 } : browserResponse);
 });
 render(<WardrobeBrowser />);
 expect(await screen.findByText("燕麦针织开衫")).toBeVisible();
 expect(screen.getByText("未填写最后穿着")).toBeVisible();
 expect(screen.getByText("主卧衣柜 · 短挂区")).toBeVisible();
 expect(screen.getByRole("img", { name: "燕麦针织开衫" })).toHaveAttribute("src", `/api/items/${browserItem.id}/assets/${browserItem.assetId}/content`);
 expect(screen.queryByText(/穿过|本月穿着/)).not.toBeInTheDocument();
 expect(screen.getByRole("link", { name: "添加衣物" })).toHaveAttribute("href", "/app/items/new");
 await userEvent.click(screen.getByRole("button", { name: "草稿 2" }));
 expect(await screen.findByText("待补全草稿")).toBeVisible();
 expect(screen.getByRole("link", { name: /待补全草稿/ })).toHaveAttribute("href", `/app/items/${browserItem.id}`);
 await waitFor(() => expect(urls.some((u) => u.includes("scope=drafts"))).toBe(true));
});
test("moves selected clothing and deletes it through explicit actions then refreshes real results", async () => {
 let location = "短挂区"; let deleted = false;
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (url === "/api/wardrobes") return json({ wardrobes: browserWardrobes });
  if (url.endsWith("/move")) { const body = JSON.parse(String(init?.body)); if (body.zoneId === browserItem.zoneId) location = "已移动"; return json({ item: {} }); }
  if (init?.method === "DELETE") { deleted = true; return json({ ok: true }); }
  return json({ ...browserResponse, items: deleted ? [] : [{ ...browserResponse.items[0], zoneName: location }], total: deleted ? 0 : 1 });
 });
 render(<WardrobeBrowser />);
 await userEvent.click(await screen.findByRole("button", { name: "管理燕麦针织开衫" }));
 await userEvent.click(screen.getByRole("button", { name: "移动衣物" }));
 await userEvent.selectOptions(screen.getByLabelText("目标分区"), browserItem.zoneId);
 await userEvent.click(screen.getByRole("button", { name: "确认移动" }));
 expect(await screen.findByText("主卧衣柜 · 已移动")).toBeVisible();
 await userEvent.click(screen.getByRole("button", { name: "管理燕麦针织开衫" }));
 await userEvent.click(screen.getByRole("button", { name: "移入回收站" }));
 expect(await screen.findByText("这里还没有衣物")).toBeVisible();
});
test("rejects malformed list data instead of treating it as empty wardrobe", async () => {
 vi.stubGlobal("fetch", async (url: string) => json(url === "/api/wardrobes" ? { wardrobes: [] } : { ...browserResponse, items: [{ ...browserItem, assetId: "../../outside", objectKey: "secret" }] }));
 render(<WardrobeBrowser />);
 expect(await screen.findByRole("alert")).toBeVisible();
 expect(screen.queryByText("燕麦针织开衫")).not.toBeInTheDocument();
});
test("retries wardrobe loading after a location request fails", async () => {
 let failed = true;
 vi.stubGlobal("fetch", async (url: string) => {
  if (url === "/api/wardrobes") { if (failed) return json({}, 500); return json({ wardrobes: browserWardrobes }); }
  return json(browserResponse);
 });
 render(<WardrobeBrowser />);
 expect(await screen.findByRole("alert")).toHaveTextContent("衣柜加载失败");
 failed = false; await userEvent.click(screen.getByRole("button", { name: "重试" }));
 expect(await screen.findByRole("option", { name: "主卧衣柜" })).toBeInTheDocument();
 expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
test("resets folder scrolling when switching grouping so the selected all folder remains reachable", async () => {
 vi.stubGlobal("fetch", async (url: string) => json(url === "/api/wardrobes" ? { wardrobes: browserWardrobes } : browserResponse));
 render(<WardrobeBrowser />);
 const all = await screen.findByRole("button", { name: /^全部\s*1 件$/ });
 all.parentElement!.scrollLeft = 600;
 await userEvent.click(screen.getByRole("button", { name: "风格" }));
 expect(screen.getByRole("button", { name: /^全部\s*1 件$/ }).parentElement!.scrollLeft).toBe(0);
});
