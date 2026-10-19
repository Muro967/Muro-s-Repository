import { render, screen } from "@testing-library/react";
import WardrobePage from "@/app/(app)/app/wardrobe/page";
import WardrobesPage from "@/app/(app)/app/wardrobes/page";
import OutfitsPage from "@/app/(app)/app/outfits/page";
import InspirationPage from "@/app/(app)/app/inspiration/page";
import { LogoutButton } from "@/features/auth/logout-button";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

test.each([
  [WardrobePage, "衣橱还是空的", "下一阶段会在这里添加衣物", "衣橱"],
  [OutfitsPage, "还没有可搭配的衣物", "搭配只会使用你衣橱里的衣物", "搭配"],
  [InspirationPage, "还没有灵感图", "收集喜欢的穿搭，从这里慢慢认识自己的风格", "灵感"],
])("shows honest empty state for %s", (Page, title, description, tab) => {
  render(<Page />);
  expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  expect(screen.getByText(description)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("logs out through the server before returning to login", async () => {
  render(<LogoutButton submit={async () => ({ ok: true, value: { ok: true } })} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "退出登录" }));
  expect(replace).toHaveBeenCalledWith("/login");
});

test("opens wardrobe management from home and preserves a return route without primary tabs", async () => {
  const home = render(<WardrobePage />);
  expect(screen.getByRole("link", { name: /衣柜与分区/ })).toHaveAttribute("href", "/app/wardrobes");
  home.unmount();
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ wardrobes: [] })));
  render(<WardrobesPage />);
  expect(screen.getByRole("link", { name: "返回衣橱" })).toHaveAttribute("href", "/app/wardrobe");
  expect(screen.queryByRole("navigation", { name: "主要页面" })).not.toBeInTheDocument();
  await screen.findByRole("button", { name: "＋ 新建衣柜" });
  vi.unstubAllGlobals();
});
test("preserves retry control after a logout failure", async () => {
  render(<LogoutButton submit={async () => ({ ok: false, error: { code: "NETWORK_ERROR", message: "请检查网络连接后重试" } })} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "退出登录" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("请检查网络连接后重试");
  expect(screen.getByRole("button", { name: "退出登录" })).toBeEnabled();
});
