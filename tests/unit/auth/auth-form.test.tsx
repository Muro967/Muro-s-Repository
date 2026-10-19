import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "@/features/auth/auth-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
const account = { id: "user", email: "muro@example.com", name: "Muro", onboardingComplete: false };

async function fill(mode: "register" | "login" = "register") {
  const user = userEvent.setup();
  if (mode === "register") {
    await user.type(screen.getByLabelText("邀请码"), "wrong");
    await user.type(screen.getByLabelText("昵称"), "Muro");
  }
  await user.type(screen.getByLabelText("邮箱"), "muro@example.com");
  await user.type(screen.getByLabelText("密码"), "wardrobe-pass-2026");
  return user;
}

test("shows actionable registration errors beside the invalid field", async () => {
  render(<AuthForm mode="register" submit={async () => ({ ok: false, error: {
    code: "INVALID_INVITE", message: "邀请码无效或已过期", fields: { inviteCode: "请检查邀请码" },
  } })} />);
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "创建账号" }));
  expect(await screen.findByText("请检查邀请码")).toBeInTheDocument();
  expect(screen.getByLabelText("邀请码")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("邀请码")).toHaveAccessibleDescription("请检查邀请码");
});

test.each([["register", true, "/app/onboarding"], ["login", false, "/app/onboarding"], ["login", true, "/app/wardrobe"]] as const)(
  "%s redirects according to account state %s", async (mode, onboardingComplete, destination) => {
    render(<AuthForm mode={mode} submit={async () => ({ ok: true, value: { ...account, onboardingComplete } })} />);
    const user = await fill(mode);
    await user.click(screen.getByRole("button", { name: mode === "register" ? "创建账号" : "登录" }));
    expect(replace).toHaveBeenLastCalledWith(destination);
  },
);

test("disables duplicate submissions and sanitizes unexpected failures", async () => {
  let reject!: (reason: Error) => void;
  render(<AuthForm mode="login" submit={() => new Promise((_resolve, failure) => { reject = failure; })} />);
  const user = await fill("login");
  await user.click(screen.getByRole("button", { name: "登录" }));
  expect(screen.getByRole("button", { name: "正在登录…" })).toBeDisabled();
  reject(new Error("private-session-token"));
  expect(await screen.findByRole("alert")).toHaveTextContent("请检查网络连接后重试");
  expect(document.body).not.toHaveTextContent("private-session-token");
});

test("validates registration password by Unicode characters before sending", async () => {
  let submitted = false;
  render(<AuthForm mode="register" submit={async () => { submitted = true; return { ok: true, value: account }; }} />);
  await fill();
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "😀".repeat(9) } });
  await userEvent.setup().click(screen.getByRole("button", { name: "创建账号" }));
  expect(await screen.findByText("请使用 10–128 个字符的密码")).toBeInTheDocument();
  expect(submitted).toBe(false);
});
