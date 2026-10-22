import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdleSettingsForm } from "@/features/idle/idle-settings-form";
import { idleDashboard, idleJson } from "../../helpers/idle-dashboard-fixture";
afterEach(() => vi.unstubAllGlobals());
test("loads settings and retains edits after failure before saving the user's values", async () => {
  let fail = true; const patches: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") { const input = JSON.parse(options.body as string); patches.push(input); return fail ? idleJson({ error: { code: "INVALID_INPUT" } }, 400) : idleJson({ settings: input }); }
    return idleJson({ settings: idleDashboard.settings });
  });
  const user = userEvent.setup(); render(<IdleSettingsForm />); const days = await screen.findByLabelText("闲置天数");
  await user.clear(days); await user.type(days, "120"); await user.selectOptions(screen.getByLabelText("当前季节"), "winter");
  await user.click(screen.getByRole("button", { name: "保存规则" })); expect(await screen.findByRole("alert")).toBeVisible(); expect(days).toHaveValue(120);
  fail = false; await user.click(screen.getByRole("button", { name: "保存规则" })); expect(await screen.findByText("闲置规则已保存")).toBeVisible();
  expect(patches.at(-1)).toEqual({ ...idleDashboard.settings, idleDays: 120, seasonOverride: "winter" });
});

test("background refresh preserves unsaved and failed settings input", async () => {
  let reads = 0;
  vi.stubGlobal("fetch", async (_url: string, options?: RequestInit) => options?.method === "PATCH" ? idleJson({ error: { code: "INVALID_INPUT" } }, 400) : idleJson({ settings: { ...idleDashboard.settings, idleDays: ++reads === 1 ? 90 : 180 } }));
  const user = userEvent.setup(); render(<IdleSettingsForm />);
  const days = await screen.findByLabelText("闲置天数");
  await user.clear(days); await user.type(days, "120");
  await user.click(screen.getByRole("button", { name: "保存规则" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  act(() => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(reads).toBe(2));
  expect(days).toHaveValue(120);
  expect(screen.getByRole("alert")).toBeVisible();
});
