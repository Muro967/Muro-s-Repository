import { render, screen } from "@testing-library/react";
import { ProfileSummary } from "@/features/idle/profile-summary";
import { idleDashboard, idleJson } from "../../helpers/idle-dashboard-fixture";
import { browserResponse, browserWardrobes } from "../../helpers/item-browser-fixture";
afterEach(() => vi.unstubAllGlobals());
test("renders real inventory totals with working management destinations", async () => {
  vi.stubGlobal("fetch", async (url: string) => idleJson(url === "/api/idle" ? idleDashboard : url === "/api/wardrobes" ? { wardrobes: browserWardrobes } : { ...browserResponse, summary: { ...browserResponse.summary, itemCount: 8, watchingCount: 1 } }));
  render(<ProfileSummary />);
  expect(await screen.findByText("2 草稿")).toBeVisible(); expect(screen.getByText("1 衣柜 · 1 分区")).toBeVisible();
  expect(screen.getByRole("link", { name: /闲置规则/ })).toHaveAttribute("href", "/app/settings/idle");
  expect(screen.getByRole("link", { name: /闲置衣物/ })).toHaveAttribute("href", "/app/idle");
  expect(screen.getByRole("link", { name: /回收站/ })).toHaveAttribute("href", "/app/trash");
  expect(screen.getByRole("link", { name: /衣柜与分区/ })).toHaveAttribute("href", "/app/wardrobes");
  expect(screen.getByText("2 闲置 · 1 观察中 · 1 已处置")).toBeVisible();
});
