import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemGrid } from "@/features/items/item-grid";
import { browserResponseSchema } from "@/features/items/item-browser-contract";
import { browserItem, browserResponse, browserWardrobes, json } from "../../helpers/item-browser-fixture";

afterEach(() => vi.unstubAllGlobals());
test("each move opening discards the previous destination while the new locations load or fail", async () => {
  let reads = 0; let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", async () => ++reads === 1 ? json({ wardrobes: browserWardrobes }) : new Promise<Response>((resolve) => { finish = resolve; }));
  render(<ItemGrid items={browserResponseSchema.parse(browserResponse).items} onChanged={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "管理燕麦针织开衫" }));
  await userEvent.click(screen.getByRole("button", { name: "移动衣物" }));
  await userEvent.selectOptions(screen.getByLabelText("目标分区"), browserItem.zoneId);
  expect(screen.getByRole("button", { name: "确认移动" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: /关闭移动/ }));
  await userEvent.click(screen.getByRole("button", { name: "管理燕麦针织开衫" }));
  await userEvent.click(screen.getByRole("button", { name: "移动衣物" }));
  expect(screen.getByRole("button", { name: "确认移动" })).toBeDisabled();
  expect(screen.getByLabelText("目标分区")).toHaveValue("");
  expect(screen.queryByRole("option", { name: "短挂区" })).not.toBeInTheDocument();
  await act(async () => { finish(json({}, 500)); });
  expect(await screen.findByRole("alert")).toHaveTextContent("位置加载失败");
  expect(screen.getByRole("button", { name: "确认移动" })).toBeDisabled();
});
