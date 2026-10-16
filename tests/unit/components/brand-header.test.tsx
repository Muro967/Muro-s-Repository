import { render, screen } from "@testing-library/react";
import { BrandHeader } from "@/components/brand/brand-header";

test("renders the approved two-line brand lockup", () => {
  render(<BrandHeader />);
  expect(screen.getByRole("heading", { name: "AI Wardrobe" })).toBeInTheDocument();
  expect(screen.getByText("穿你所有，爱你所穿")).toBeInTheDocument();
});

test("renders supplied header actions accessibly", () => {
  render(<BrandHeader actions={<button>搜索衣物</button>} />);
  expect(screen.getByRole("button", { name: "搜索衣物" })).toBeInTheDocument();
});
