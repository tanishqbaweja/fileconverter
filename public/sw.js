const CACHE_NAME = "within-shell-v36";
const APP_SHELL = [
  "/",
  "/icon.svg",
  "/manifest.webmanifest",
  "/THIRD_PARTY_NOTICES.txt",
];

function isSvgQualificationAsset(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return false; }
  const segments = [];
  for (const segment of decoded.replaceAll("\\", "/").split("/")) {
    if (segment === "..") segments.pop();
    else if (segment && segment !== ".") segments.push(segment);
  }
  return segments[0]?.toLowerCase() === "engines" && segments[1]?.toLowerCase() === "svg";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("within-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.searchParams.get("test") === "1" ||
    url.pathname === "/test-validator.html" ||
    isSvgQualificationAsset(url.pathname)
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (request.mode === "navigate") {
          const fallback = await caches.match("/");
          if (fallback) return fallback;
        }
        throw error;
      }
    }),
  );
});
