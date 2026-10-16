import { render, screen } from "@testing-library/react";
import RootPage from "@/app/page";

test("shows the approved brand and tagline", () => {
  render(<RootPage />);
  expect(screen.getByRole("heading", { name: "AI Wardrobe" })).toBeInTheDocument();
  expect(screen.getByText("穿你所有，爱你所穿")).toBeInTheDocument();
});
