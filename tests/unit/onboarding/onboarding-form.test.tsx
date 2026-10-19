import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

test("requires personal settings and defaults the first wardrobe name", () => {
  render(<OnboardingForm defaultName="Muro" submit={vi.fn()} />);
  for (const label of ["昵称", "常用城市", "发长", "发质", "第一个衣柜名称"]) {
    expect(screen.getByLabelText(label)).toBeRequired();
  }
  expect(screen.getByLabelText("第一个衣柜名称")).toHaveValue("我的衣柜");
  expect(screen.getByLabelText("昵称")).toHaveValue("Muro");
});

test("saves selected settings then opens the wardrobe", async () => {
  let received: unknown;
  render(<OnboardingForm defaultName="Muro" submit={async (input) => {
    received = input;
    return { ok: true, value: { id: "user", email: "muro@example.com", name: "Muro", onboardingComplete: true } };
  }} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("常用城市"), "上海");
  await user.selectOptions(screen.getByLabelText("发长"), "中长发");
  await user.selectOptions(screen.getByLabelText("发质"), "偏直");
  await user.clear(screen.getByLabelText("第一个衣柜名称"));
  await user.type(screen.getByLabelText("第一个衣柜名称"), "主卧衣柜");
  await user.click(screen.getByRole("button", { name: "开启我的衣橱" }));
  expect(received).toEqual({ name: "Muro", city: "上海", hairLength: "中长发", hairTexture: "偏直", wardrobeName: "主卧衣柜" });
  expect(replace).toHaveBeenCalledWith("/app/wardrobe");
});

test("keeps values and offers a sign-in link when the session expires", async () => {
  render(<OnboardingForm defaultName="Muro" submit={async () => ({ ok: false, error: { code: "UNAUTHORIZED", message: "登录已过期，请重新登录" } })} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("常用城市"), "上海");
  await user.selectOptions(screen.getByLabelText("发长"), "短发");
  await user.selectOptions(screen.getByLabelText("发质"), "卷发");
  await user.click(screen.getByRole("button", { name: "开启我的衣橱" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("登录已过期");
  expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/login");
  expect(screen.getByLabelText("常用城市")).toHaveValue("上海");
});
