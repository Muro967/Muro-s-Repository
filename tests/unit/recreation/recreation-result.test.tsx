import { render, screen } from "@testing-library/react";

import { RecreationResult } from "@/features/recreation/recreation-result";

const recreation = {
  id: "50000000-0000-4000-8000-000000000001",
  inspirationId: "10000000-0000-4000-8000-000000000001",
  mode: "rules" as const,
  items: [{ itemId: "30000000-0000-4000-8000-000000000001", slot: "上装", name: "米白衬衫", categoryId: "tops" as const, colorNames: ["米白"], imageUrl: "/private-shirt" }],
  similarities: ["呼应灵感里的米白", "保留极简风格"],
  missing: ["鞋履"],
  createdAt: "2026-10-20T00:00:00.000Z",
};

test("shows a rules preview with real wardrobe links, similarities and honest gaps", async () => {
  render(<RecreationResult recreationId={recreation.id} load={async () => recreation} />);
  expect(await screen.findByRole("heading", { name: "用我的衣服复刻" })).toBeVisible();
  expect(screen.getByText("规则预览")).toBeVisible();
  expect(screen.getByRole("img", { name: "米白衬衫" })).toHaveAttribute("src", "/private-shirt");
  expect(screen.getByRole("link", { name: /米白衬衫/ })).toHaveAttribute("href", `/app/items/${recreation.items[0]!.itemId}`);
  expect(screen.getByText("呼应灵感里的米白")).toBeVisible();
  expect(screen.getByText("衣柜中暂时没有接近的鞋履")).toBeVisible();
  expect(screen.getByRole("link", { name: "返回衣柜补充资料" })).toHaveAttribute("href", "/app/wardrobe");
  expect(screen.queryByText(/购买/)).not.toBeInTheDocument();
});

test("shows a retry button when loading fails", async () => {
  let reads = 0;
  render(<RecreationResult recreationId={recreation.id} load={async () => {
    if (++reads === 1) throw new Error("暂时断线");
    return recreation;
  }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("暂时断线");
  screen.getByRole("button", { name: "重新加载" }).click();
  expect(await screen.findByText("规则预览")).toBeVisible();
});
