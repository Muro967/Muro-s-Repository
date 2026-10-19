import { useRef, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "@/components/overlays/bottom-sheet";

function Harness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>打开分区</button><BottomSheet open={open} title="编辑分区" onClose={() => setOpen(false)}><label>分区名称<input data-sheet-autofocus /></label><button>保存分区</button></BottomSheet></>;
}

test("names the dialog, focuses its field, and makes the background inert while locking scroll", async () => {
  const { container } = render(<Harness />);
  document.body.style.overflow = "auto";
  await userEvent.click(screen.getByRole("button", { name: "打开分区" }));
  const dialog = screen.getByRole("dialog", { name: "编辑分区" });
  expect(within(dialog).getByRole("textbox")).toHaveFocus();
  expect(container).toHaveAttribute("inert");
  expect(document.body.style.overflow).toBe("hidden");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(container).not.toHaveAttribute("inert");
  expect(document.body.style.overflow).toBe("auto");
  expect(screen.getByRole("button", { name: "打开分区" })).toHaveFocus();
  document.body.style.overflow = "";
});

test("wraps keyboard focus inside the sheet and closes from the backdrop", async () => {
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "打开分区" }));
  const close = screen.getByRole("button", { name: "关闭编辑分区" });
  screen.getByRole("button", { name: "保存分区" }).focus();
  expect(screen.getByRole("button", { name: "保存分区" })).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "保存分区" })).toHaveFocus();
  await user.click(screen.getByTestId("sheet-backdrop"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开分区" })).toHaveFocus();
});

test.each(["removed", "disabled", "hidden"])("restores a usable fallback when the original trigger is %s", async (unavailable) => {
  function FallbackHarness() {
    const [open, setOpen] = useState(false);
    const [changed, setChanged] = useState(false);
    const fallback = useRef<HTMLButtonElement>(null);
    return <>{!(changed && unavailable === "removed") && <button hidden={changed && unavailable === "hidden"} disabled={changed && unavailable === "disabled"} onClick={() => setOpen(true)}>删除分区</button>}
      <button ref={fallback}>添加分区</button>
      <BottomSheet open={open} title="删除分区" onClose={() => setOpen(false)} fallbackFocusRef={fallback}><button onClick={() => { setChanged(true); setOpen(false); }}>确认删除</button></BottomSheet>
    </>;
  }
  render(<FallbackHarness />);
  await userEvent.click(screen.getByRole("button", { name: "删除分区" }));
  await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
  expect(screen.getByRole("button", { name: "添加分区" })).toHaveFocus();
});
