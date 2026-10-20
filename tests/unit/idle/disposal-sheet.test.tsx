import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisposalSheet } from "@/features/idle/disposal-sheet";
import { idleItem } from "../../helpers/idle-dashboard-fixture";

test("retains sold input on failure and retries the exact minor-unit payload", async () => {
  const user = userEvent.setup(); const inputs: unknown[] = [];
  render(<DisposalSheet item={idleItem} today="2026-10-20" onClose={() => {}} submit={async (input) => { inputs.push(input); if (inputs.length === 1) throw new Error("没有保存，请重试"); }} />);
  expect(screen.getByRole("dialog", { name: "处置「丝绒吊带裙」" })).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(6);
  expect(screen.getByRole("button", { name: "请选择处置方式" })).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: /二手卖出/ }));
  await user.type(screen.getByLabelText("售价（选填）"), "1.01");
  await user.type(screen.getByLabelText("平台（选填）"), "闲鱼");
  await user.type(screen.getByLabelText("备注（选填）"), "交给下一位主人");
  await user.click(screen.getByRole("button", { name: "确认：二手卖出" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("没有保存，请重试");
  expect(screen.getByLabelText("售价（选填）")).toHaveValue("1.01");
  await user.click(screen.getByRole("button", { name: "确认：二手卖出" }));
  expect(inputs).toEqual([{ method: "sold", disposedOn: "2026-10-20", saleAmountMinor: 101, currency: "CNY", platform: "闲鱼", notes: "交给下一位主人" }, { method: "sold", disposedOn: "2026-10-20", saleAmountMinor: 101, currency: "CNY", platform: "闲鱼", notes: "交给下一位主人" }]);
});
test("submits only fields belonging to the chosen method and prevents double submission", async () => {
  const user = userEvent.setup(); const inputs: unknown[] = []; let finish!: () => void;
  render(<DisposalSheet item={idleItem} today="2026-10-20" onClose={() => {}} submit={async (input) => { inputs.push(input); await new Promise<void>((resolve) => { finish = resolve; }); }} />);
  await user.click(screen.getByRole("radio", { name: /二手卖出/ })); await user.type(screen.getByLabelText("售价（选填）"), "10");
  await user.click(screen.getByRole("radio", { name: /送给朋友/ })); await user.type(screen.getByLabelText("送给谁（选填）"), "小林");
  await user.dblClick(screen.getByRole("button", { name: "确认：送给朋友" }));
  expect(inputs).toEqual([{ method: "gifted", disposedOn: "2026-10-20", recipient: "小林" }]);
  expect(screen.getByRole("button", { name: "正在保存…" })).toBeDisabled();
  finish(); await waitFor(() => expect(screen.queryByRole("button", { name: "正在保存…" })).not.toBeInTheDocument());
});
test("supports Escape and restores focus to the opening control", async () => {
  const user = userEvent.setup(); const close = vi.fn();
  const trigger = document.createElement("button"); trigger.textContent = "处置"; document.body.append(trigger); trigger.focus();
  const view = render(<DisposalSheet item={idleItem} today="2026-10-20" onClose={close} submit={async () => {}} />);
  await user.keyboard("{Escape}"); expect(close).toHaveBeenCalledOnce(); view.unmount();
  await waitFor(() => expect(trigger).toHaveFocus()); trigger.remove();
});
test.each([["二手卖出", "sold"], ["送给朋友", "gifted"], ["捐赠", "donated"], ["旧衣回收", "recycled"], ["改造", "upcycled"], ["丢弃", "discarded"]])("allows %s with optional details omitted", async (label, method) => {
  const saved: unknown[] = []; render(<DisposalSheet item={idleItem} today="2026-10-20" onClose={() => {}} submit={async (input) => { saved.push(input); }} />);
  await userEvent.click(screen.getByRole("radio", { name: new RegExp(label) })); await userEvent.click(screen.getByRole("button", { name: `确认：${label}` }));
  expect(saved).toEqual([{ method, disposedOn: "2026-10-20" }]);
});
test("keeps an overprecise amount editable and does not send it", async () => {
  const saved: unknown[] = []; render(<DisposalSheet item={idleItem} today="2026-10-20" onClose={() => {}} submit={async (input) => { saved.push(input); }} />);
  await userEvent.click(screen.getByRole("radio", { name: /二手卖出/ })); await userEvent.type(screen.getByLabelText("售价（选填）"), "1.001"); await userEvent.click(screen.getByRole("button", { name: "确认：二手卖出" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("最多填写 2 位小数"); expect(saved).toHaveLength(0); expect(screen.getByLabelText("售价（选填）")).toHaveValue("1.001");
});
