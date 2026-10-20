// @vitest-environment node
import { createItemListHandler } from "@/features/items/item-list-route";
import { itemFixture } from "../../helpers/item-fixture";
import { token } from "../../helpers/wardrobe-fixture";
vi.mock("server-only", () => ({}));
test("authenticates list reads and rejects invalid filters before serving owned projections", async () => {
 const f = await itemFixture();
 try {
  const h = createItemListHandler({ ...f, cursorKey: "test-key-with-more-than-thirty-two-characters" });
  expect((await h(new Request("http://localhost:3000/api/items"))).status).toBe(401);
  const request = (q: string) => new Request(`http://localhost:3000/api/items?${q}`, { headers: { cookie: `aiw_session=${token}` } });
  expect((await h(request("q=a&q=b"))).status).toBe(400);
  const response = await h(request("")); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ total: 0, summary: { itemCount: 0 }, facets: { accessories: {} } });
 } finally { await f.client.close(); }
});
