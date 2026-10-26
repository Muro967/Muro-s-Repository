import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecreationBuilder } from "@/features/recreation/recreation-builder";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const recreation = {
  id: "50000000-0000-4000-8000-000000000001",
  inspirationId: "10000000-0000-4000-8000-000000000001",
  mode: "rules" as const,
  items: [], similarities: [], missing: ["鞋履"], createdAt: "2026-10-20T00:00:00.000Z",
};

afterEach(() => replace.mockReset());

test("creates once, disables duplicate submission and replaces with a stable result URL", async () => {
  let resolve!: (value: typeof recreation) => void;
  const create = vi.fn(() => new Promise<typeof recreation>((done) => { resolve = done; }));
  render(<RecreationBuilder inspirationId={recreation.inspirationId} create={create} />);
  const button = screen.getByRole("button", { name: "开始规则复刻" });
  await userEvent.click(button);
  expect(button).toBeDisabled();
  await userEvent.click(button);
  expect(create).toHaveBeenCalledTimes(1);
  resolve(recreation);
  expect(await screen.findByText("正在打开复刻结果…")).toBeVisible();
  expect(replace).toHaveBeenCalledWith(`/app/inspiration/${recreation.inspirationId}/recreate/${recreation.id}`);
});

test("keeps a retry action after a network failure", async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error("网络中断")).mockResolvedValueOnce(recreation);
  render(<RecreationBuilder inspirationId={recreation.inspirationId} create={create} />);
  await userEvent.click(screen.getByRole("button", { name: "开始规则复刻" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("网络中断");
  await userEvent.click(screen.getByRole("button", { name: "重试复刻" }));
  expect(create).toHaveBeenCalledTimes(2);
});
