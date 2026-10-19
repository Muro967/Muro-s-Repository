const CACHE_NAME = "ai-wardrobe-shell-v2";
const CACHE_PREFIX = "ai-wardrobe-shell-";
const PRECACHE_URLS = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
];

function isPrivatePath(pathname) {
  return ["/api", "/app", "/login", "/register", "/onboarding", "/logout"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;
  if (request.mode !== "navigate" || request.credentials === "include") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const offlinePage = await caches.match("/offline");
      return offlinePage || Response.error();
    }),
  );
});
