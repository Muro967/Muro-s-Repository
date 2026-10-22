import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchPanel } from "@/features/items/search-panel";
import userEvent from "@testing-library/user-event";
import { browserResponse, json } from "../../helpers/item-browser-fixture";
afterEach(() => vi.unstubAllGlobals());
test("a later empty search page preserves the total and can return to matching clothes", async () => {
 vi.stubGlobal("fetch", async (url: string) => json(url.includes("cursor=") ? { ...browserResponse, items: [], total: 1 } : { ...browserResponse, nextCursor: "page2" }));
 render(<SearchPanel />);
 await userEvent.click(await screen.findByRole("button", { name: "下一页" }));
 expect(await screen.findByText("这一页没有衣物")).toBeVisible();
 expect(screen.queryByText("没有找到衣物")).not.toBeInTheDocument();
 await userEvent.click(screen.getByRole("button", { name: "返回第一页" }));
 expect(await screen.findByText("燕麦针织开衫")).toBeVisible();
});
test("a search mutation reloads the first page without losing the query", async () => {
 let changed = false;
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (init?.method === "DELETE") { changed = true; return json({ ok: true }); }
  return json({ ...browserResponse, items: changed && url.includes("cursor=") ? [] : [{ ...browserResponse.items[0], name: changed ? "第一页结果" : "燕麦针织开衫" }], nextCursor: url.includes("cursor=") ? null : "page2" });
 });
 render(<SearchPanel />);
 fireEvent.change(screen.getByRole("searchbox"), { target: { value: "针织" } });
 await userEvent.click(await screen.findByRole("button", { name: "下一页" }));
 await userEvent.click(await screen.findByRole("button", { name: "管理燕麦针织开衫" }));
 await userEvent.click(screen.getByRole("button", { name: "移入回收站" }));
 expect(await screen.findByText("第一页结果")).toBeVisible();
 expect(screen.getByRole("searchbox")).toHaveValue("针织");
});
test("debounces requests aborts obsolete searches and ignores late results even when fetch ignores abort", async () => {
 const pending: { url: string; signal: AbortSignal; resolve: (r: Response) => void }[] = [];
 vi.stubGlobal("fetch", (url: string, init: RequestInit) => url === "/api/wardrobes" ? Promise.resolve(json({ wardrobes: [] })) : new Promise<Response>((resolve) => pending.push({ url, signal: init.signal!, resolve })));
 render(<SearchPanel />);
 fireEvent.change(screen.getByRole("searchbox"), { target: { value: "旧" } });
 await waitFor(() => expect(pending.some((p) => p.url.includes("q=%E6%97%A7"))).toBe(true));
 const old = pending.find((p) => p.url.includes("q=%E6%97%A7"))!;
 fireEvent.change(screen.getByRole("searchbox"), { target: { value: "新" } });
 expect(old.signal.aborted).toBe(true);
 await waitFor(() => expect(pending.some((p) => p.url.includes("q=%E6%96%B0"))).toBe(true));
 const current = pending.find((p) => p.url.includes("q=%E6%96%B0"))!;
 await act(async () => current.resolve(json({ ...browserResponse, total: 12, items: [{ ...browserResponse.items[0], name: "新衣服" }] })));
 expect(await screen.findByText("找到 12 件")).toBeVisible();
 await act(async () => old.resolve(json({ ...browserResponse, items: [{ ...browserResponse.items[0], name: "过期结果" }] })));
 expect(screen.queryByText("过期结果")).not.toBeInTheDocument();
 expect(screen.getByText("新衣服")).toBeVisible();
});
