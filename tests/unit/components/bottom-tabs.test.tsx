import { render, screen } from "@testing-library/react";
import { BottomTabs } from "@/components/navigation/bottom-tabs";

test("marks exactly one of the four tabs as current", () => {
  render(<BottomTabs activeTab="wardrobe" />);
  expect(screen.getAllByRole("link")).toHaveLength(4);
  expect(screen.getByRole("link", { name: "衣橱" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "搭配" })).not.toHaveAttribute("aria-current");
  expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
});

test("links to each primary page and updates the active tab", () => {
  const { rerender } = render(<BottomTabs activeTab="wardrobe" />);
  expect(screen.getByRole("navigation", { name: "主要页面" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "衣橱" })).toHaveAttribute("href", "/app/wardrobe");
  expect(screen.getByRole("link", { name: "搭配" })).toHaveAttribute("href", "/app/outfits");
  expect(screen.getByRole("link", { name: "灵感" })).toHaveAttribute("href", "/app/inspiration");
  expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute("href", "/app/profile");

  rerender(<BottomTabs activeTab="profile" />);
  expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "衣橱" })).not.toHaveAttribute("aria-current");
});
