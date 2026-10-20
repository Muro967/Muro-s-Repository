import { act, renderHook, waitFor } from "@testing-library/react";
import { useIdleResource } from "@/features/idle/use-idle-resource";
test("ignores a stale request even if the transport ignores abort", async () => {
  let finish!: (value: string) => void; let signal!: AbortSignal;
  const first = (input: AbortSignal) => { signal = input; return new Promise<string>((resolve) => { finish = resolve; }); };
  const second = async () => "最新资料";
  const view = renderHook(({ load }) => useIdleResource(load), { initialProps: { load: first as (input: AbortSignal) => Promise<string> } });
  view.rerender({ load: second }); await waitFor(() => expect(view.result.current.data).toBe("最新资料"));
  expect(signal.aborted).toBe(true); await act(async () => { finish("过期资料"); }); expect(view.result.current.data).toBe("最新资料");
});
