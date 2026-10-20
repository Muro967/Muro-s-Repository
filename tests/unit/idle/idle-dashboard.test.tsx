import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdleDashboard } from "@/features/idle/idle-dashboard";
import { idleDashboard, idleJson, idleItem, watchingItem } from "../../helpers/idle-dashboard-fixture";
afterEach(() => vi.unstubAllGlobals());
test("shows truthful counts, watch overdue, and separate income currencies", async () => {
  vi.stubGlobal("fetch", async () => idleJson(idleDashboard)); render(<IdleDashboard />);
  expect(await screen.findByRole("button", { name: "全部闲置 2" })).toBeVisible();
  expect(screen.getByText("根据手动填写的最后穿着日期与入库时间计算")).toBeVisible();
  expect(screen.getByText("25%")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "观察中 1" }));
  expect(screen.getByText("观察已逾期 5 天")).toBeVisible();
  expect(screen.queryByText(idleItem.name)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "已处置 1" }));
  expect(screen.getByText("CNY 180.00")).toBeVisible(); expect(screen.getByText("JPY 500")).toBeVisible();
  expect(screen.getByText("二手卖出 1")).toBeVisible();
});
test("refreshes after watching and retains the list and retry action on mutation failure", async () => {
  let watching = false; let fail = true;
  vi.stubGlobal("fetch", async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") { if (fail) return idleJson({ error: { code: "INTERNAL_ERROR" } }, 500); watching = true; return idleJson({ item: { ...idleItem, status: "watching" } }); }
    return idleJson({ ...idleDashboard, items: watching ? [{ ...idleItem, status: "watching", isWatching: true, watchDueOn: "2026-11-19" }] : [idleItem] });
  });
  render(<IdleDashboard />); await screen.findByText(idleItem.name);
  await userEvent.click(screen.getByRole("button", { name: "观察丝绒吊带裙" }));
  expect(await screen.findByRole("alert")).toBeVisible(); expect(screen.getByText(idleItem.name)).toBeVisible(); fail = false;
  await userEvent.click(screen.getByRole("button", { name: "观察丝绒吊带裙" }));
  await waitFor(() => expect(screen.getByText("观察剩余 30 天")).toBeVisible());
  expect(screen.getByRole("button", { name: "取消观察丝绒吊带裙" })).toBeVisible();
});
test("retries a failed load and shows the honest empty state", async () => {
  let fail = true; vi.stubGlobal("fetch", async () => fail ? idleJson({}, 500) : idleJson({ ...idleDashboard, items: [], disposals: [], statistics: { ...idleDashboard.statistics, idleCount: 0, disposedCount: 0, idleRate: 0, disposalRate: 0 } }));
  render(<IdleDashboard />); expect(await screen.findByRole("alert")).toBeVisible(); fail = false;
  await userEvent.click(screen.getByRole("button", { name: "重试" })); expect(await screen.findByText("暂时没有闲置衣物")).toBeVisible();
});
test("includes non-idle watches in observation, cancels them and refreshes", async () => {
  let cancelled = false;
  vi.stubGlobal("fetch", async (_url: string, options?: RequestInit) => {
    if (options?.method === "DELETE") { cancelled = true; return idleJson({ item: { id: watchingItem.id, status: "active" } }); }
    return idleJson({ ...idleDashboard, items: cancelled ? [] : [{ ...watchingItem, isIdle: false, isWatchOverdue: false, watchDueOn: "2026-10-20" }], statistics: { ...idleDashboard.statistics, idleCount: 0, idleRate: 0 } });
  });
  render(<IdleDashboard />); await screen.findByRole("button", { name: "观察中 1" });
  expect(screen.getByText("暂时没有闲置衣物")).toBeVisible(); await userEvent.click(screen.getByRole("button", { name: "观察中 1" }));
  expect(screen.getByText("观察今天到期")).toBeVisible(); expect(screen.getByText("当前不计入闲置")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "取消观察奶油色连衣裙" })); expect(await screen.findByText("还没有观察中的衣物")).toBeVisible();
});
test("saves a disposal, closes the sheet and refreshes the disposed segment", async () => {
  let disposed = false;
  vi.stubGlobal("fetch", async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") { disposed = true; return idleJson({ disposal: { ...idleDashboard.disposals[0], itemId: idleItem.id, method: "donated" } }); }
    return idleJson(disposed ? { ...idleDashboard, items: [], disposals: [{ ...idleDashboard.disposals[0], itemId: idleItem.id, item: { ...idleItem, status: "disposed", isIdle: false }, method: "donated" }] } : { ...idleDashboard, items: [idleItem] });
  });
  render(<IdleDashboard />); await screen.findByText(idleItem.name); await userEvent.click(screen.getByRole("button", { name: "处置丝绒吊带裙" }));
  await userEvent.click(screen.getByRole("radio", { name: /捐赠/ })); await userEvent.click(screen.getByRole("button", { name: "确认：捐赠" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "已处置 1" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByRole("heading", { name: "丝绒吊带裙" })).toBeVisible();
});
test("aborts an in-flight disposal when leaving the dashboard", async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") { signal = options.signal as AbortSignal; return new Promise(() => {}); }
    return idleJson(idleDashboard);
  });
  const view = render(<IdleDashboard />); await screen.findByText(idleItem.name); await userEvent.click(screen.getByRole("button", { name: "处置丝绒吊带裙" }));
  await userEvent.click(screen.getByRole("radio", { name: /捐赠/ })); await userEvent.click(screen.getByRole("button", { name: "确认：捐赠" })); view.unmount();
  expect(signal?.aborted).toBe(true);
});
