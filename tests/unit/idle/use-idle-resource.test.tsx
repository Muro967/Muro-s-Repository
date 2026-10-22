import { act, renderHook, waitFor } from "@testing-library/react";
import { useIdleResource } from "@/features/idle/use-idle-resource";
import { StrictMode } from "react";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test("visibility and focus refresh a visible resource once while a request is pending", async () => {
  let visible = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible as DocumentVisibilityState);
  let reads = 0; let finish!: (value: string) => void;
  const load = async () => ++reads === 1 ? "原资料" : new Promise<string>((resolve) => { finish = resolve; });
  const view = renderHook(() => useIdleResource(load));
  await waitFor(() => expect(view.result.current.data).toBe("原资料"));
  visible = "hidden";
  act(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  expect(reads).toBe(1);
  visible = "visible";
  act(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(reads).toBe(2));
  act(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  expect(reads).toBe(2);
  await act(async () => { finish("刷新资料"); });
  expect(view.result.current.data).toBe("刷新资料");
});

test.each([
  ["Asia/Shanghai", "2026-10-20T15:59:30Z", "2026-10-20", "2026-10-21"],
  ["America/Los_Angeles", "2026-10-20T06:59:30Z", "2026-10-19", "2026-10-20"],
  ["America/New_York", "2026-11-01T03:59:30Z", "2026-10-31", "2026-11-01"],
])("refreshes server dates across saved-zone midnight in %s without a response loop", async (timeZone, instant, firstDay, nextDay) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(instant));
  let reads = 0;
  const load = async () => ({ today: ++reads === 1 ? firstDay : nextDay, timeZone });
  const getTimeZone = (value: { timeZone: string }) => value.timeZone;
  const view = renderHook(() => useIdleResource(load, getTimeZone));
  await act(async () => {});
  expect(view.result.current.data?.today).toBe(firstDay);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(view.result.current.data?.today).toBe(nextDay);
  expect(reads).toBe(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
  expect(reads).toBe(2);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test("clock skew and a failed automatic refresh do not create refresh loops", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T15:59:30Z"));
  let reads = 0;
  const load = async () => { if (++reads > 1) throw new Error("offline"); return { today: "2026-10-19", timeZone: "Asia/Shanghai" }; };
  const getTimeZone = (value: { timeZone: string }) => value.timeZone;
  const view = renderHook(() => useIdleResource(load, getTimeZone));
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(reads).toBe(2);
  expect(view.result.current.error).toBe("资料加载失败，请重试。");
  expect(view.result.current.data?.today).toBe("2026-10-19");
});

test("reload supersedes an automatic request and cleanup removes listeners and timers in StrictMode", async () => {
  vi.useFakeTimers();
  const requests: { signal: AbortSignal; resolve: (value: { timeZone: string; today: string }) => void }[] = [];
  const load = (signal: AbortSignal) => new Promise<{ timeZone: string; today: string }>((resolve) => requests.push({ signal, resolve }));
  const getTimeZone = (value: { timeZone: string }) => value.timeZone;
  const view = renderHook(() => useIdleResource(load, getTimeZone), { wrapper: StrictMode });
  const initial = requests.at(-1)!;
  await act(async () => { initial.resolve({ timeZone: "UTC", today: "2026-10-20" }); });
  const initialCount = requests.length;
  act(() => { window.dispatchEvent(new Event("focus")); });
  expect(requests).toHaveLength(initialCount + 1);
  const automatic = requests.at(-1)!;
  act(() => { view.result.current.reload(); });
  expect(automatic.signal.aborted).toBe(true);
  await act(async () => { requests.at(-1)!.resolve({ timeZone: "UTC", today: "2026-10-22" }); });
  await act(async () => { automatic.resolve({ timeZone: "UTC", today: "2026-10-21" }); });
  expect(view.result.current.data?.today).toBe("2026-10-22");
  const count = requests.length;
  view.unmount();
  act(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(requests).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});
test("ignores a stale request even if the transport ignores abort", async () => {
  let finish!: (value: string) => void; let signal!: AbortSignal;
  const first = (input: AbortSignal) => { signal = input; return new Promise<string>((resolve) => { finish = resolve; }); };
  const second = async () => "最新资料";
  const view = renderHook(({ load }) => useIdleResource(load), { initialProps: { load: first as (input: AbortSignal) => Promise<string> } });
  view.rerender({ load: second }); await waitFor(() => expect(view.result.current.data).toBe("最新资料"));
  expect(signal.aborted).toBe(true); await act(async () => { finish("过期资料"); }); expect(view.result.current.data).toBe("最新资料");
});
