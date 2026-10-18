// @vitest-environment node

import { expect, it } from "vitest";
import { readJsonBody } from "@/server/http/json";

it("returns a parse failure for an already consumed request body", async () => {
  const request = new Request("http://localhost:3000", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  await request.text();
  expect(await readJsonBody(request)).toEqual({ ok: false });
});

it("cancels an oversized body stream without buffering the remaining upload", async () => {
  let canceled = false;
  let chunksRead = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunksRead += 1;
      if (chunksRead > 100) controller.close();
      else controller.enqueue(new Uint8Array(8192));
    },
    cancel() { canceled = true; },
  });
  const request = new Request("http://localhost:3000", {
    method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half",
  } as RequestInit);
  expect(await readJsonBody(request)).toEqual({ ok: false });
  expect(canceled).toBe(true);
  expect(chunksRead).toBeLessThan(10);
});

it("rejects invalid UTF-8 instead of silently changing credentials", async () => {
  const request = new Request("http://localhost:3000", {
    method: "POST", headers: { "content-type": "application/json" },
    body: new Uint8Array([123, 34, 112, 34, 58, 34, 255, 34, 125]),
  });
  expect(await readJsonBody(request)).toEqual({ ok: false });
});

it.each([
  ["no content type", null, "{}", null],
  ["invalid declared length", "application/json", "{}", "nope"],
  ["oversized declared length", "application/json", "{}", "16385"],
  ["oversized actual body", "application/json", JSON.stringify("x".repeat(17000)), null],
  ["empty body", "application/json", "", null],
  ["malformed JSON", "application/json", "{", null],
])("rejects %s", async (_label, type, body, length) => {
  const headers = new Headers();
  if (type) headers.set("content-type", type);
  if (length) headers.set("content-length", length);
  expect(await readJsonBody(new Request("http://localhost:3000", { method: "POST", headers, body }))).toEqual({ ok: false });
});

it("reads a bounded UTF-8 JSON body with media-type parameters", async () => {
  expect(await readJsonBody(new Request("http://localhost:3000", {
    method: "POST", headers: { "content-type": "Application/JSON; charset=utf-8" }, body: '{"name":"你好"}',
  }))).toEqual({ ok: true, value: { name: "你好" } });
});
