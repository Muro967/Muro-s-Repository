import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StyleManual } from "@/features/style/style-manual";

const profile = {
  preferredColors: ["米白"],
  preferredSilhouettes: ["宽松"],
  commonCombinations: ["风衣+阔腿裤"],
  formalityTendency: "通勤",
  likedExamples: ["10000000-0000-4000-8000-000000000001"],
  source: "rules" as const,
  inputVersion: "v1",
  manuallyEdited: false,
  pendingSuggestion: null,
  updatedAt: "2026-10-19T00:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test("shows only the exact threshold state before five inspirations", async () => {
  vi.stubGlobal("fetch", async () => json({ style: { validCount: 3, remaining: 2, current: null, rules: [] } }));
  render(<StyleManual />);
  expect(await screen.findByText("还差 2 张有效灵感")).toBeVisible();
  expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "返回灵感墙" })).toHaveAttribute("href", "/app/inspiration");
});

test("edits all manual sections and saves a human version", async () => {
  const calls: Array<[string, RequestInit]> = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    calls.push([path, init]);
    if (init.method === "PUT") return json({ style: { ...profile, preferredColors: ["豆沙"], manuallyEdited: true } });
    return json({ style: { validCount: 5, remaining: 0, current: profile, rules: [] } });
  });
  render(<StyleManual />);
  expect(await screen.findByRole("heading", { name: "你的风格说明书" })).toBeVisible();
  for (const label of ["偏爱色系", "偏爱廓形", "常用组合", "正式程度", "喜欢示例", "不喜欢"]) {
    expect(screen.getByText(label)).toBeVisible();
  }
  await userEvent.clear(screen.getByLabelText("偏爱色系"));
  await userEvent.type(screen.getByLabelText("偏爱色系"), "豆沙");
  await userEvent.click(screen.getByRole("button", { name: "保存说明书" }));
  expect(calls.some(([path, init]) => path === "/api/style-profile" && init.method === "PUT" && String(init.body).includes("豆沙"))).toBe(true);
});

test("shows and explicitly accepts a pending suggestion", async () => {
  let accepted = false;
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    if (init.method === "PUT") {
      accepted = true;
      return json({ style: { ...profile, preferredColors: ["灰绿"], pendingSuggestion: null } });
    }
    return json({ style: { validCount: 5, remaining: 0, current: {
      ...profile,
      manuallyEdited: true,
      pendingSuggestion: { ...profile, preferredColors: ["灰绿"] },
    }, rules: [] } });
  });
  render(<StyleManual />);
  expect(await screen.findByText("有新的整理建议")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "采用建议" }));
  expect(accepted).toBe(true);
});

test("creates, disables and deletes disliked rules", async () => {
  const rule = { id: "20000000-0000-4000-8000-000000000001", type: "text", value: "不要豹纹", enabled: true, updatedAt: "2026-10-19T00:00:00.000Z" };
  let rules: typeof rule[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/style-rules" && init.method === "POST") {
      rules = [rule];
      return json({ rule }, 201);
    }
    if (init.method === "PATCH") {
      rules = [{ ...rule, enabled: false, updatedAt: "2026-10-20T00:00:00.000Z" }];
      return json({ rule: rules[0] });
    }
    if (init.method === "DELETE") {
      rules = [];
      return json({ ok: true });
    }
    return json({ style: { validCount: 5, remaining: 0, current: profile, rules } });
  });
  render(<StyleManual />);
  await screen.findByRole("heading", { name: "你的风格说明书" });
  await userEvent.type(screen.getByLabelText("新增不喜欢规则"), "不要豹纹");
  await userEvent.click(screen.getByRole("button", { name: "添加规则" }));
  expect(await screen.findByText("不要豹纹")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "停用不要豹纹" }));
  expect(screen.getByRole("button", { name: "启用不要豹纹" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "删除不要豹纹" }));
  expect(screen.queryByText("不要豹纹")).not.toBeInTheDocument();
});
