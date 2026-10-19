import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WardrobeManager } from "@/features/wardrobe/wardrobe-manager";
import { wardrobes } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

function apiFixture() {
  let tree = structuredClone(wardrobes);
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (init.method === "GET") return new Response(JSON.stringify({ wardrobes: tree }));
    writes.push({ method: init.method!, path, body });
    if (init.method === "PATCH") tree = tree.map((w) => ({ ...w, name: path === `/api/wardrobes/${w.id}` ? String(body.name) : w.name, zones: w.zones.map((z) => ({ ...z, name: path === `/api/zones/${z.id}` ? String(body.name) : z.name })) }));
    if (path === "/api/wardrobes" && init.method === "POST") { const wardrobe = { id: "w3", name: String(body.name), sortOrder: 2, zones: [] }; tree.push(wardrobe); return new Response(JSON.stringify({ wardrobe }), { status: 201 }); }
    if (path === "/api/wardrobes/w1/zones" && init.method === "POST") { const zone = { id: "z6", wardrobeId: "w1", name: String(body.name), kind: body.kind as "drawer", sortOrder: 4 }; tree[0].zones.push(zone); return new Response(JSON.stringify({ zone }), { status: 201 }); }
    if (path.endsWith("reorder")) {
      const ids = body.orderedIds as string[];
      if (path === "/api/wardrobes/reorder") tree.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      else tree[0].zones.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    }
    if (init.method === "DELETE") {
      if (!body.destinationZoneId) return new Response(JSON.stringify({ error: { code: "LOCATION_REQUIRED" } }), { status: 409 });
      if (path === "/api/wardrobes/w1") tree = tree.filter((w) => w.id !== "w1");
      else tree[0].zones = tree[0].zones.filter((z) => path !== `/api/zones/${z.id}`);
    }
    return new Response(JSON.stringify({ ok: true }));
  });
  return writes;
}

test("loads cabinet zones and shows an honest unavailable garment list without invented counts", async () => {
  apiFixture();
  render(<WardrobeManager />);
  expect(await screen.findByRole("button", { name: "主卧衣柜 4 个分区" })).toHaveAttribute("aria-pressed", "true");
  const cabinet = screen.getByRole("group", { name: "主卧衣柜的分区" });
  expect(within(cabinet).getAllByRole("button")).toHaveLength(4);
  await userEvent.click(within(cabinet).getByRole("button", { name: "抽屉，抽屉" }));
  expect(screen.getByRole("heading", { name: "主卧衣柜 › 抽屉" })).toBeInTheDocument();
  expect(screen.getByText("衣物列表暂不可列出")).toBeInTheDocument();
  expect(screen.queryByText(/穿过.*次/)).not.toBeInTheDocument();
});

test("creates a wardrobe only after the server accepts the form", async () => {
  const writes = apiFixture();
  render(<WardrobeManager />);
  await screen.findByRole("button", { name: "＋ 新建衣柜" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "＋ 新建衣柜" }));
  await user.type(screen.getByRole("textbox", { name: "衣柜名称" }), "换季收纳箱");
  await user.click(screen.getByRole("button", { name: "保存衣柜" }));
  expect(await screen.findByRole("button", { name: "换季收纳箱 0 个分区" })).toHaveAttribute("aria-pressed", "true");
  expect(writes).toContainEqual({ method: "POST", path: "/api/wardrobes", body: { name: "换季收纳箱" } });
});

test("creates and renames zones through keyboard accessible controls", async () => {
  const writes = apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "＋ 添加分区" }));
  await user.type(screen.getByRole("textbox", { name: "分区名称" }), "袜子抽屉");
  await user.selectOptions(screen.getByRole("combobox", { name: "分区类型" }), "drawer");
  await user.click(screen.getByRole("button", { name: "保存分区" }));
  await screen.findByRole("button", { name: "袜子抽屉，抽屉" });
  expect(screen.getByRole("button", { name: "＋ 添加分区" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "编辑分区" }));
  await user.click(screen.getByRole("button", { name: "改名短挂区" }));
  await user.clear(screen.getByRole("textbox", { name: "分区名称" }));
  await user.type(screen.getByRole("textbox", { name: "分区名称" }), "外套挂区");
  await user.click(screen.getByRole("button", { name: "保存分区" }));
  expect(await screen.findByRole("button", { name: "外套挂区，挂衣区" })).toBeInTheDocument();
  expect(writes).toContainEqual({ method: "POST", path: "/api/wardrobes/w1/zones", body: { name: "袜子抽屉", kind: "drawer" } });
  expect(writes).toContainEqual({ method: "PATCH", path: "/api/zones/z1", body: { name: "外套挂区" } });
});

test("reorders wardrobes and zones with buttons and keeps the selected zone", async () => {
  const writes = apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "编辑分区" }));
  await user.click(screen.getByRole("button", { name: "下移短挂区" }));
  await waitFor(() => expect(screen.getByRole("group", { name: "主卧衣柜的分区" }).querySelector("button")).toHaveAccessibleName("叠放层，层板"));
  await user.click(screen.getByRole("button", { name: "后移主卧衣柜" }));
  await waitFor(() => expect(screen.getByRole("group", { name: "选择衣柜" }).querySelector("button")).toHaveTextContent("次卧衣柜"));
  expect(screen.getByRole("heading", { name: "主卧衣柜 › 短挂区" })).toBeInTheDocument();
  expect(writes).toContainEqual({ method: "POST", path: "/api/wardrobes/w1/zones/reorder", body: { orderedIds: ["z2", "z1", "z3", "z4"] } });
  expect(writes).toContainEqual({ method: "POST", path: "/api/wardrobes/reorder", body: { orderedIds: ["w2", "w1"] } });
});

test.each(["分区", "衣柜"])("requires a legal relocation before deleting a nonempty %s", async (kind) => {
  const writes = apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "编辑分区" }));
  await user.click(screen.getByRole("button", { name: kind === "分区" ? "删除短挂区" : "删除主卧衣柜" }));
  await user.click(screen.getByRole("button", { name: `确认删除${kind}` }));
  const sheet = await screen.findByRole("dialog", { name: /先安置衣物/ });
  expect(within(sheet).getByRole("button", { name: /关闭先安置衣物/ })).toHaveFocus();
  expect(within(sheet).queryByRole("button", { name: "短挂区" })).not.toBeInTheDocument();
  if (kind === "衣柜") expect(within(sheet).queryByRole("button", { name: "主卧衣柜" })).not.toBeInTheDocument();
  await user.click(within(sheet).getByRole("button", { name: "次卧衣柜" }));
  expect(within(sheet).getByRole("button", { name: "先选一个分区" })).toBeDisabled();
  await user.click(within(sheet).getByRole("button", { name: "长挂区" }));
  await user.click(within(sheet).getByRole("button", { name: "移到 次卧衣柜 › 长挂区" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "＋ 添加分区" })).toHaveFocus();
  expect(writes.at(-1)).toEqual({ method: "DELETE", path: kind === "分区" ? "/api/zones/z1" : "/api/wardrobes/w1", body: { destinationZoneId: "z5" } });
});

test("keeps a failed save open with its name intact and offers session recovery", async () => {
  apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "＋ 新建衣柜" }));
  await user.type(screen.getByRole("textbox", { name: "衣柜名称" }), "备用衣柜");
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 }));
  await user.click(screen.getByRole("button", { name: "保存衣柜" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("登录已过期");
  expect(screen.getByRole("textbox", { name: "衣柜名称" })).toHaveValue("备用衣柜");
  expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("button", { name: "保存衣柜" })).toBeEnabled();
});

test("shows a retry action when the wardrobe tree cannot load", async () => {
  vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); }); render(<WardrobeManager />);
  expect(await screen.findByRole("alert")).toHaveTextContent("网络");
  apiFixture(); await userEvent.click(screen.getByRole("button", { name: "重试加载" }));
  expect(await screen.findByRole("button", { name: "主卧衣柜 4 个分区" })).toBeInTheDocument();
});

test("renames a wardrobe and removes an empty zone after server confirmation", async () => {
  const writes = apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "编辑分区" }));
  await user.click(screen.getByRole("button", { name: "改名主卧衣柜" }));
  await user.clear(screen.getByRole("textbox", { name: "衣柜名称" }));
  await user.type(screen.getByRole("textbox", { name: "衣柜名称" }), "卧室衣柜");
  await user.click(screen.getByRole("button", { name: "保存衣柜" }));
  await screen.findByRole("button", { name: "卧室衣柜 4 个分区" });
  expect(writes).toContainEqual({ method: "PATCH", path: "/api/wardrobes/w1", body: { name: "卧室衣柜" } });
  await user.click(screen.getByRole("button", { name: "删除短挂区" }));
  const remaining = structuredClone(wardrobes); remaining[0].name = "卧室衣柜"; remaining[0].zones.shift();
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => new Response(JSON.stringify(init.method === "GET" ? { wardrobes: remaining } : { ok: true })));
  await user.click(screen.getByRole("button", { name: "确认删除分区" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "短挂区，挂衣区" })).not.toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "卧室衣柜 › 叠放层" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "＋ 添加分区" })).toHaveFocus();
});

test("keeps the existing order when a reorder is rejected", async () => {
  apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "编辑分区" }));
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 }));
  await user.click(screen.getByRole("button", { name: "下移短挂区" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("已不存在");
  expect(screen.getByRole("group", { name: "主卧衣柜的分区" }).querySelector("button")).toHaveAccessibleName("短挂区，挂衣区");
  expect(screen.getByRole("button", { name: "下移短挂区" })).toBeEnabled();
});

test("prevents deletion when no legal relocation destination exists", async () => {
  const tree = [{ ...wardrobes[0], zones: [wardrobes[0].zones[0]] }];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => new Response(JSON.stringify(init.method === "GET" ? { wardrobes: tree } : { error: { code: "LOCATION_REQUIRED" } }), { status: init.method === "GET" ? 200 : 409 }));
  render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "编辑分区" }));
  await user.click(screen.getByRole("button", { name: "删除短挂区" }));
  await user.click(screen.getByRole("button", { name: "确认删除分区" }));
  await screen.findByRole("dialog", { name: /先安置衣物/ });
  expect(screen.getByRole("button", { name: "先选一个分区" })).toBeDisabled();
  expect(screen.getByText(/没有可用的目标分区/)).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "短挂区，挂衣区" })).toBeInTheDocument();
});

test("distinguishes a saved mutation from a failed refresh so users do not submit it twice", async () => {
  apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "＋ 新建衣柜" }));
  await user.type(screen.getByRole("textbox", { name: "衣柜名称" }), "备用衣柜");
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    if (init.method === "GET") throw new TypeError("offline");
    return new Response(JSON.stringify({ wardrobe: { id: "w3", name: "备用衣柜", sortOrder: 2, zones: [] } }));
  });
  await user.click(screen.getByRole("button", { name: "保存衣柜" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("修改已保存，但列表未能更新");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "备用衣柜 0 个分区" })).not.toBeInTheDocument();
});

test("keeps the sheet open during refresh then restores the enabled trigger", async () => {
  apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "＋ 新建衣柜" }));
  await user.type(screen.getByRole("textbox", { name: "衣柜名称" }), "备用衣柜");
  let releaseRefresh: (value: Response) => void = () => {};
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => init.method === "GET" ? new Promise<Response>((resolve) => { releaseRefresh = resolve; }) : new Response(JSON.stringify({ wardrobe: { id: "w3", name: "备用衣柜", sortOrder: 2, zones: [] } })));
  await user.click(screen.getByRole("button", { name: "保存衣柜" }));
  expect(screen.getByRole("dialog", { name: "新建衣柜" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "正在保存…" })).toBeDisabled();
  releaseRefresh(new Response(JSON.stringify({ wardrobes })));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "＋ 新建衣柜" })).toHaveFocus();
});

test.each(["old snapshot", "old error"])("ignores a retry GET's %s when it arrives after a saved rename", async (lateResult) => {
  apiFixture(); render(<WardrobeManager />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "编辑分区" }));
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 }));
  await user.click(screen.getByRole("button", { name: "下移短挂区" }));
  await screen.findByRole("alert");

  const savedTree = structuredClone(wardrobes);
  let releaseOldRead: (response: Response) => void = () => {};
  let reads = 0;
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    if (init.method === "GET") {
      reads += 1;
      if (reads === 1) return new Promise<Response>((resolve) => { releaseOldRead = resolve; });
      return new Response(JSON.stringify({ wardrobes: savedTree }));
    }
    savedTree[0].zones[0].name = (JSON.parse(String(init.body)) as { name: string }).name;
    return new Response(JSON.stringify({ ok: true }));
  });
  await user.click(screen.getByRole("button", { name: "重试加载" }));
  expect(screen.getByRole("status")).toHaveTextContent("正在打开衣柜");
  await user.click(screen.getByRole("button", { name: "改名短挂区" }));
  await user.clear(screen.getByRole("textbox", { name: "分区名称" }));
  await user.type(screen.getByRole("textbox", { name: "分区名称" }), "外套挂区");
  await user.click(screen.getByRole("button", { name: "保存分区" }));
  await screen.findByRole("button", { name: "外套挂区，挂衣区" });
  await act(async () => {
    releaseOldRead(lateResult === "old snapshot" ? new Response(JSON.stringify({ wardrobes })) : new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 }));
  });
  expect(screen.getByRole("button", { name: "外套挂区，挂衣区" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "短挂区，挂衣区" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("已保存");
});
