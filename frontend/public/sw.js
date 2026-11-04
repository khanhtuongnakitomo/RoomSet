// Makes repeat visits fast and lets the sample apartment open offline. The API is never cached.
const CACHE = "roomset-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

async function store(request, response) {
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

// Pages come from the network first, so a new deploy shows at once when online.
async function page(request) {
  try {
    return await store("/index.html", await fetch(request));
  } catch {
    return (await caches.match("/index.html")) ?? Response.error();
  }
}

// Files under /assets have a hash in their name, so a cached copy is never stale.
async function fixed(request) {
  return (await caches.match(request)) ?? store(request, await fetch(request));
}

// Everything else shows the cached copy and refreshes it for next time.
async function refreshed(request, event) {
  const cached = await caches.match(request);
  const fresh = fetch(request).then((response) => store(request, response));
  if (!cached) return fresh;
  event.waitUntil(fresh.catch(() => undefined));
  return cached;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("range")) return;
  // The AR viewer fetches models itself, and the film streams, so both come straight from the network.
  if (url.pathname.startsWith("/api/") || url.pathname.endsWith(".usdz") || url.pathname.endsWith(".mp4")) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(fixed(request));
  else event.respondWith(refreshed(request, event));
});
