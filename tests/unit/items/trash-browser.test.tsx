import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrashBrowser } from "@/features/items/trash-browser";
import { browserResponse, json } from "../../helpers/item-browser-fixture";
afterEach(() => vi.unstubAllGlobals());
test("a later empty trash page is distinguished from a completely empty bin", async () => {
 vi.stubGlobal("fetch", async (url: string) => json(url.includes("cursor=") ? { ...browserResponse, items: [], total: 1 } : { ...browserResponse, nextCursor: "page2" }));
 render(<TrashBrowser />);
 await userEvent.click(await screen.findByRole("button", { name: "下一页" }));
 expect(await screen.findByText("这一页没有衣物")).toBeVisible();
 expect(screen.queryByText("回收站是空的")).not.toBeInTheDocument();
 await userEvent.click(screen.getByRole("button", { name: "返回第一页" }));
 expect(await screen.findByText("燕麦针织开衫")).toBeVisible();
});
test("restoring the last later-page garment returns to the first page", async () => {
 let restored = false;
 vi.stubGlobal("fetch", async (url: string) => {
  if (url.endsWith("/restore")) { restored = true; return json({ item: {} }); }
  return json({ ...browserResponse, items: restored && url.includes("cursor=") ? [] : [{ ...browserResponse.items[0], name: restored ? "第一页回收衣物" : "可恢复衣物", deletedAt: "2026-10-18T00:00:00Z" }], nextCursor: url.includes("cursor=") ? null : "page2" });
 });
 render(<TrashBrowser />);
 await userEvent.click(await screen.findByRole("button", { name: "下一页" }));
 await userEvent.click(await screen.findByRole("button", { name: "恢复可恢复衣物" }));
 expect(await screen.findByText("第一页回收衣物")).toBeVisible();
 expect(screen.queryByRole("button", { name: "返回第一页" })).not.toBeInTheDocument();
});
test("retries a failed trash load with a working control", async () => {
 let fail = true;
 vi.stubGlobal("fetch", async () => fail ? json({}, 500) : json(browserResponse));
 render(<TrashBrowser />);
 expect(await screen.findByRole("alert")).toHaveTextContent("衣物加载失败");
 fail = false;
 await userEvent.click(screen.getByRole("button", { name: "重试加载回收站" }));
 expect(await screen.findByText("燕麦针织开衫")).toBeVisible();
 expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
test("shows calendar expiry and restores only eligible clothing", async () => {
 let restored = false;
 vi.stubGlobal("fetch", async (url: string) => {
  if (url.endsWith("/restore")) { restored = true; return json({ item: {} }); }
  return json({ ...browserResponse, items: restored ? [] : [
   { ...browserResponse.items[0], name: "可恢复衣物", deletedAt: "2026-09-20T23:59:00Z" },
   { ...browserResponse.items[0], id: "b3702bc6-e5de-45b6-92b6-1e9f8e23b131", original: null, name: "已过期衣物", deletedAt: "2026-09-19T23:59:00Z" },
  ], total: restored ? 0 : 2 });
 });
 render(<TrashBrowser />);
 expect(await screen.findByText("剩余 1 天")).toBeVisible();
 expect(screen.getByRole("button", { name: "恢复已过期衣物" })).toBeDisabled();
 await userEvent.click(screen.getByRole("button", { name: "恢复可恢复衣物" }));
 expect(await screen.findByText("回收站是空的")).toBeVisible();
});
