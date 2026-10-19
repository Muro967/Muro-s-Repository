import { fireEvent, render, screen } from "@testing-library/react";
import { PhotoPicker } from "@/features/items/photo-picker";

test("offers separate camera and album inputs and explains unsupported HEIC", () => {
  let selected: File | undefined;
  render(<PhotoPicker onSelect={(file) => { selected = file; }} />);
  expect(screen.getByLabelText("拍照")).toHaveAttribute("capture", "environment");
  expect(screen.getByLabelText("从相册选择")).not.toHaveAttribute("capture");
  fireEvent.change(screen.getByLabelText("从相册选择"), { target: { files: [new File(["a"], "a.heic", { type: "image/heic" })] } });
  expect(screen.getByRole("alert")).toHaveTextContent("HEIC");
  expect(selected).toBeUndefined();
  const file = new File(["a"], "a.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("从相册选择"), { target: { files: [file] } });
  expect(selected).toBe(file);
});
