import { uploadOriginal, uploadPrivateImage, type UploadSession } from "@/features/items/item-upload-client";

const id = "b3702bc6-e5de-45b6-92b6-1e9f8e23b130";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.unstubAllGlobals());

test("uploads the file with browser-safe signed headers and no cross-origin cookies", async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const controller = new AbortController();
  const file = new File(["photo"], "coat.jpg", { type: "image/jpeg" });
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    calls.push({ path, init });
    if (path === "/api/uploads") return json({ uploadId: id, method: "PUT", url: "https://photos.example/test", headers: { "cOnTeNt-LeNgTh": "5", "Content-Type": "image/jpeg", "If-None-Match": "*" } }, 201);
    if (path.endsWith("complete")) return json({ uploadId: id, status: "completed" });
    return new Response(null, { status: 200 });
  });
  expect(await uploadOriginal(file, { signal: controller.signal })).toEqual({ uploadId: id });
  expect(calls.map((call) => call.path)).toEqual(["/api/uploads", "https://photos.example/test", `/api/uploads/${id}/complete`]);
  const put = calls[1].init;
  expect(put.credentials).toBe("omit");
  expect(new Headers(put.headers).get("content-length")).toBeNull();
  expect(new Headers(put.headers).get("content-type")).toBe("image/jpeg");
  expect(new Headers(put.headers).get("if-none-match")).toBe("*");
  expect(put.body).toBe(file);
  expect(calls.every((call) => call.init.signal === controller.signal)).toBe(true);
});

test("retries completion on the same upload without creating or PUTting again", async () => {
  let completeAttempts = 0; const paths: string[] = []; let session: UploadSession | undefined;
  vi.stubGlobal("fetch", async (path: string) => {
    paths.push(path);
    if (path === "/api/uploads") return json({ uploadId: id, method: "PUT", url: "/local", headers: {} });
    if (path.endsWith("complete")) return ++completeAttempts === 1 ? json({ error: { code: "INTERNAL_ERROR" } }, 500) : json({ uploadId: id, status: "completed" });
    return new Response(null);
  });
  const file = new File(["a"], "a.png", { type: "image/png" });
  await expect(uploadOriginal(file, { onSession: (value) => { session = value; } })).rejects.toThrow();
  expect(await uploadOriginal(file, { session })).toEqual({ uploadId: id });
  expect(paths).toEqual(["/api/uploads", "/local", `/api/uploads/${id}/complete`, `/api/uploads/${id}/complete`]);
});

test.each([{ uploadId: id, method: "POST", url: "/bad", headers: {} }, { uploadId: "bad", method: "PUT", url: "/bad", headers: {} }])("rejects malformed upload targets before sending the file", async (target) => {
  const paths: string[] = [];
  vi.stubGlobal("fetch", async (path: string) => { paths.push(path); return json(target); });
  await expect(uploadOriginal(new File(["a"], "a.jpg", { type: "image/jpeg" }))).rejects.toThrow();
  expect(paths).toEqual(["/api/uploads"]);
});

test("same-origin local PUT uses ambient same-origin credentials without a Cookie header", async () => {
  let put: RequestInit | undefined;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/uploads") return json({ uploadId: id, method: "PUT", url: "/local", headers: { "Content-Type": "image/png" } });
    if (path === "/local") { put = init; return new Response(null); }
    return json({ uploadId: id, status: "completed" });
  });
  await uploadOriginal(new File(["a"], "a.png", { type: "image/png" }));
  expect(put?.credentials).toBe("same-origin");
  expect(new Headers(put?.headers).has("cookie")).toBe(false);
});

test("retries a failed PUT on the same target and verifies a write-once conflict with complete", async () => {
  let session: UploadSession | undefined; let puts = 0; let creates = 0;
  vi.stubGlobal("fetch", async (path: string) => {
    if (path === "/api/uploads") { creates++; return json({ uploadId: id, method: "PUT", url: "/local", headers: {} }); }
    if (path === "/local") return new Response(null, { status: ++puts === 1 ? 503 : 412 });
    return json({ uploadId: id, status: "completed" });
  });
  const file = new File(["a"], "a.jpg", { type: "image/jpeg" });
  await expect(uploadOriginal(file, { onSession: (value) => { session = value; } })).rejects.toThrow();
  expect(await uploadOriginal(file, { session })).toEqual({ uploadId: id });
  expect({ creates, puts }).toEqual({ creates: 1, puts: 2 });
});

test.each([json({ uploadId: id, status: "pending" }), json({ uploadId: "bad", status: "completed" }), json({ error: { code: "UNAUTHORIZED" } }, 401)])("rejects an unconfirmed completion response", async (completion) => {
  vi.stubGlobal("fetch", async (path: string) => path === "/api/uploads" ? json({ uploadId: id, method: "PUT", url: "/local", headers: {} }) : path === "/local" ? new Response(null) : completion);
  await expect(uploadOriginal(new File(["a"], "a.jpg", { type: "image/jpeg" }))).rejects.toThrow();
});

test("uploads inspiration images through the shared resumable flow", async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/uploads") {
      bodies.push(JSON.parse(String(init.body)));
      return json({ uploadId: id, method: "PUT", url: "/local", headers: {} });
    }
    if (path === "/local") return new Response(null);
    return json({ uploadId: id, status: "completed" });
  });
  await expect(uploadPrivateImage(
    new File(["a"], "look.jpg", { type: "image/jpeg" }),
    "inspiration",
  )).resolves.toEqual({ uploadId: id });
  expect(bodies).toEqual([{ kind: "inspiration", contentType: "image/jpeg", sizeBytes: 1 }]);
});
