import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InspirationPhotoPicker } from "@/features/inspiration/inspiration-photo-picker";

test("offers camera, album and clipboard entries with clear format guidance", () => {
  render(<InspirationPhotoPicker onSelect={vi.fn()} />);
  expect(screen.getByLabelText("拍照添加灵感")).toHaveAttribute("capture", "environment");
  expect(screen.getByLabelText("从相册添加灵感")).not.toHaveAttribute("capture");
  expect(screen.getByRole("button", { name: "粘贴截图" })).toBeVisible();
  expect(screen.getByText(/HEIC/)).toBeVisible();
});

test("rejects HEIC and files above 15 MB while accepting a supported album image", () => {
  const select = vi.fn();
  render(<InspirationPhotoPicker onSelect={select} />);
  const input = screen.getByLabelText("从相册添加灵感");
  fireEvent.change(input, { target: { files: [new File(["a"], "look.heic", { type: "image/heic" })] } });
  expect(screen.getByRole("alert")).toHaveTextContent("HEIC");
  const tooLarge = new File([new Uint8Array(15 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [tooLarge] } });
  expect(screen.getByRole("alert")).toHaveTextContent("15 MB");
  const image = new File(["a"], "look.webp", { type: "image/webp" });
  fireEvent.change(input, { target: { files: [image] } });
  expect(select).toHaveBeenCalledWith(image);
});

test("reads an image from the clipboard button", async () => {
  const image = new File(["a"], "pasted.png", { type: "image/png" });
  const getType = vi.fn(async () => image);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { read: vi.fn(async () => [{ types: ["image/png"], getType }]) },
  });
  const select = vi.fn();
  render(<InspirationPhotoPicker onSelect={select} />);
  await userEvent.click(screen.getByRole("button", { name: "粘贴截图" }));
  expect(select).toHaveBeenCalledWith(image);
});
