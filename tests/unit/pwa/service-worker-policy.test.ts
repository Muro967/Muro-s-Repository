import { readFile } from "node:fs/promises";
import vm from "node:vm";

type WorkerEvent = {
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<unknown>) => void;
  request?: Request;
};

function workerRequest(url: string, mode: string, method = "GET", credentials = "same-origin") {
  return { url, mode, method, credentials } as Request;
}

function createWorkerHarness() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const opened: string[] = [];
  const deleted: string[] = [];
  const put: string[] = [];
  const fetchOptions: Array<RequestInit | undefined> = [];
  const offlineResponse = new Response("offline shell");
  const cache = {
    addAll: async (urls: string[]) => opened.push(...urls),
    put: async (url: string) => put.push(url),
  };
  const cachesApi = {
    open: async () => cache,
    keys: async () => ["ai-wardrobe-shell-v1", "ai-wardrobe-shell-v2", "other-app-cache"],
    delete: async (name: string) => {
      deleted.push(name);
      return true;
    },
    match: async (request: Request | string) => {
      const url = typeof request === "string" ? request : new URL(request.url).pathname;
      return url === "/offline" ? offlineResponse : undefined;
    },
  };
  const networkRequests: Request[] = [];
  let networkFails = false;
  const context = {
    self: {
      location: { origin: "https://wardrobe.example" },
      addEventListener: (name: string, listener: (event: WorkerEvent) => void) => listeners.set(name, listener),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: cachesApi,
    fetch: async (request: Request, options?: RequestInit) => {
      networkRequests.push(request);
      fetchOptions.push(options);
      if (networkFails) throw new TypeError("network unavailable");
      return new Response("network");
    },
    URL,
    Promise,
  };
  return {
    listeners,
    opened,
    deleted,
    put,
    networkRequests,
    fetchOptions,
    offlineResponse,
    failNetwork: () => { networkFails = true; },
    run: async () => {
      const source = await readFile("public/sw.js", "utf8");
      vm.runInNewContext(source, context);
    },
  };
}

test("service worker precaches only the offline page and approved icons", async () => {
  const worker = createWorkerHarness();
  await worker.run();
  let installWork: Promise<unknown> | undefined;
  worker.listeners.get("install")?.({ waitUntil: (promise) => (installWork = promise) });
  await installWork;

  expect(worker.opened).toEqual([
    "/offline",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/apple-touch-icon.png",
  ]);
  expect(worker.put).toEqual([]);
});

test("public navigation uses the offline page after a network failure", async () => {
  const worker = createWorkerHarness();
  await worker.run();
  worker.failNetwork();
  let responsePromise: Promise<unknown> | undefined;
  worker.listeners.get("fetch")?.({
    request: workerRequest("https://wardrobe.example/about", "navigate", "GET", "include"),
    respondWith: (promise) => { responsePromise = promise; },
  });
  expect(responsePromise).toBeDefined();
  const response = await responsePromise;

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(200);
  expect(await (response as Response).text()).toBe("offline shell");
  expect(worker.networkRequests).toHaveLength(1);
  expect(worker.networkRequests[0]?.credentials).toBe("include");
  expect(worker.fetchOptions[0]?.cache).toBe("no-store");
  expect(worker.put).toEqual([]);
});

test("does not cache successful public navigation responses", async () => {
  const worker = createWorkerHarness();
  await worker.run();
  let responsePromise: Promise<unknown> | undefined;
  worker.listeners.get("fetch")?.({
    request: workerRequest("https://wardrobe.example/about", "navigate", "GET", "include"),
    respondWith: (promise) => { responsePromise = promise; },
  });
  expect(responsePromise).toBeDefined();
  const response = await responsePromise;

  expect((response as Response | undefined)?.status).toBe(200);
  expect(worker.put).toEqual([]);
});

test.each([
  ["/api/uploads", "navigate", "GET", "include"],
  ["/app/wardrobe", "navigate", "GET", "include"],
  ["/login", "navigate", "GET", "include"],
  ["/register", "navigate", "GET", "include"],
  ["/app/onboarding", "navigate", "GET", "include"],
  ["/private-image", "image", "GET", "same-origin"],
  ["/about", "navigate", "POST", "same-origin"],
  ["https://cdn.example/image.jpg", "image", "GET", "include"],
] as const)("does not intercept %s requests", async (path, mode, method, credentials) => {
  const worker = createWorkerHarness();
  await worker.run();
  let wasIntercepted = false;
  const url = path.startsWith("http") ? path : `https://wardrobe.example${path}`;
  worker.listeners.get("fetch")?.({
    request: workerRequest(url, mode, method, credentials),
    respondWith: () => (wasIntercepted = true),
  });

  expect(wasIntercepted).toBe(false);
  expect(worker.put).toEqual([]);
});

test("activation removes only obsolete caches owned by this app", async () => {
  const worker = createWorkerHarness();
  await worker.run();
  let activateWork: Promise<unknown> | undefined;
  worker.listeners.get("activate")?.({ waitUntil: (promise) => (activateWork = promise) });
  await activateWork;

  expect(worker.deleted).toEqual(["ai-wardrobe-shell-v1"]);
});
