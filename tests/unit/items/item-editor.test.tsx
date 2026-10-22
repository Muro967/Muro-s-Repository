import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemEditor } from "@/features/items/item-editor";
import { StrictMode } from "react";

const id = "b3702bc6-e5de-45b6-92b6-1e9f8e23b130";
const uploadId = "ba27f478-48f8-48a6-8177-7a8e67d8baef";
const item = { id, name: "", categoryId: null, accessoryId: null, colorNames: [], colorHexes: [], styleIds: [], seasonIds: [], thickness: null, material: null, fit: null, length: null, formality: null, brand: null, notes: null, wardrobeId: null, zoneId: null, manualLastWornOn: null, status: "draft", original: null, addedOn: null, watchStartedOn: null, watchDueOn: null, deletedAt: null, createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => { Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() }); });
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    writes.push({ path, body: init.body ? JSON.parse(String(init.body)) : null });
    if (path.endsWith("original")) return json({ ok: true });
    return json({ item: { ...item, ...JSON.parse(String(init.body ?? "{}")) } });
  });
  return writes;
}
function choose(name = "coat.jpg") { fireEvent.change(screen.getByLabelText("从相册选择"), { target: { files: [new File(["a"], name, { type: "image/jpeg" })] } }); }

test("active edits use save-changes copy and retain active metadata after a failed save", async () => {
  let fail = true;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    if (init.method === "GET") return json({ item: { ...item, status: "active", name: "风衣" } });
    return fail ? json({ error: { code: "INTERNAL_ERROR" } }, 500) : json({ item: { ...item, status: "active", ...JSON.parse(String(init.body)) } });
  });
  render(<ItemEditor itemId={id} />);
  await screen.findByDisplayValue("风衣");
  expect(screen.queryByRole("button", { name: "保存草稿" })).not.toBeInTheDocument();
  expect(screen.queryByText(/草稿可以暂缺/)).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("名称"), "修改");
  await userEvent.click(screen.getByRole("button", { name: "保存修改" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存资料失败");
  expect(screen.getByLabelText("名称")).toHaveValue("风衣修改");
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "保存修改" }));
  expect(await screen.findByText("已保存修改")).toBeVisible();
});

test("renders a blob preview synchronously before deferred upload resolves", async () => {
  fixture(); render(<ItemEditor submitUpload={() => new Promise(() => {})} />);
  choose();
  expect(screen.getByRole("img", { name: "衣物照片预览" })).toHaveAttribute("src", "blob:preview");
  expect(screen.getByRole("status")).toHaveTextContent("正在上传");
  expect(screen.getByRole("button", { name: "保存到衣橱" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "再添加一件" })).toBeDisabled();
});

test("keeps edited fields and file while retrying attach on the same draft and upload", async () => {
  let creates = 0; let attaches = 0; let uploads = 0;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    if (path === "/api/items") creates++;
    if (path.endsWith("original")) {
      if (init.method !== "PUT") return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
      return ++attaches === 1 ? json({ error: { code: "UNAUTHORIZED" } }, 401) : json({ ok: true });
    }
    return json({ item: { ...item, ...JSON.parse(String(init.body ?? "{}")) } });
  });
  render(<ItemEditor submitUpload={async () => { uploads++; return { uploadId }; }} />);
  await userEvent.type(screen.getByLabelText("名称"), "燕麦针织开衫"); choose();
  expect(await screen.findByRole("alert")).toHaveTextContent("需要重试");
  expect(screen.getByLabelText("名称")).toHaveValue("燕麦针织开衫");
  expect(screen.getByRole("img", { name: "衣物照片预览" })).toHaveAttribute("src", "blob:preview");
  await userEvent.click(screen.getByRole("button", { name: "重试照片" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("照片已上传"));
  await userEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(await screen.findByText("已保存")).toBeVisible();
  expect({ creates, attaches, uploads }).toEqual({ creates: 1, attaches: 2, uploads: 1 });
});

test("ignores the replaced upload result and revokes previews on replacement and unmount", async () => {
  const writes = fixture(); const signals: AbortSignal[] = []; const releases: ((value: { uploadId: string }) => void)[] = [];
  let next = 0; vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:${++next}`);
  const view = render(<ItemEditor submitUpload={(_file, callbacks) => { signals.push(callbacks!.signal!); return new Promise((resolve) => releases.push(resolve)); }} />);
  choose("first.jpg"); choose("second.jpg");
  expect(signals[0].aborted).toBe(true);
  await act(async () => { releases[1]({ uploadId }); });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("照片已上传"));
  await act(async () => { releases[0]({ uploadId: id }); });
  expect(writes.filter((write) => write.path.endsWith("original"))).toEqual([{ path: `/api/items/${id}/original`, body: { uploadId } }]);
  expect(screen.getByRole("img", { name: "衣物照片预览" })).toHaveAttribute("src", "blob:2");
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
});

test("saves a draft without photo or location and keeps fields after failed save", async () => {
  let saves = 0; let creates = 0;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    if (path === "/api/items") { creates++; return json({ item }); }
    return ++saves === 1 ? json({ error: { code: "INTERNAL_ERROR" } }, 500) : json({ item: { ...item, ...JSON.parse(String(init.body)) } });
  });
  render(<ItemEditor />); await userEvent.type(screen.getByLabelText("名称"), "风衣");
  await userEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存资料失败");
  expect(screen.getByLabelText("名称")).toHaveValue("风衣");
  await userEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(await screen.findByText("已保存")).toBeVisible(); expect(creates).toBe(1);
  await userEvent.click(screen.getByRole("button", { name: "再添加一件" }));
  expect(screen.getByLabelText("名称")).toHaveValue("");
});

test("loads real item data and saves all editable metadata before activating", async () => {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const wardrobeId = "7793e9bb-6725-4393-a02a-9f228ef5a872"; const zoneId = "33e4c57a-dead-49a7-8f97-0bb8734c5d25";
  const saved = { ...item, name: "焦糖风衣", categoryId: "outerwear", colorNames: ["焦糖"], colorHexes: ["#B8977F"], wardrobeId, zoneId, original: { id: uploadId, uploadId } };
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [{ id: wardrobeId, name: "主卧衣柜", sortOrder: 0, zones: [{ id: zoneId, wardrobeId, name: "长挂区", kind: "hang", sortOrder: 0 }] }] });
    if (init.method === "GET") return json({ item: saved });
    const body = JSON.parse(String(init.body)); writes.push({ path, body });
    return json({ item: path.endsWith("activate") ? { ...saved, status: "active" } : { ...saved, ...body } });
  });
  render(<ItemEditor itemId={id} />);
  expect(await screen.findByDisplayValue("焦糖风衣")).toBeVisible();
  expect(screen.getByRole("img", { name: "衣物照片预览" })).toHaveAttribute("src", `/api/items/${id}/assets/${uploadId}/content`);
  await userEvent.type(screen.getByLabelText("材质"), "棉");
  await userEvent.click(screen.getByRole("button", { name: "保存到衣橱" }));
  expect(await screen.findByText("已保存到衣橱")).toBeVisible();
  expect(writes[0].body).toMatchObject({ name: "焦糖风衣", categoryId: "outerwear", colorNames: ["焦糖"], colorHexes: ["#B8977F"], material: "棉", wardrobeId, zoneId });
  expect(writes[1]).toEqual({ path: `/api/items/${id}/activate`, body: {} });
});

test("completion failure retries the real upload client with the same file and target", async () => {
  let creates = 0; let uploads = 0; let puts = 0; let completes = 0;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    if (path === "/api/uploads") { uploads++; return json({ uploadId, method: "PUT", url: "/local", headers: {} }); }
    if (path === "/local") { puts++; expect(init.body).toBeInstanceOf(File); return new Response(null); }
    if (path.endsWith("complete")) return ++completes === 1 ? json({ error: { code: "INTERNAL_ERROR" } }, 500) : json({ uploadId, status: "completed" });
    if (path === "/api/items") { creates++; return json({ item }); }
    return json({ ok: true });
  });
  render(<ItemEditor />); choose();
  expect(await screen.findByRole("alert")).toHaveTextContent("需要重试");
  await userEvent.click(screen.getByRole("button", { name: "重试照片" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("照片已上传"));
  expect({ creates, uploads, puts, completes }).toEqual({ creates: 1, uploads: 1, puts: 1, completes: 2 });
});

test("a stale attach finishing after replacement cannot mark the new photo uploaded", async () => {
  let releaseAttach: (() => void) | undefined; let attaches = 0;
  vi.stubGlobal("fetch", async (path: string) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    if (path === "/api/items") return json({ item });
    if (path.endsWith("original") && ++attaches === 1) await new Promise<void>((resolve) => { releaseAttach = resolve; });
    return json({ ok: true });
  });
  let uploads = 0;
  render(<ItemEditor submitUpload={async () => { if (++uploads === 1) return { uploadId }; return new Promise(() => {}); }} />);
  choose(); await waitFor(() => expect(releaseAttach).toBeDefined()); choose("new.jpg");
  await act(async () => { releaseAttach!(); });
  expect(screen.getByRole("status")).toHaveTextContent("正在上传");
});

test("starts each upload only after its new blob preview is committed, including in StrictMode", async () => {
  fixture(); let next = 0;
  vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:${++next}`);
  const observed: (string | null)[] = [];
  const view = render(<StrictMode><ItemEditor submitUpload={() => {
    observed.push(screen.queryByRole("img", { name: "衣物照片预览" })?.getAttribute("src") ?? null);
    return new Promise(() => {});
  }} /></StrictMode>);
  choose("first.jpg"); choose("second.jpg");
  await act(async () => {});
  expect(observed).toEqual(["blob:1", "blob:2"]);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
});

test("waits for an accepted old attach response before sending the replacement, even when selection aborts", async () => {
  const sent: string[] = []; let serverPhoto: string | null = null; let finishOld: (() => void) | undefined;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    if (!path.endsWith("original")) return json({ item });
    const photo = (JSON.parse(String(init.body)) as { uploadId: string }).uploadId; sent.push(photo);
    if (sent.length === 1) return new Promise<Response>((resolve, reject) => {
      // An HTTP transport abort rejects immediately, but the server can still
      // finish its accepted write. Selection changes must not trigger this.
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      finishOld = () => { serverPhoto = photo; resolve(json({ ok: true })); };
    });
    serverPhoto = photo; return json({ ok: true });
  });
  const uploaded: string[] = [];
  render(<ItemEditor submitUpload={async (file) => { uploaded.push(file.name); return { uploadId: file.name === "old.jpg" ? uploadId : id }; }} />);
  choose("old.jpg"); await waitFor(() => expect(finishOld).toBeDefined());
  choose("new.jpg"); await waitFor(() => expect(uploaded).toEqual(["old.jpg", "new.jpg"]));
  await act(async () => {});
  expect(sent).toEqual([uploadId]);
  await act(async () => { finishOld!(); });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("照片已上传"));
  expect(sent).toEqual([uploadId, id]);
  expect(serverPhoto).toBe(id);
});

test.each(["network", "malformed", "server-error"])("blocks later attaches after an unknown %s result until a read proves the old write committed", async (failure) => {
  const sent: string[] = []; let serverPhoto: string | null = null;
  let failTransport: (() => void) | undefined; let finishServer: (() => void) | undefined;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    if (init.method === "GET") return json({ item: { ...item, original: serverPhoto ? { id: uploadId, uploadId: serverPhoto } : null } });
    if (!path.endsWith("original")) return json({ item });
    const photo = (JSON.parse(String(init.body)) as { uploadId: string }).uploadId; sent.push(photo);
    if (sent.length === 1) return new Promise<Response>((resolve, reject) => {
      failTransport = () => {
        if (failure === "network") reject(new TypeError("connection lost"));
        else resolve(failure === "malformed" ? json({}) : json({ error: { code: "INTERNAL_ERROR" } }, 500));
      };
      finishServer = () => { serverPhoto = photo; };
    });
    serverPhoto = photo; return json({ ok: true });
  });
  render(<ItemEditor submitUpload={async (file) => ({ uploadId: file.name === "old.jpg" ? uploadId : id })} />);
  await userEvent.type(screen.getByLabelText("名称"), "保留的衣物资料");
  choose("old.jpg"); await waitFor(() => expect(failTransport).toBeDefined()); choose("new.jpg");
  await act(async () => { failTransport!(); });
  expect(await screen.findByRole("alert")).toHaveTextContent("照片绑定结果未确认");
  expect(sent).toEqual([uploadId]);
  expect(screen.queryByRole("button", { name: "重试照片" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("从相册选择")).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "核对服务器照片" }));
  expect(screen.getByRole("alert")).toHaveTextContent("照片绑定结果未确认");
  expect(sent).toEqual([uploadId]);
  finishServer!();
  await userEvent.click(screen.getByRole("button", { name: "核对服务器照片" }));
  await userEvent.click(await screen.findByRole("button", { name: "重试照片" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("照片已上传"));
  expect(sent).toEqual([uploadId, id]); expect(serverPhoto).toBe(id);
  expect(screen.getByLabelText("名称")).toHaveValue("保留的衣物资料");
});

test("confirms a recovered current photo without submitting the same attach again", async () => {
  let attaches = 0;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/wardrobes") return json({ wardrobes: [] });
    if (init.method === "GET") return json({ item: { ...item, original: { id, uploadId } } });
    if (path.endsWith("original")) { attaches++; throw new TypeError("response lost after commit"); }
    return json({ item });
  });
  render(<ItemEditor submitUpload={async () => ({ uploadId })} />); choose();
  expect(await screen.findByRole("alert")).toHaveTextContent("照片绑定结果未确认");
  await userEvent.click(screen.getByRole("button", { name: "核对服务器照片" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("照片已上传"));
  expect(screen.queryByRole("button", { name: "重试照片" })).not.toBeInTheDocument();
  expect(attaches).toBe(1);
});
