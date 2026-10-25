import { render, screen } from "@testing-library/react";

import { InspirationWall } from "@/features/inspiration/inspiration-wall";
import type { InspirationDetail } from "@/features/inspiration/inspiration-types";

const inspiration = (id: string, name: string): InspirationDetail => ({
  id,
  imageUrl: `/api/inspirations/${id}/image`,
  name,
  styleTags: ["法式"],
  colorNames: ["灰绿"],
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
});

test("guides an empty wardrobe toward the three supported add flows", async () => {
  render(<InspirationWall load={async () => []} />);
  expect(await screen.findByRole("heading", { name: "还没有灵感图" })).toBeVisible();
  expect(screen.getByRole("link", { name: "拍照" })).toHaveAttribute("href", "/app/inspiration/new?source=camera");
  expect(screen.getByRole("link", { name: "相册" })).toHaveAttribute("href", "/app/inspiration/new?source=album");
  expect(screen.getByRole("link", { name: "粘贴截图" })).toHaveAttribute("href", "/app/inspiration/new?source=clipboard");
});

test("renders a two-column inspiration wall and the honest five-image threshold", async () => {
  const values = [
    inspiration("10000000-0000-4000-8000-000000000001", "一"),
    inspiration("10000000-0000-4000-8000-000000000002", "二"),
  ];
  const { container } = render(<InspirationWall load={async () => values} />);
  expect(await screen.findByRole("heading", { name: "灵感墙" })).toBeVisible();
  expect(screen.getByText("再添加 3 张，就能形成你的风格说明书")).toBeVisible();
  expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  expect(container.querySelector('[data-layout="masonry"]')?.children).toHaveLength(2);
  expect(container.querySelectorAll("i")).toHaveLength(0);
});

test("shows an AI badge only for real analyzed fields", async () => {
  const ready = { ...inspiration("10000000-0000-4000-8000-000000000001", "一"), analysisStatus: "ready" as const, analysisSource: "openai" as const };
  render(<InspirationWall load={async () => [ready]} />);
  expect(await screen.findByText("AI")).toBeVisible();
});
