import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationPicker, type LocationValue } from "@/features/wardrobe/location-picker";
import { wardrobes } from "./fixtures";

test("clears the previous zone on a wardrobe switch and only confirms a selected zone", async () => {
  let confirmed: LocationValue | undefined;
  function Harness() {
    const [value, setValue] = useState<LocationValue>({ wardrobeId: "w1", zoneId: "z1" });
    return <LocationPicker wardrobes={wardrobes} value={value} onChange={setValue} onConfirm={(location) => { confirmed = location; }} />;
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "次卧衣柜" }));
  expect(screen.getByRole("button", { name: "先选一个分区" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "短挂区" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "长挂区" }));
  await user.click(screen.getByRole("button", { name: "移到 次卧衣柜 › 长挂区" }));
  expect(confirmed).toEqual({ wardrobeId: "w2", zoneId: "z5" });
});

test("rejects a zone that does not belong to the selected wardrobe", () => {
  render(<LocationPicker wardrobes={wardrobes} value={{ wardrobeId: "w2", zoneId: "z1" }} onChange={() => {}} />);
  expect(screen.getByRole("button", { name: "先选一个分区" })).toBeDisabled();
});
