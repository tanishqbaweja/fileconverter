const CACHE_NAME = "within-shell-v17";
const APP_SHELL = [
  "/",
  "/icon.svg",
  "/manifest.webmanifest",
  "/THIRD_PARTY_NOTICES.txt",
  "/engines/remux/within-remux.mjs",
  "/engines/remux/within-remux.wasm",
  "/engines/remux/within-direct.mjs",
  "/engines/remux/within-direct.wasm",
  "/engines/remux/within-mpeg4.mjs",
  "/engines/remux/within-mpeg4.wasm",
  "/engines/remux/within-webm.mjs",
  "/engines/remux/within-webm.wasm",
  "/engines/bzip2/within-bzip2.mjs",
  "/engines/bzip2/within-bzip2.wasm",
  "/engines/bzip2/build-manifest.json",
  "/engines/bzip2/LICENSE.bzip2",
  "/engines/xz/within-xz.mjs",
  "/engines/xz/within-xz.wasm",
  "/engines/xz/build-manifest.json",
  "/engines/xz/LICENSE.xz",
  "/engines/archive7z/within-archive7z.mjs",
  "/engines/archive7z/within-archive7z.wasm",
  "/engines/archive7z/build-manifest.json",
  "/engines/archive7z/LICENSE.libarchive",
  "/engines/archive7z/LICENSE.xz",
  "/engines/tiff/within-tiff.mjs",
  "/engines/tiff/within-tiff.wasm",
  "/engines/tiff/build-manifest.json",
  "/engines/tiff/LICENSE.libtiff",
  "/engines/tiff/LICENSE.libpng",
  "/engines/tiff/LICENSE.zlib",
  "/engines/tiff/LICENSE.libjpeg-turbo",
];

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
    url.pathname === "/test-validator.html"
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
