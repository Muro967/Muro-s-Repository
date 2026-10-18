import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "@/server/http/origin";

function postRequest(headers: Record<string, string>, url = "https://wardrobe.example/api/auth/logout") {
  return new Request(url, { method: "POST", headers });
}

describe("assertSameOrigin", () => {
  it.each<Record<string, string>>([
    { origin: "https:/wardrobe.example" },
    { origin: "https://wardrobe.example/" },
    { origin: "https://wardrobe.example, https://attacker.example" },
    { origin: "https://wardrobe.example/path" },
    { host: "wardrobe.example?" },
    { "x-forwarded-host": "" },
    { "x-forwarded-proto": "" },
    { forwarded: "" },
    { forwarded: 'host="wardrobe.example;proto=https' },
    { forwarded: "proto=https;proto=https" },
    { forwarded: "host=wardrobe.example,host=attacker.example" },
    { forwarded: "proto=https;invalid key=value" },
  ])("rejects malformed authority headers %j", (headers) => {
    expect(() => assertSameOrigin(postRequest({
      origin: "https://wardrobe.example",
      host: "wardrobe.example",
      ...headers,
    }), "https://wardrobe.example")).toThrow("ORIGIN_MISMATCH");
  });

  it("rejects a state-changing request from another origin", () => {
    expect(() =>
      assertSameOrigin(
        postRequest({
          origin: "https://attacker.example",
          host: "wardrobe.example",
        }),
        "https://wardrobe.example",
      ),
    ).toThrow("ORIGIN_MISMATCH");
  });

  it.each([
    ["missing Origin", { host: "wardrobe.example" }],
    ["null Origin", { origin: "null", host: "wardrobe.example" }],
    ["host header mismatch", { origin: "https://wardrobe.example", host: "attacker.example" }],
    ["forwarded host mismatch", {
      origin: "https://wardrobe.example",
      host: "wardrobe.example",
      "x-forwarded-host": "attacker.example",
    }],
    ["forwarded scheme mismatch", {
      origin: "https://wardrobe.example",
      host: "wardrobe.example",
      "x-forwarded-proto": "http",
    }],
    ["multiple forwarded values", {
      origin: "https://wardrobe.example",
      host: "wardrobe.example",
      "x-forwarded-host": "wardrobe.example,attacker.example",
    }],
  ])("rejects %s", (_label, headers) => {
    expect(() =>
      assertSameOrigin(
        postRequest(headers as Record<string, string>),
        "https://wardrobe.example",
      ),
    ).toThrow("ORIGIN_MISMATCH");
  });

  it.each(["http://localhost:3000", "https://localhost:3000"])(
    "accepts an internal Next adapter URL %s when public authority headers match APP_URL", (internalOrigin) => {
    expect(() =>
      assertSameOrigin(
        postRequest(
          { origin: "https://wardrobe.example", host: "wardrobe.example",
            forwarded: 'for=192.0.2.10;proto=https;host="wardrobe.example"',
            "x-forwarded-host": "wardrobe.example", "x-forwarded-proto": "https" },
          `${internalOrigin}/api/auth/logout`,
        ),
        "https://wardrobe.example",
      ),
    ).not.toThrow();
  });

  it("accepts a request whose URL and all authority headers match the configured app origin", () => {
    expect(() =>
      assertSameOrigin(
        postRequest({
          origin: "https://wardrobe.example",
          host: "wardrobe.example",
          forwarded: "proto=https;host=wardrobe.example",
          "x-forwarded-host": "wardrobe.example",
          "x-forwarded-proto": "https",
        }),
        "https://wardrobe.example",
      ),
    ).not.toThrow();
  });
});
