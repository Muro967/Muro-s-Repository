import { act, render, screen } from "@testing-library/react";
import { ProfileSummary } from "@/features/idle/profile-summary";
import { idleDashboard, idleJson } from "../../helpers/idle-dashboard-fixture";
import { browserResponse, browserWardrobes } from "../../helpers/item-browser-fixture";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test("an open profile refreshes calendar-derived counts at the saved timezone's midnight", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T15:59:30Z"));
  let reads = 0;
  vi.stubGlobal("fetch", async (url: string) => idleJson(url === "/api/idle" ? { ...idleDashboard, statistics: { ...idleDashboard.statistics, idleCount: ++reads === 1 ? 2 : 3 } } : url === "/api/wardrobes" ? { wardrobes: browserWardrobes } : url === "/api/inspirations" ? { inspirations: [] } : browserResponse));
  render(<ProfileSummary />); await act(async () => {});
  expect(screen.getByText("2 闲置 · 0 观察中 · 1 已处置")).toBeVisible();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByText("3 闲置 · 0 观察中 · 1 已处置")).toBeVisible();
});
test("renders real inventory totals with working management destinations", async () => {
  vi.stubGlobal("fetch", async (url: string) => idleJson(url === "/api/idle" ? idleDashboard : url === "/api/wardrobes" ? { wardrobes: browserWardrobes } : url === "/api/inspirations" ? { inspirations: [{ id: "a" }, { id: "b" }] } : { ...browserResponse, summary: { ...browserResponse.summary, itemCount: 8, watchingCount: 1 } }));
  render(<ProfileSummary />);
  expect(await screen.findByText("2 草稿")).toBeVisible(); expect(screen.getByText("1 衣柜 · 1 分区")).toBeVisible();
  expect(screen.getByRole("link", { name: /闲置规则/ })).toHaveAttribute("href", "/app/settings/idle");
  expect(screen.getByRole("link", { name: /闲置衣物/ })).toHaveAttribute("href", "/app/idle");
  expect(screen.getByRole("link", { name: /回收站/ })).toHaveAttribute("href", "/app/trash");
  expect(screen.getByRole("link", { name: /衣柜与分区/ })).toHaveAttribute("href", "/app/wardrobes");
  expect(screen.getByText("2 闲置 · 1 观察中 · 1 已处置")).toBeVisible();
  expect(screen.getByText("2 灵感")).toBeVisible();
  expect(screen.getByText("搭配还在准备中。")).toBeVisible();
});
