import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InspirationEditor } from "@/features/inspiration/inspiration-editor";
import type { InspirationDetail } from "@/features/inspiration/inspiration-types";

const id = "10000000-0000-4000-8000-000000000001";
const created: InspirationDetail = {
  id,
  imageUrl: `/api/inspirations/${id}/image`,
  name: "秋日通勤",
  styleTags: ["法式"],
  colorNames: [],
  silhouettes: [],
  keyItems: [],
  combinations: [],
  formality: null,
  notes: null,
  confirmedFields: [],
  analysisStatus: "manual",
  analysisSource: null,
  analysisErrorCode: null,
  version: 1,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

test("previews locally, uploads first and creates the record only after completion", async () => {
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  const upload = vi.fn(async () => ({ uploadId: "20000000-0000-4000-8000-000000000001" }));
  const create = vi.fn(async () => created);
  const view = render(<InspirationEditor submitUpload={upload} client={{ create }} />);
  const file = new File(["a"], "look.jpg", { type: "image/jpeg" });
  await userEvent.upload(screen.getByLabelText("从相册添加灵感"), file);
  expect(screen.getByAltText("灵感图预览")).toHaveAttribute("src", "blob:preview");
  await userEvent.type(screen.getByLabelText("名称"), "秋日通勤");
  await userEvent.click(screen.getByRole("button", { name: "保存灵感" }));
  expect(upload).toHaveBeenCalledWith(file, "inspiration", expect.any(Object));
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    uploadId: "20000000-0000-4000-8000-000000000001",
    name: "秋日通勤",
  }), undefined);
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:preview");
});

test("keeps entered content when saving fails", async () => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  render(<InspirationEditor
    submitUpload={async () => { throw new Error("网络中断"); }}
    client={{ create: vi.fn() }}
  />);
  await userEvent.upload(
    screen.getByLabelText("从相册添加灵感"),
    new File(["a"], "look.jpg", { type: "image/jpeg" }),
  );
  await userEvent.type(screen.getByLabelText("名称"), "保留下来");
  await userEvent.click(screen.getByRole("button", { name: "保存灵感" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("网络中断");
  expect(screen.getByLabelText("名称")).toHaveValue("保留下来");
});

test("loads and saves an existing record without requiring another image", async () => {
  const read = vi.fn(async () => created);
  const update = vi.fn(async () => ({ ...created, name: "新的名称", version: 2 }));
  render(<InspirationEditor inspirationId={id} client={{ read, update }} />);
  await act(async () => {});
  expect(await screen.findByLabelText("名称")).toHaveValue("秋日通勤");
  expect(screen.getByRole("link", { name: "用我的衣服复刻" })).toHaveAttribute("href", `/app/inspiration/${id}/recreate`);
  await userEvent.clear(screen.getByLabelText("名称"));
  await userEvent.type(screen.getByLabelText("名称"), "新的名称");
  await userEvent.click(screen.getByRole("button", { name: "保存修改" }));
  expect(update).toHaveBeenCalledWith(id, expect.objectContaining({
    expectedVersion: 1,
    name: "新的名称",
  }), undefined);
});
