import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrashBrowser } from "@/features/items/trash-browser";
import { browserResponse, json } from "../../helpers/item-browser-fixture";
afterEach(() => vi.unstubAllGlobals());
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
