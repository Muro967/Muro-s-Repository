import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemEditor } from "@/features/items/item-editor";
import type { EditorItem } from "@/features/items/item-editor-client";
import { idleDashboard, idleJson } from "../../helpers/idle-dashboard-fixture";

const id = "b3702bc6-e5de-45b6-92b6-1e9f8e23b130";
const watching: EditorItem = {
  id, name: "观察中的裙子", categoryId: "dresses", accessoryId: null, colorNames: ["米白"], colorHexes: [], styleIds: [], seasonIds: [],
  thickness: null, material: null, fit: null, length: null, formality: null, brand: null, notes: "保留原备注",
  wardrobeId: "a3702bc6-e5de-45b6-92b6-1e9f8e23b130", zoneId: "c3702bc6-e5de-45b6-92b6-1e9f8e23b130", manualLastWornOn: null,
  status: "watching", original: null, addedOn: "2026-01-01", watchStartedOn: "2026-10-01", watchDueOn: "2026-10-31", deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
};
const active: EditorItem = { ...watching, name: "服务器上的新名称", status: "active", manualLastWornOn: "2026-10-20", watchStartedOn: null, watchDueOn: null };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test("the wear date maximum refreshes at local midnight while retaining the entered date", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T15:59:30Z"));
  let reads = 0;
  vi.stubGlobal("fetch", async (path: string) => {
    if (path === "/api/wardrobes") return idleJson({ wardrobes: [] });
    if (path === "/api/idle") return idleJson({ ...idleDashboard, today: ++reads === 1 ? "2026-10-20" : "2026-10-21" });
    return idleJson({ item: watching });
  });
  render(<ItemEditor itemId={id} />); await act(async () => {});
  const date = screen.getByLabelText("手动穿着日期");
  fireEvent.change(date, { target: { value: "2026-10-20" } });
  expect(date).toHaveAttribute("max", "2026-10-20");
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(date).toHaveAttribute("max", "2026-10-21");
  expect(date).toHaveValue("2026-10-20");
});
function setup(save: (input: unknown, options: RequestInit) => Promise<Response>, item = watching) {
  vi.stubGlobal("fetch", async (path: string, options: RequestInit) => {
    if (path === "/api/wardrobes") return idleJson({ wardrobes: [] });
    if (path === "/api/idle") return idleJson({ ...idleDashboard, today: "2026-10-21" });
    if (options.method === "PATCH") return save(JSON.parse(options.body as string), options);
    return idleJson({ item });
  });
  return render(<ItemEditor itemId={id} />);
}
test("records only a manual wear date and reflects the authoritative end of observation", async () => {
  const patches: unknown[] = [];
  setup(async (input) => { patches.push(input); return idleJson({ item: active }); });
  const date = await screen.findByLabelText("手动穿着日期");
  expect(date).toHaveAttribute("min", "2026-10-01"); expect(date).toHaveAttribute("max", "2026-10-21");
  expect(screen.getByLabelText("名称")).toBeDisabled(); expect(screen.getByLabelText("从相册选择")).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存到衣橱" })).toBeDisabled();
  fireEvent.change(date, { target: { value: "2026-10-20" } });
  await userEvent.click(screen.getByRole("button", { name: "记录穿着并结束观察" }));
  expect(await screen.findByText("已记录手动穿着日期，已退出观察。")).toBeVisible();
  expect(patches).toEqual([{ manualLastWornOn: "2026-10-20" }]);
  expect(screen.queryByLabelText("手动穿着日期")).not.toBeInTheDocument();
  expect(screen.getByLabelText("名称")).toHaveValue("服务器上的新名称"); expect(screen.getByLabelText("名称")).toBeEnabled();
  expect(screen.getByLabelText("最近穿着日期")).toHaveValue("2026-10-20");
  expect(screen.getByRole("link", { name: "返回闲置衣物" })).toHaveAttribute("href", "/app/idle");
});
test("retains the failed date and retries without submitting stale metadata", async () => {
  const patches: unknown[] = [];
  setup(async (input) => { patches.push(input); return patches.length === 1 ? idleJson({ error: { code: "INVALID_INPUT" } }, 400) : idleJson({ item: active }); });
  const date = await screen.findByLabelText("手动穿着日期"); fireEvent.change(date, { target: { value: "2026-10-20" } });
  await userEvent.click(screen.getByRole("button", { name: "记录穿着并结束观察" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("请检查填写的资料与日期"); expect(date).toHaveValue("2026-10-20");
  expect(screen.getByLabelText("名称")).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "记录穿着并结束观察" }));
  expect(await screen.findByText("已记录手动穿着日期，已退出观察。")).toBeVisible();
  expect(patches).toEqual([{ manualLastWornOn: "2026-10-20" }, { manualLastWornOn: "2026-10-20" }]);
});
test("guards a pending wear update against double submission and aborts on unmount", async () => {
  let finish!: (value: Response) => void; const patches: unknown[] = []; let signal: AbortSignal | null | undefined;
  const view = setup(async (input, options) => { patches.push(input); signal = options.signal; return new Promise((resolve) => { finish = resolve; }); });
  const date = await screen.findByLabelText("手动穿着日期"); fireEvent.change(date, { target: { value: "2026-10-20" } });
  await userEvent.dblClick(screen.getByRole("button", { name: "记录穿着并结束观察" }));
  expect(patches).toHaveLength(1); expect(date).toBeDisabled(); expect(screen.getByRole("button", { name: "正在记录…" })).toBeDisabled();
  view.unmount(); expect(signal?.aborted).toBe(true); await act(async () => { finish(idleJson({ item: active })); });
});
test("does not offer the action or enable fields on disposed items", async () => {
  setup(async () => { throw new Error("Unexpected save"); }, { ...watching, status: "disposed", watchStartedOn: null, watchDueOn: null });
  await screen.findByDisplayValue("观察中的裙子"); expect(screen.queryByLabelText("手动穿着日期")).not.toBeInTheDocument();
  expect(screen.getByLabelText("名称")).toBeDisabled(); expect(screen.getByLabelText("从相册选择")).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存到衣橱" })).toBeDisabled();
});
test("does not claim observation ended when the returned item is still watching", async () => {
  setup(async () => idleJson({ item: { ...watching, manualLastWornOn: "2026-10-20" } }));
  const date = await screen.findByLabelText("手动穿着日期"); fireEvent.change(date, { target: { value: "2026-10-20" } });
  await userEvent.click(screen.getByRole("button", { name: "记录穿着并结束观察" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("服务器未确认观察已结束");
  expect(screen.queryByText("已记录手动穿着日期，已退出观察。")).not.toBeInTheDocument(); expect(date).toHaveValue("2026-10-20");
});
test("retries a failed local-date load before allowing a wear update", async () => {
  let dates = 0; const patches: unknown[] = [];
  vi.stubGlobal("fetch", async (path: string, options: RequestInit) => {
    if (path === "/api/wardrobes") return idleJson({ wardrobes: [] });
    if (path === "/api/idle") return ++dates === 1 ? idleJson({}, 500) : idleJson({ ...idleDashboard, today: "2026-10-21" });
    if (options.method === "PATCH") { patches.push(JSON.parse(options.body as string)); return idleJson({ item: active }); }
    return idleJson({ item: watching });
  });
  render(<ItemEditor itemId={id} />); expect(await screen.findByRole("alert")).toHaveTextContent("资料加载失败");
  expect(screen.queryByLabelText("手动穿着日期")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "重试读取日期" }));
  const date = await screen.findByLabelText("手动穿着日期"); fireEvent.change(date, { target: { value: "2026-10-22" } });
  await userEvent.click(screen.getByRole("button", { name: "记录穿着并结束观察" }));
  expect(date).toBeInvalid(); expect(patches).toHaveLength(0);
  fireEvent.change(date, { target: { value: "2026-09-30" } });
  await userEvent.click(screen.getByRole("button", { name: "记录穿着并结束观察" }));
  expect(date).toBeInvalid(); expect(patches).toHaveLength(0);
});
